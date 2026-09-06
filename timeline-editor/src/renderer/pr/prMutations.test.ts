import { describe, expect, it } from 'vitest'
import type { PtlDocument } from '@shared/prTypes'
import { createAnchor, createEntry, createNode, createEmptyPtlDocument } from './prModel'
import { pasteEntryToDoc, pasteNodeToEntry } from './prMutations'

function docWithTwoSegments(): PtlDocument {
  const doc = createEmptyPtlDocument('test')
  // createEmptyPtlDocument: anchor 0s (InCombat) + end anchor 600s — insert a mid anchor
  doc.Anchors.splice(1, 0, { ...createAnchor(100, 'P2') })
  return doc
}

describe('pasteEntryToDoc（跨锚点粘贴行为组）', () => {
  it('粘贴到另一锚点：新 Guid、绑定目标锚点、Offset 收敛进目标段窗口', () => {
    const doc = docWithTwoSegments()
    const [a0, a1] = doc.Anchors // 0s 段(窗口 100s)、100s 段(窗口 500s)
    const src = createEntry(a0.Guid, '减伤轴')
    src.Offset = 50
    doc.Entries.push(src)

    const pasted = pasteEntryToDoc(doc, a1.Guid, src)!
    expect(pasted).not.toBeNull()
    expect(pasted.Guid).not.toBe(src.Guid)
    expect(pasted.StartAnchorGuid).toBe(a1.Guid)
    expect(pasted.Offset).toBe(50) // 50 < 500，保持
    expect(doc.Entries).toHaveLength(2)
    // 深拷贝：改副本不影响原行为组
    pasted.EntryGroup.Name = '改动'
    expect(src.EntryGroup.Name).not.toBe('改动')
  })

  it('Offset 超出目标段窗口时收敛到窗口内', () => {
    const doc = docWithTwoSegments()
    const [a0, a1] = doc.Anchors
    const src = createEntry(a1.Guid, '长偏移')
    src.Offset = 450 // 目标段窗口只有 100s
    const pasted = pasteEntryToDoc(doc, a0.Guid, src)!
    expect(pasted.Offset).toBeLessThan(100)
    expect(pasted.Offset).toBeGreaterThanOrEqual(0)
  })

  it('拒绝粘贴到 End 锚点 / 最后一个功能锚点', () => {
    const doc = docWithTwoSegments()
    const end = doc.Anchors.find(a => a.IsEndAnchor)!
    const src = createEntry(doc.Anchors[0].Guid, 'x')
    expect(pasteEntryToDoc(doc, end.Guid, src)).toBeNull()
    expect(doc.Entries).toHaveLength(0)
  })
})

describe('pasteNodeToEntry（节点跨行为组粘贴）', () => {
  it('粘贴为组合节点的子节点，子树分配新 Id', () => {
    const entry = createEntry('a1', 'e1')
    const srcRoot = createNode('serial', 10)
    srcRoot.Children = [createNode('delay', 11), createNode('action', 12)]
    const pasted = pasteNodeToEntry(entry, srcRoot, entry.EntryGroup.Id, 'inside')!
    expect(entry.EntryGroup.Children).toHaveLength(1)
    expect(pasted.Id).not.toBe(10)
    const ids: number[] = []
    const walk = (n: typeof pasted) => { ids.push(n.Id); (n.Children ?? []).forEach(walk) }
    walk(pasted)
    expect(new Set(ids).size).toBe(3) // 全部唯一
    // 与组内既有 Id 不冲突
    expect(ids.every(id => id > entry.EntryGroup.Id)).toBe(true)
  })

  it('目标为叶子节点时粘贴为其后方同级', () => {
    const entry = createEntry('a1', 'e1')
    const leaf = createNode('delay', 5)
    entry.EntryGroup.Children = [leaf]
    const src = createNode('action', 20)
    pasteNodeToEntry(entry, src, leaf.Id, 'after')
    expect(entry.EntryGroup.Children!.map(n => n.Type)).toEqual(['delay', 'action'])
  })

  it('targetNodeId 为 null 时追加到根组', () => {
    const entry = createEntry('a1', 'e1')
    const src = createNode('delay', 7)
    pasteNodeToEntry(entry, src, null)
    expect(entry.EntryGroup.Children).toHaveLength(1)
  })

  it('目标不存在时不改动树', () => {
    const entry = createEntry('a1', 'e1')
    const src = createNode('delay', 7)
    expect(pasteNodeToEntry(entry, src, 999)).toBeNull()
    expect(entry.EntryGroup.Children ?? []).toHaveLength(0)
  })
})
