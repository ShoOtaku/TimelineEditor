"""Minimal SqPack + EXD reader — pulls sheet rows straight out of the installed game.

Only what the timeline editor needs: locate a sheet inside 0a0000 (exd category),
decompress its file blocks, then walk EXH/EXD to read string and numeric columns.
Authoritative and always matches the installed client version, unlike public
datamining dumps which lag several patches behind.

Format references: SqPack index/dat layout and ECMA-ish EXH/EXD structures as
documented by the FFXIV modding community (SaintCoinach / Lumina).
"""
import os
import struct
import zlib
from typing import Dict, List, Optional, Tuple

# ---------------------------------------------------------------- hashing

_CRC_TABLE: List[int] = []


def _build_crc_table() -> None:
    poly = 0xEDB88320
    for i in range(256):
        crc = i
        for _ in range(8):
            crc = (crc >> 1) ^ (poly if crc & 1 else 0)
        _CRC_TABLE.append(crc)


_build_crc_table()


def sqpack_hash(text: str) -> int:
    """SqPack path hash: CRC32 register *without* the final XOR (= ~zlib.crc32)."""
    crc = 0xFFFFFFFF
    for byte in text.lower().encode("utf-8"):
        crc = _CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >> 8)
    return crc & 0xFFFFFFFF


# ---------------------------------------------------------------- index

class SqPackIndex:
    """Maps `folder/file` paths to (dat file number, byte offset)."""

    def __init__(self, index_path: str):
        self.index_path = index_path
        self.entries: Dict[Tuple[int, int], Tuple[int, int]] = {}
        self._load()

    def _load(self) -> None:
        with open(self.index_path, "rb") as f:
            data = f.read()

        # SqPack header: 'SqPack' magic, header length at 0x0C
        if data[:6] != b"SqPack":
            raise ValueError(f"{self.index_path} is not a SqPack index")
        sqpack_header_len = struct.unpack_from("<I", data, 0x0C)[0]

        # Segment header: index segment offset/size at 0x08/0x0C of the segment block
        seg_offset, seg_size = struct.unpack_from("<II", data, sqpack_header_len + 0x08)

        # Each entry: file hash (4), folder hash (4), packed offset (4), padding (4)
        for pos in range(seg_offset, seg_offset + seg_size, 16):
            file_hash, folder_hash, packed = struct.unpack_from("<III", data, pos)
            dat_file = (packed & 0x0F) >> 1
            offset = (packed & 0xFFFFFFF0) * 0x08
            self.entries[(folder_hash, file_hash)] = (dat_file, offset)

    def lookup(self, path: str) -> Optional[Tuple[int, int]]:
        folder, _, file = path.rpartition("/")
        return self.entries.get((sqpack_hash(folder), sqpack_hash(file)))


# ---------------------------------------------------------------- dat

def read_file(dat_dir: str, repo_prefix: str, dat_file: int, offset: int) -> bytes:
    """Read and inflate one file from a .datN container."""
    path = os.path.join(dat_dir, f"{repo_prefix}.win32.dat{dat_file}")
    with open(path, "rb") as f:
        f.seek(offset)
        header = f.read(0x18)
        header_len, content_type, _uncompressed_size, _block_buf, _num_blocks, block_count = \
            struct.unpack_from("<IIIIII", header, 0)
        if content_type != 2:  # 2 = standard binary file
            raise ValueError(f"unsupported content type {content_type} at {offset}")

        # Block table: offset(4) size(2) uncompressed size(2) per block
        table = f.read(block_count * 8)
        blocks = [struct.unpack_from("<IHH", table, i * 8) for i in range(block_count)]

        out = bytearray()
        for block_offset, _block_size, _uncomp in blocks:
            f.seek(offset + header_len + block_offset)
            b_header = f.read(0x10)
            _size, _unknown, compressed_size, uncompressed_size = struct.unpack_from("<IIII", b_header, 0)
            if compressed_size == 32000:  # sentinel: stored uncompressed
                out += f.read(uncompressed_size)
            else:
                raw = f.read(compressed_size)
                out += zlib.decompressobj(-15).decompress(raw)
        return bytes(out)


# ---------------------------------------------------------------- EXH / EXD

EXH_COLUMN_KINDS = {
    0: ("string", 4),
    1: ("bool", 1),
    2: ("int8", 1),
    3: ("uint8", 1),
    4: ("int16", 2),
    5: ("uint16", 2),
    6: ("int32", 4),
    7: ("uint32", 4),
    9: ("float32", 4),
    11: ("int64", 8),
    12: ("uint64", 8),
}


class ExhColumn:
    def __init__(self, kind: int, offset: int):
        self.kind = kind
        self.offset = offset

    @property
    def type_name(self) -> str:
        if 25 <= self.kind <= 32:
            return "packed_bool"
        return EXH_COLUMN_KINDS.get(self.kind, (f"kind{self.kind}", 0))[0]


class Exh:
    def __init__(self, blob: bytes):
        if blob[:4] != b"EXHF":
            raise ValueError("not an EXH file")
        (self.row_size, self.column_count, self.page_count, self.language_count,
         _u1, _u2, _variant, _u3, self.row_count) = struct.unpack_from(">HHHHHBBHI", blob, 0x06)

        pos = 0x20
        self.columns: List[ExhColumn] = []
        for _ in range(self.column_count):
            kind, offset = struct.unpack_from(">HH", blob, pos)
            self.columns.append(ExhColumn(kind, offset))
            pos += 4

        self.pages: List[Tuple[int, int]] = []
        for _ in range(self.page_count):
            start, count = struct.unpack_from(">II", blob, pos)
            self.pages.append((start, count))
            pos += 8

        self.languages: List[int] = []
        for _ in range(self.language_count):
            lang = struct.unpack_from("<H", blob, pos)[0] & 0xFF
            self.languages.append(lang)
            pos += 2


def parse_exd(blob: bytes, exh: Exh, wanted: List[int]) -> Dict[int, List[object]]:
    """Return {row_id: [values...]} for the requested column indices."""
    if blob[:4] != b"EXDF":
        raise ValueError("not an EXD file")
    index_size = struct.unpack_from(">I", blob, 0x08)[0]

    rows: Dict[int, List[object]] = {}
    for pos in range(0x20, 0x20 + index_size, 8):
        row_id, row_offset = struct.unpack_from(">II", blob, pos)
        data_size, _row_count = struct.unpack_from(">IH", blob, row_offset)
        base = row_offset + 6
        strings_base = base + exh.row_size

        values: List[object] = []
        for col_idx in wanted:
            col = exh.columns[col_idx]
            at = base + col.offset
            kind = col.kind
            if kind == 0:  # string: uint32 offset into the row's string block
                str_offset = struct.unpack_from(">I", blob, at)[0]
                start = strings_base + str_offset
                end = blob.find(b"\x00", start, row_offset + 6 + data_size)
                if end < 0:
                    end = start
                values.append(blob[start:end])
            elif kind == 1:
                values.append(blob[at] != 0)
            elif kind == 2:
                values.append(struct.unpack_from(">b", blob, at)[0])
            elif kind == 3:
                values.append(blob[at])
            elif kind == 4:
                values.append(struct.unpack_from(">h", blob, at)[0])
            elif kind == 5:
                values.append(struct.unpack_from(">H", blob, at)[0])
            elif kind == 6:
                values.append(struct.unpack_from(">i", blob, at)[0])
            elif kind == 7:
                values.append(struct.unpack_from(">I", blob, at)[0])
            elif kind == 9:
                values.append(struct.unpack_from(">f", blob, at)[0])
            elif 25 <= kind <= 32:
                values.append((blob[at] & (1 << (kind - 25))) != 0)
            else:
                values.append(None)
        rows[row_id] = values
    return rows


# ---------------------------------------------------------------- sheet API

LANG_SUFFIX = {0: "", 1: "_ja", 2: "_en", 3: "_de", 4: "_fr", 5: "_chs", 6: "_cht", 7: "_ko"}


class GameData:
    """Reads sheets out of the exd repository (0a0000)."""

    def __init__(self, game_path: str):
        self.sqpack_dir = os.path.join(game_path, "game", "sqpack", "ffxiv")
        if not os.path.isdir(self.sqpack_dir):
            raise FileNotFoundError(f"未找到 sqpack 目录: {self.sqpack_dir}")
        self.repo_prefix = "0a0000"
        self.index = SqPackIndex(os.path.join(self.sqpack_dir, f"{self.repo_prefix}.win32.index"))

    def _read(self, path: str) -> bytes:
        found = self.index.lookup(path)
        if not found:
            raise FileNotFoundError(f"sqpack 中未找到 {path}")
        dat_file, offset = found
        return read_file(self.sqpack_dir, self.repo_prefix, dat_file, offset)

    def read_sheet(self, sheet: str, columns: List[int], language: int = 5) -> Dict[int, List[object]]:
        exh = Exh(self._read(f"exd/{sheet}.exh"))
        lang = language if language in exh.languages else (exh.languages[0] if exh.languages else 0)
        suffix = LANG_SUFFIX.get(lang, "")

        rows: Dict[int, List[object]] = {}
        for start, _count in exh.pages:
            page_path = f"exd/{sheet}_{start}{suffix}.exd"
            try:
                blob = self._read(page_path)
            except FileNotFoundError:
                continue
            rows.update(parse_exd(blob, exh, columns))
        return rows

    def sheet_columns(self, sheet: str) -> List[ExhColumn]:
        return Exh(self._read(f"exd/{sheet}.exh")).columns
