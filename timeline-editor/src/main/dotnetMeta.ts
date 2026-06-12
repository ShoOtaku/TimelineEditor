// ============================================================
// Pure TypeScript .NET PE / CLI Metadata Reader
// Reads .NET DLL type/field/property definitions without any
// external tools — parses ECMA-335 binary format directly.
// ============================================================

import { readFile } from 'fs/promises'

// --- ECMA-335 constants ---

const CLI_SIGNATURE = 0x424A5342 // 'BSJB'
const TABLE_TYPE_DEF = 0x02
const TABLE_TYPEREF = 0x01
const TABLE_FIELD = 0x04
const TABLE_PROPERTY = 0x17
const TABLE_PROPERTY_MAP = 0x15
const TABLE_ASSEMBLY = 0x20
const TABLE_INTERFACE_IMPL = 0x09
const TABLE_CONSTANT = 0x0B
const TABLE_ASSEMBLY_REF = 0x23

// Element types in blob signatures (ECMA-335 §II.23.1.16)
const ELEMENT_TYPE_BOOLEAN = 0x02
const ELEMENT_TYPE_CHAR = 0x03
const ELEMENT_TYPE_I1 = 0x04
const ELEMENT_TYPE_U1 = 0x05
const ELEMENT_TYPE_I2 = 0x06
const ELEMENT_TYPE_U2 = 0x07
const ELEMENT_TYPE_I4 = 0x08
const ELEMENT_TYPE_U4 = 0x09
const ELEMENT_TYPE_I8 = 0x0A
const ELEMENT_TYPE_U8 = 0x0B
const ELEMENT_TYPE_R4 = 0x0C
const ELEMENT_TYPE_R8 = 0x0D
const ELEMENT_TYPE_STRING = 0x0E
const ELEMENT_TYPE_OBJECT = 0x1C
const ELEMENT_TYPE_SZARRAY = 0x1D
const ELEMENT_TYPE_GENERICINST = 0x15
const ELEMENT_TYPE_VALUETYPE = 0x11
const ELEMENT_TYPE_CLASS = 0x12

// TypeDef flags (ECMA-335 §II.23.1.15)
const TD_FLAG_INTERFACE = 0x00000020

// Field flags
const FIELD_FLAG_STATIC = 0x0010
const FIELD_FLAG_LITERAL = 0x0040 // enum constant values have this

// TypeDefOrRef coded-index table list
const TYPE_DEF_OR_REF_TABLES = [TABLE_TYPE_DEF, TABLE_TYPEREF, 0x1B] // 0x1B = TypeSpec

// --- Field decode result ---

interface DecodedFieldType {
  kind: 'boolean' | 'number' | 'string' | 'object'
  typeName?: string
  enumValues?: { name: string; value: number }[]
}

// --- Result types ---

export interface AcrMetaType {
  $type: string
  displayName: string
  assemblyName: string
  kind: 'condition' | 'action'
  fields: { key: string; type: 'boolean' | 'number' | 'string' | 'object'; typeName?: string; enumValues?: { name: string; value: number }[] }[]
  /** Interfaces this type implements (e.g. ["AEAssist.CombatRoutine.Trigger.ITriggerAction"]) */
  interfaces?: string[]
  /** Base class name (from Extends in TypeDef) */
  baseType?: string
  /** All string literals from the DLL's #US heap (for QT key discovery) */
  allStrings?: string[]
}

// ============================================================
// Binary reader helpers
// ============================================================

class BinReader {
  buf: Buffer
  off: number
  constructor(buf: Buffer, off = 0) { this.buf = buf; this.off = off }
  u8() { return this.buf.readUInt8(this.off++) }
  u16() { const v = this.buf.readUInt16LE(this.off); this.off += 2; return v }
  u32() { const v = this.buf.readUInt32LE(this.off); this.off += 4; return v }
  u64() { const v = this.buf.readBigUInt64LE(this.off); this.off += 8; return v }
  skip(n: number) { this.off += n }
  bytes(n: number) { const b = this.buf.subarray(this.off, this.off + n); this.off += n; return b }
  tell() { return this.off }
}

function readNullTerminatedUTF8(buf: Buffer, off: number): string {
  let end = off
  while (end < buf.length && buf[end] !== 0) end++
  return buf.toString('utf-8', off, end)
}

// ============================================================
// Main entry: read DLL and extract ACR types
// ============================================================

export async function readAcrDll(dllPath: string): Promise<AcrMetaType[]> {
  const buf = await readFile(dllPath)
  return parseDotNetAssembly(buf)
}

// ============================================================
// PE header parsing
// ============================================================

function parseDotNetAssembly(buf: Buffer): AcrMetaType[] {
  const r = new BinReader(buf)

  // DOS header
  if (r.u16() !== 0x5A4D) throw new Error('Not a PE file (missing MZ)')
  r.skip(58)
  const peOffset = r.u32() // e_lfanew

  // PE signature
  r.off = peOffset
  if (r.u32() !== 0x4550) throw new Error('Invalid PE signature')
  // COFF header
  r.skip(2) // Machine
  r.skip(2) // NumberOfSections
  r.skip(12) // TimeDateStamp + SymbolTable + NumberOfSymbols
  const optHeaderSize = r.u16()
  r.skip(2) // Characteristics

  // Optional header - find CLI header
  const optStart = r.tell()
  const magic = r.u16() // PE32 or PE32+
  r.off = optStart + optHeaderSize

  // Data directories
  const numDirs = r.u32()
  const dirs: { rva: number; size: number }[] = []
  for (let i = 0; i < numDirs; i++) {
    dirs.push({ rva: r.u32(), size: r.u32() })
  }

  // CLI header is data directory index 14 (IMAGE_DIRECTORY_ENTRY_COM_DESCRIPTOR)
  const cliDir = dirs[14]
  if (!cliDir || cliDir.rva === 0 || cliDir.size === 0) {
    throw new Error('No CLI header found — not a .NET assembly')
  }

  // Resolve RVA → file offset
  const sections: { name: string; virtualAddress: number; virtualSize: number; rawOffset: number; rawSize: number }[] = []
  r.off = optStart + magic === 0x20B ? 108 : 92 + optHeaderSize
  const sectionCount = r.u16()
  r.off = optStart + optHeaderSize
  for (let i = 0; i < sectionCount; i++) {
    sections.push({
      name: r.bytes(8).toString('utf-8').replace(/\0/g, ''),
      virtualSize: r.u32(),
      virtualAddress: r.u32(),
      rawSize: r.u32(),
      rawOffset: r.u32(),
    })
    r.skip(16) // Relocations, LineNumbers, Characteristics
  }

  function rvaToOffset(rva: number): number {
    for (const sec of sections) {
      if (rva >= sec.virtualAddress && rva < sec.virtualAddress + sec.virtualSize) {
        return rva - sec.virtualAddress + sec.rawOffset
      }
    }
    throw new Error(`Cannot resolve RVA 0x${rva.toString(16)}`)
  }

  // Read CLI header
  r.off = rvaToOffset(cliDir.rva)
  r.skip(4) // cb
  r.skip(4) // MajorRuntimeVersion + Minor + Metadata + Flags + EntryPointToken
  const metaRva = r.u32()
  const metaSize = r.u32()
  r.skip(8) // Resources + StrongName
  if (metaRva === 0) throw new Error('No metadata in assembly')

  // Read metadata root
  r.off = rvaToOffset(metaRva)
  const magicSig = r.u32()
  if (magicSig !== CLI_SIGNATURE) throw new Error('Invalid metadata signature')
  r.skip(8) // MajorVersion + MinorVersion + Reserved + VersionLength
  const versionLen = r.u32()
  const versionStr = r.bytes(versionLen).toString('utf-8')
  r.skip(2) // Flags + padding
  const numStreams = r.u16()

  // Parse stream headers
  interface StreamInfo { offset: number; size: number; name: string }
  const streams: StreamInfo[] = []
  for (let i = 0; i < numStreams; i++) {
    const soff = r.u32()
    const ssize = r.u32()
    const sname = readNullTerminatedUTF8(buf, r.tell())
    r.off += Math.ceil((sname.length + 1) / 4) * 4
    streams.push({ offset: metaRva + soff, size: ssize, name: sname })
  }

  const tablesStream = streams.find(s => s.name === '#~')
  const stringsStream = streams.find(s => s.name === '#Strings')
  const blobStream = streams.find(s => s.name === '#Blob')
  const usStream = streams.find(s => s.name === '#US')

  if (!tablesStream || !stringsStream) throw new Error('Missing #~ or #Strings stream')

  // Parse #~ stream header
  r.off = rvaToOffset(tablesStream.offset)
  r.skip(4) // Reserved
  const majorVer = r.u8()
  r.skip(1) // minor
  const heapSizes = r.u8()
  r.skip(1) // Reserved
  const valid = r.u64() // bitmask of present tables
  const sorted = r.u64()

  const hasTable = (bit: number) => (valid & (1n << BigInt(bit))) !== 0n

  // Row counts for present tables
  const rowCounts: number[] = new Array(64).fill(0)
  let tableIdx = 0
  for (let i = 0; i < 64; i++) {
    if (hasTable(i)) {
      rowCounts[i] = r.u32()
      tableIdx++
    }
  }

  const stringIdxSize = (heapSizes & 1) ? 4 : 2
  const guidIdxSize = (heapSizes & 2) ? 4 : 2
  const blobIdxSize = (heapSizes & 4) ? 4 : 2

  // Compute table offsets within #~ stream
  function tableOffset(tableId: number): number {
    let off = 24 // after stream header
    for (let i = 0; i < tableId; i++) {
      if (hasTable(i)) {
        off += rowCounts[i] * tableRowSize(i)
      }
    }
    return off
  }

  function tableRowSize(tableId: number): number {
    switch (tableId) {
      case TABLE_TYPE_DEF: return 14 // Flags(4) + Name(string) + Namespace(string) + Extends(coded2) + FieldList(Field) + MethodList(MethodDef)
      case TABLE_TYPEREF: return 12 // ResolutionScope(coded) + TypeName(string) + TypeNamespace(string)
      case TABLE_FIELD: return 6 // Flags(2) + Name(string) + Signature(blob)
      case TABLE_PROPERTY: return 6 // Flags(2) + Name(string) + Type(blob)
      case TABLE_PROPERTY_MAP: return 4 // Parent(TypeDef) + PropertyList(Property)
      case TABLE_INTERFACE_IMPL: return 4 // Class(TypeDef) + Interface(coded TypeDefOrRef)
      case TABLE_CONSTANT: return 6 + blobIdxSize // Type(1+1) + Padding(1) + Parent(coded HasConstant) + Value(blob)
      case TABLE_ASSEMBLY: return 22 + 4 + 4 + 4 + 4 + blobIdxSize + stringIdxSize + blobIdxSize
      case TABLE_ASSEMBLY_REF: return 12 + blobIdxSize + stringIdxSize + stringIdxSize + blobIdxSize
      default: return 0
    }
  }

  function codedIdxWidth(tables: number[]): number {
    // Coded index width: 2 bytes if total rows across all referenced tables < 2^(16-tagBits)
    let totalRows = 0
    for (const t of tables) {
      totalRows += rowCounts[t] || 0
    }
    const tagBits = Math.ceil(Math.log2(Math.max(tables.length, 1)))
    const threshold = 1 << (16 - tagBits)
    return totalRows < threshold ? 2 : 4
  }

  // --- Read Assembly name ---
  let assemblyName = 'Unknown'
  if (hasTable(TABLE_ASSEMBLY)) {
    const asmOff = tableOffset(TABLE_ASSEMBLY)
    r.off = rvaToOffset(tablesStream.offset) + asmOff
    r.skip(22) // HashAlgId + version numbers + flags
    // PublicKey (blob), Name (string), Culture (string)
    const blobIdx = blobIdxSize === 4 ? r.u32() : r.u16()
    r.skip(blobIdxSize) // skip PublicKey
    const nameIdx = stringIdxSize === 4 ? r.u32() : r.u16()
    assemblyName = readFromStringsHeap(stringsStream, nameIdx, buf)
  }

  // --- Build PropertyMap lookup: typeDefRow → first property index ---
  const propertyMap: Map<number, number> = new Map()
  if (hasTable(TABLE_PROPERTY_MAP) && hasTable(TABLE_PROPERTY)) {
    const pmOff = tableOffset(TABLE_PROPERTY_MAP)
    r.off = rvaToOffset(tablesStream.offset) + pmOff
    for (let i = 0; i < rowCounts[TABLE_PROPERTY_MAP]; i++) {
      const parent = r.u16() | (r.u16() << 16) // coded TypeDef index (simple, table 0)
      const propList = r.u16() | (r.u16() << 16) // Field table index
      propertyMap.set(parent, propList)
    }
  }

  // --- Read TypeDef table ---
  const types: { name: string; namespace: string; fieldList: number; methodList: number; extendsCoded: number; flags: number }[] = []
  const tdOff = tableOffset(TABLE_TYPE_DEF)
  r.off = rvaToOffset(tablesStream.offset) + tdOff

  const typeRows: { r: BinReader; flags: number; nameIdx: number; nsIdx: number }[] = []

  for (let i = 0; i < rowCounts[TABLE_TYPE_DEF]; i++) {
    const start = r.tell()
    const flags = r.u32()
    const nameIdx = stringIdxSize === 4 ? r.u32() : r.u16()
    const nsIdx = stringIdxSize === 4 ? r.u32() : r.u16()
    // Extends is a TypeDefOrRef coded index — save it for enum/base detection
    const codedIdxSize = codedIdxWidth(TYPE_DEF_OR_REF_TABLES)
    const extendsCoded = codedIdxSize === 4 ? r.u32() : r.u16()
    const fieldList = r.u16() | (r.u16() << 16)
    const methodList = r.u16() | (r.u16() << 16)
    typeRows.push({ r: new BinReader(buf, start), flags, nameIdx, nsIdx })
    const name = readFromStringsHeap(stringsStream, nameIdx, buf)
    const ns = readFromStringsHeap(stringsStream, nsIdx, buf)
    types.push({ name, namespace: ns, fieldList, methodList, extendsCoded, flags })
  }

  // --- Read Field table ---
  const fields: { name: string; sigBlobIdx: number; flags: number }[] = []
  if (hasTable(TABLE_FIELD)) {
    const fOff = tableOffset(TABLE_FIELD)
    r.off = rvaToOffset(tablesStream.offset) + fOff
    for (let i = 0; i < rowCounts[TABLE_FIELD]; i++) {
      const flags = r.u16() // Flags
      const nameIdx = stringIdxSize === 4 ? r.u32() : r.u16()
      const sigIdx = blobIdxSize === 4 ? r.u32() : r.u16()
      fields.push({
        name: readFromStringsHeap(stringsStream, nameIdx, buf),
        sigBlobIdx: sigIdx,
        flags
      })
    }
  }

  // --- Read Property table ---
  const properties: { name: string; sigBlobIdx: number }[] = []
  if (hasTable(TABLE_PROPERTY)) {
    const pOff = tableOffset(TABLE_PROPERTY)
    r.off = rvaToOffset(tablesStream.offset) + pOff
    for (let i = 0; i < rowCounts[TABLE_PROPERTY]; i++) {
      r.skip(2) // Flags
      const nameIdx = stringIdxSize === 4 ? r.u32() : r.u16()
      const sigIdx = blobIdxSize === 4 ? r.u32() : r.u16()
      properties.push({
        name: readFromStringsHeap(stringsStream, nameIdx, buf),
        sigBlobIdx: sigIdx
      })
    }
  }

  // --- Read TypeRef table (cross-assembly type references) ---
  const typeRefs: { typeName: string; typeNamespace: string; resolutionScope: number }[] = []
  if (hasTable(TABLE_TYPEREF)) {
    const trOff = tableOffset(TABLE_TYPEREF)
    r.off = rvaToOffset(tablesStream.offset) + trOff
    // ResolutionScope is a coded index (Module/ModuleRef/AssemblyRef/TypeRef) — use 2 bytes or coded
    // For simplicity we read as 2 bytes since it's small in practice
    const codedResScopeSize = 2
    for (let i = 0; i < rowCounts[TABLE_TYPEREF]; i++) {
      const rs = codedResScopeSize === 4 ? r.u32() : r.u16()
      const tnameIdx = stringIdxSize === 4 ? r.u32() : r.u16()
      const tnsIdx = stringIdxSize === 4 ? r.u32() : r.u16()
      typeRefs.push({
        typeName: readFromStringsHeap(stringsStream, tnameIdx, buf),
        typeNamespace: readFromStringsHeap(stringsStream, tnsIdx, buf),
        resolutionScope: rs
      })
    }
  }

  // --- Read AssemblyRef table (for resolving TypeRef assembly names) ---
  const assemblyRefs: { name: string }[] = []
  if (hasTable(TABLE_ASSEMBLY_REF)) {
    const arOff = tableOffset(TABLE_ASSEMBLY_REF)
    r.off = rvaToOffset(tablesStream.offset) + arOff
    for (let i = 0; i < rowCounts[TABLE_ASSEMBLY_REF]; i++) {
      r.skip(12) // MajorVersion(2) + MinorVersion(2) + BuildNumber(2) + RevisionNumber(2) + Flags(4)
      const pubKeyIdx = blobIdxSize === 4 ? r.u32() : r.u16()
      const nameIdx = stringIdxSize === 4 ? r.u32() : r.u16()
      const cultureIdx = stringIdxSize === 4 ? r.u32() : r.u16()
      const hashIdx = blobIdxSize === 4 ? r.u32() : r.u16()
      assemblyRefs.push({
        name: readFromStringsHeap(stringsStream, nameIdx, buf)
      })
    }
  }

  // --- Read InterfaceImpl table: maps TypeDef → implemented interfaces ---
  const interfaceImplMap: Map<number, number[]> = new Map() // typeDefRow → [interface coded indices]
  if (hasTable(TABLE_INTERFACE_IMPL)) {
    const iiOff = tableOffset(TABLE_INTERFACE_IMPL)
    r.off = rvaToOffset(tablesStream.offset) + iiOff
    for (let i = 0; i < rowCounts[TABLE_INTERFACE_IMPL]; i++) {
      // Class is a simple TypeDef index (not coded)
      const classIdx = r.u16() | (r.u16() << 16)
      // Interface is a TypeDefOrRef coded index
      const codedIdxSize = codedIdxWidth(TYPE_DEF_OR_REF_TABLES)
      const ifaceCoded = codedIdxSize === 4 ? r.u32() : r.u16()
      if (!interfaceImplMap.has(classIdx)) {
        interfaceImplMap.set(classIdx, [])
      }
      interfaceImplMap.get(classIdx)!.push(ifaceCoded)
    }
  }

  // --- Read Constant table: maps parent field → constant value (used for enum members) ---
  const constantMap: Map<number, { type: number; value: number }> = new Map()
  if (hasTable(TABLE_CONSTANT)) {
    const cOff = tableOffset(TABLE_CONSTANT)
    r.off = rvaToOffset(tablesStream.offset) + cOff
    for (let i = 0; i < rowCounts[TABLE_CONSTANT]; i++) {
      const constType = r.u8()
      r.skip(1) // padding
      // Parent is a HasConstant coded index (Field/Property/Param)
      const parent = r.u16() | (r.u16() << 16) // conservatively 4 bytes
      const valueIdx = blobIdxSize === 4 ? r.u32() : r.u16()
      // Read value from blob (always little-endian for constants)
      let value = 0
      if (valueIdx !== 0 && blobStream) {
        const blobOff = rvaToOffset(blobStream.offset) + valueIdx
        if (blobOff < buf.length) {
          const br2 = new BinReader(buf, blobOff)
          const valLen = readCompressedUInt(br2)
          if (valLen >= 1 && valLen <= 8 && br2.off + valLen <= buf.length) {
            for (let j = 0; j < valLen; j++) {
              value |= (br2.u8() << (j * 8))
            }
          }
        }
      }
      constantMap.set(parent, { type: constType, value })
    }
  }

  // ============================================================
  // TypeDefOrRef coded-index resolver
  // ============================================================

  /** Resolve a TypeDefOrRef coded index into a human-readable full type name */
  function resolveTypeDefOrRef(codedIdx: number): { fullName: string; typeDefRow?: number } | null {
    // Tag bits are in the low 2 bits (3 tables = 2 bits)
    const tag = codedIdx & 0x03
    const row = codedIdx >> 2
    if (row === 0) return null
    if (tag === 0) {
      // TypeDef — row index into our types array
      if (row - 1 >= 0 && row - 1 < types.length) {
        const td = types[row - 1]
        const fullName = td.namespace ? `${td.namespace}.${td.name}` : td.name
        return { fullName, typeDefRow: row }
      }
    } else if (tag === 1) {
      // TypeRef — row index into typeRefs array
      if (row - 1 >= 0 && row - 1 < typeRefs.length) {
        const tr = typeRefs[row - 1]
        const fullName = tr.typeNamespace ? `${tr.typeNamespace}.${tr.typeName}` : tr.typeName
        // Try to get assembly name from AssemblyRef
        let asmName = ''
        // ResolutionScope tag: 0=Module, 1=ModuleRef, 2=AssemblyRef, 3=TypeRef
        const rsTag = tr.resolutionScope & 0x03
        const rsRow = tr.resolutionScope >> 2
        if (rsTag === 2 && rsRow - 1 >= 0 && rsRow - 1 < assemblyRefs.length) {
          asmName = assemblyRefs[rsRow - 1].name
        }
        const resultFullName = asmName ? `${fullName}, ${asmName}` : fullName
        return { fullName: resultFullName }
      }
    }
    // tag=2 = TypeSpec — skip for now (complex)
    return null
  }

  /** Check if a TypeDef row is an enum (extends System.Enum or has value__ field) */
  function isEnumType(typeDefRow: number): boolean {
    const t = types[typeDefRow - 1]
    if (!t) return false
    // Check flags: enum is a value type (not interface), has Sealed flag
    // Better approach: check if it has a special field named "value__"
    const fieldStart = t.fieldList - 1
    const fieldEnd = typeDefRow < types.length ? types[typeDefRow].fieldList - 1 : fields.length
    for (let fi = fieldStart; fi < fieldEnd && fi < fields.length; fi++) {
      if (fields[fi].name === 'value__') return true
    }
    return false
  }

  /** Read enum values for a given TypeDef row number */
  function readEnumValues(typeDefRow: number): { name: string; value: number }[] {
    const t = types[typeDefRow - 1]
    if (!t) return []
    const fieldStart = t.fieldList - 1
    const fieldEnd = typeDefRow < types.length ? types[typeDefRow].fieldList - 1 : fields.length
    const values: { name: string; value: number }[] = []
    for (let fi = fieldStart; fi < fieldEnd && fi < fields.length; fi++) {
      const f = fields[fi]
      if (f.name === 'value__') continue // skip special field
      // Enum members are static + literal
      if (!(f.flags & FIELD_FLAG_STATIC) || !(f.flags & FIELD_FLAG_LITERAL)) continue
      // Look up constant value for this field (field row = fi + 1, 1-based)
      const constEntry = constantMap.get(fi + 1)
      values.push({
        name: f.name,
        value: constEntry ? constEntry.value : 0
      })
    }
    return values
  }

  // ============================================================
  // Decode field signatures (enhanced with type-name resolution)
  // ============================================================

  /** Read a type from a blob signature, returning element type and optional custom type info */
  function readSigType(br: BinReader): DecodedFieldType {
    const etype = readCompressedUInt(br)
    switch (etype) {
      case ELEMENT_TYPE_BOOLEAN: return { kind: 'boolean' }
      case ELEMENT_TYPE_CHAR:
      case ELEMENT_TYPE_I1: case ELEMENT_TYPE_U1:
      case ELEMENT_TYPE_I2: case ELEMENT_TYPE_U2:
      case ELEMENT_TYPE_I4: case ELEMENT_TYPE_U4:
      case ELEMENT_TYPE_I8: case ELEMENT_TYPE_U8:
      case ELEMENT_TYPE_R4: case ELEMENT_TYPE_R8:
        return { kind: 'number' }
      case ELEMENT_TYPE_STRING: return { kind: 'string' }
      case ELEMENT_TYPE_VALUETYPE: {
        // Read TypeDefOrRef coded index
        const codedIdx = readCompressedUInt(br)
        const resolved = resolveTypeDefOrRef(codedIdx)
        const typeName = resolved?.fullName
        const result: DecodedFieldType = { kind: 'object', typeName }
        // If this is a TypeDef enum, attach enum values
        if (resolved?.typeDefRow && isEnumType(resolved.typeDefRow)) {
          result.enumValues = readEnumValues(resolved.typeDefRow)
        }
        return result
      }
      case ELEMENT_TYPE_CLASS: {
        const codedIdx = readCompressedUInt(br)
        const resolved = resolveTypeDefOrRef(codedIdx)
        return { kind: 'object', typeName: resolved?.fullName }
      }
      case ELEMENT_TYPE_GENERICINST: {
        // Read generic type first (it's either VALUETYPE or CLASS)
        const innerType = readSigType(br)
        // Read argument count
        const argCount = readCompressedUInt(br)
        const argNames: string[] = []
        for (let a = 0; a < argCount; a++) {
          const arg = readSigType(br)
          argNames.push(arg.typeName || arg.kind)
        }
        const typeName = innerType.typeName
          ? `${innerType.typeName}<${argNames.join(', ')}>`
          : `object<${argNames.join(', ')}>`
        return { kind: 'object', typeName }
      }
      case ELEMENT_TYPE_SZARRAY: {
        const inner = readSigType(br)
        return { kind: 'object', typeName: inner.typeName ? `${inner.typeName}[]` : `${inner.kind}[]` }
      }
      default: return { kind: 'object' }
    }
  }

  function decodeFieldType(sigBlobIdx: number): DecodedFieldType {
    if (sigBlobIdx === 0 || !blobStream) return { kind: 'object' }
    const blobOff = rvaToOffset(blobStream.offset) + sigBlobIdx
    if (blobOff >= buf.length) return { kind: 'object' }
    const br = new BinReader(buf, blobOff)
    const len = readCompressedUInt(br)
    if (len === 0) return { kind: 'object' }
    br.skip(1) // FIELD calling convention byte
    return readSigType(br)
  }

  function decodePropType(sigBlobIdx: number): DecodedFieldType {
    if (sigBlobIdx === 0 || !blobStream) return { kind: 'object' }
    const blobOff = rvaToOffset(blobStream.offset) + sigBlobIdx
    if (blobOff >= buf.length) return { kind: 'object' }
    const br = new BinReader(buf, blobOff)
    const len = readCompressedUInt(br)
    if (len === 0) return { kind: 'object' }
    // Property signature: PROPERTY calling convention (0x08 or 0x28) + param count + ret type + params
    br.skip(1) // calling convention
    const paramCount = readCompressedUInt(br)
    return readSigType(br)
  }

  // ============================================================
  // Build results
  // ============================================================
  const result: AcrMetaType[] = []
  const seenTypes = new Set<string>()

  for (let i = 0; i < types.length; i++) {
    const t = types[i]
    const fullName = t.namespace ? `${t.namespace}.${t.name}` : t.name

    // --- Detect whether this type is an ITriggerCond / ITriggerAction ---
    let isCond = false
    let isAction = false
    const ifaceNames: string[] = []

    // Path 1: InterfaceImpl table (precise)
    if (interfaceImplMap.has(i + 1)) {
      for (const ifaceCoded of interfaceImplMap.get(i + 1)!) {
        const resolved = resolveTypeDefOrRef(ifaceCoded)
        if (resolved) {
          ifaceNames.push(resolved.fullName)
          const shortName = resolved.fullName.split(',')[0].split('.').pop() || ''
          if (shortName === 'ITriggerCond' || shortName.endsWith('ITriggerCond')) {
            isCond = true
          }
          if (shortName === 'ITriggerAction' || shortName.endsWith('ITriggerAction')) {
            isAction = true
          }
        }
      }
    }

    // Path 2: Name-based fallback (for types not directly implementing the interface)
    if (!isCond && !isAction) {
      if (fullName.includes('TriggerCond') && !fullName.includes('TriggerCondBase') && !fullName.includes('TriggerCondParams')) {
        isCond = true
      }
      if (fullName.includes('TriggerAction') && !fullName.includes('TriggerActionBase')) {
        isAction = true
      }
    }

    // Skip non-trigger types, but keep enum types we may need for cross-reference
    if (!isCond && !isAction) continue

    // Resolve base type from Extends
    let baseType: string | undefined
    if (t.extendsCoded !== 0) {
      const resolved = resolveTypeDefOrRef(t.extendsCoded)
      if (resolved && resolved.fullName !== 'System.Object' && resolved.fullName !== 'System.ValueType' && resolved.fullName !== 'System.Enum') {
        baseType = resolved.fullName
      }
    }

    const $type = `${fullName}, ${assemblyName}`
    if (seenTypes.has($type)) continue
    seenTypes.add($type)

    const fieldEntries: { key: string; type: 'boolean' | 'number' | 'string' | 'object'; typeName?: string; enumValues?: { name: string; value: number }[] }[] = []
    const seenKeys = new Set<string>()

    // Get fields for this type
    const fieldStart = t.fieldList - 1 // 1-based in metadata
    const fieldEnd = i + 1 < types.length ? types[i + 1].fieldList - 1 : fields.length
    for (let fi = fieldStart; fi < fieldEnd && fi < fields.length; fi++) {
      const f = fields[fi]
      if (f.name === '$type' || f.name === 'DisplayName' || f.name === 'Remark') continue
      // Skip enum backing field value__
      if (f.name === 'value__') continue
      // Skip private fields (could be helper state)
      if ((f.flags & 0x07) === 0) continue // 0 = private(CompilerControlled)
      if (seenKeys.has(f.name)) continue
      seenKeys.add(f.name)
      const decoded = decodeFieldType(f.sigBlobIdx)
      fieldEntries.push({
        key: f.name,
        type: decoded.kind,
        typeName: decoded.typeName,
        enumValues: decoded.enumValues
      })
    }

    // Get properties for this type via PropertyMap
    if (propertyMap.has(i + 1)) {
      const propStart = propertyMap.get(i + 1)! - 1
      const propEnd = (() => {
        // find next property map entry with smallest index > i+1
        let next = properties.length
        for (const [typeIdx, propIdx] of propertyMap) {
          if (typeIdx > i + 1 && propIdx - 1 < next) {
            next = propIdx - 1
          }
        }
        return next
      })()
      for (let pi = propStart; pi < propEnd && pi < properties.length; pi++) {
        const p = properties[pi]
        if (p.name === '$type' || p.name === 'DisplayName' || p.name === 'Remark') continue
        if (seenKeys.has(p.name)) continue
        seenKeys.add(p.name)
        const decoded = decodePropType(p.sigBlobIdx)
        fieldEntries.push({
          key: p.name,
          type: decoded.kind,
          typeName: decoded.typeName,
          enumValues: decoded.enumValues
        })
      }
    }

    const entry: AcrMetaType = {
      $type,
      displayName: t.name,
      assemblyName,
      kind: isCond ? 'condition' : 'action',
      fields: fieldEntries
    }
    if (ifaceNames.length > 0) entry.interfaces = ifaceNames
    if (baseType) entry.baseType = baseType
    result.push(entry)
  }

  // --- Extract #US heap strings for QT key discovery ---
  if (usStream) {
    const usStrings = readUserStrings(buf, usStream, rvaToOffset)
    if (usStrings.length > 0) {
      // Attach to each result — the factory can filter for likely QT keys
      for (const r of result) {
        r.allStrings = usStrings
      }
    }
  }

  return result
}

// --- Helpers ---

function readFromStringsHeap(stream: { offset: number; size: number }, idx: number, buf: Buffer): string {
  const off = stream.offset + idx
  if (off >= buf.length) return ''
  return readNullTerminatedUTF8(buf, off)
}

function readCompressedUInt(r: BinReader): number {
  const b0 = r.u8()
  if ((b0 & 0x80) === 0) return b0
  if ((b0 & 0xC0) === 0x80) {
    const b1 = r.u8()
    return ((b0 & 0x3F) << 8) | b1
  }
  // 0xC0
  const b1 = r.u8(); const b2 = r.u8(); const b3 = r.u8()
  return ((b0 & 0x1F) << 24) | (b1 << 16) | (b2 << 8) | b3
}

// ============================================================
// #US heap reader — extracts all user string literals
// ============================================================

function readUserStrings(
  buf: Buffer,
  usStream: { offset: number; size: number },
  rvaToOffset: (rva: number) => number
): string[] {
  const strings: string[] = []
  const off = rvaToOffset(usStream.offset)
  const r = new BinReader(buf, off)
  const end = off + usStream.size
  if (r.u8() !== 0x00) return strings

  while (r.off < end) {
    try {
      const len = readCompressedUInt(r)
      if (len === 0) { strings.push(''); continue }
      if (r.off + len > end) break
      const raw = r.bytes(len)
      const strBytes = (len % 2 === 0) ? len : len - 1
      if (strBytes > 0) {
        strings.push(raw.toString('utf16le', 0, strBytes))
      }
    } catch {
      break
    }
  }
  return strings
}

// ============================================================
// Utility: read all ACR DLLs in a directory
// ============================================================

export async function readAllAcrDlls(acrDir: string): Promise<AcrMetaType[]> {
  const { existsSync } = await import('fs')
  const { readdir } = await import('fs/promises')
  if (!existsSync(acrDir)) return []

  const allTypes: AcrMetaType[] = []
  const entries = await readdir(acrDir, { withFileTypes: true })
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const dllPath = `${acrDir}/${e.name}/${e.name}.dll`.replace(/\\/g, '/')
    if (!existsSync(dllPath)) continue
    try {
      const types = await readAcrDll(dllPath)
      allTypes.push(...types)
    } catch (err) {
      console.warn(`Failed to read ACR DLL ${dllPath}:`, err)
    }
  }
  return allTypes
}
