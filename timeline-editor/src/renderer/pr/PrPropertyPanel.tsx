import type { PtlMeta, PtlVariable } from '@shared/prTypes'
import { PR_JOBS } from '@shared/prTypes'
import { usePrStore } from '../store/prStore'
import { findNode } from './prModel'
import { PrField, PrNumberInput } from './prFields'
import { PrAnchorEditor } from './PrAnchorEditor'
import { PrEntryEditor } from './PrEntryEditor'
import { PrNodeEditor } from './PrNodeEditor'

/** 文档级变量（ACR 侧可见的开关/选项）编辑 */
function VariablesEditor() {
  const variables = usePrStore(s => s.doc!.Variables) ?? []
  const updateVariables = usePrStore(s => s.updateVariables)

  const setVar = (i: number, changes: Partial<PtlVariable>, field = 'x') => {
    updateVariables(variables.map((v, j) => (j === i ? { ...v, ...changes } : v)), `var:${i}:${field}`)
  }
  const setOption = (vi: number, oi: number, changes: { Label?: string; Value?: number }, field: string) => {
    const v = variables[vi]
    const opts = (v.Options ?? []).map((o, j) => (j === oi ? { ...o, ...changes } : o))
    setVar(vi, { Options: opts }, `opt${oi}:${field}`)
  }

  return (
    <div className="space-y-2">
      {variables.length === 0 && (
        <div className="text-[11px] text-gray-600 italic">无变量。变量会作为可配置项暴露给 ACR 使用者。</div>
      )}
      {variables.map((v, vi) => (
        <div key={vi} className="border border-gray-700 rounded p-2 space-y-2 bg-gray-900/40">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={v.Name}
              onChange={e => setVar(vi, { Name: e.target.value }, 'Name')}
              className="field-input !py-0.5 flex-1"
              placeholder="变量名"
            />
            <button
              onClick={() => updateVariables(variables.filter((_, j) => j !== vi))}
              className="px-1.5 py-0.5 text-[11px] text-red-500/70 hover:text-red-400 flex-shrink-0"
              title="删除变量（可 Ctrl+Z 撤销）"
            >
              🗑
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <PrField label="默认值">
              <PrNumberInput integer value={v.DefaultValue} onChange={val => setVar(vi, { DefaultValue: val ?? 0 }, 'DefaultValue')} />
            </PrField>
            <PrField label="备注">
              <input
                type="text"
                value={v.Remark ?? ''}
                onChange={e => setVar(vi, { Remark: e.target.value || null }, 'Remark')}
                className="field-input !py-0.5"
              />
            </PrField>
          </div>
          {/* 选项列表（可选）：下拉可选值 */}
          <div className="space-y-1">
            {(v.Options ?? []).map((o, oi) => (
              <div key={oi} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={o.Label ?? ''}
                  onChange={e => setOption(vi, oi, { Label: e.target.value }, 'Label')}
                  className="field-input !py-0.5 flex-1"
                  placeholder="选项名"
                />
                <div className="w-16 flex-shrink-0">
                  <PrNumberInput integer value={o.Value ?? 0} onChange={val => setOption(vi, oi, { Value: val ?? 0 }, 'Value')} />
                </div>
                <button
                  onClick={() => setVar(vi, { Options: (v.Options ?? []).filter((_, j) => j !== oi) })}
                  className="text-gray-600 hover:text-red-400 px-1 flex-shrink-0"
                  title="删除选项"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() => setVar(vi, { Options: [...(v.Options ?? []), { Label: `选项${(v.Options ?? []).length + 1}`, Value: (v.Options ?? []).length }] })}
              className="text-[11px] text-gray-500 hover:text-emerald-300 px-1"
            >
              ＋ 选项
            </button>
          </div>
        </div>
      ))}
      <button
        onClick={() => updateVariables([...variables, { Name: `变量${variables.length + 1}`, DefaultValue: 0, Remark: null, Options: [] }])}
        className="px-2 py-1 text-[11px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
      >
        ＋ 添加变量
      </button>
    </div>
  )
}

function MetaEditor() {
  const doc = usePrStore(s => s.doc)!
  const updateMeta = usePrStore(s => s.updateMeta)
  const editPrOpenerScript = usePrStore(s => s.editPrOpenerScript)
  const meta = doc.Meta
  // 同字段连续击键合并为一步撤销
  const set = (changes: Partial<PtlMeta>) => updateMeta(changes, `meta:${Object.keys(changes)[0]}`)
  const jobKnown = PR_JOBS.some(j => j.id === meta.JobId)
  const openerScript = meta.CustomOpener?.Script ?? ''

  return (
    <div className="space-y-3">
      <PrField label="时间轴名称">
        <input type="text" value={meta.Name ?? ''} onChange={e => set({ Name: e.target.value })} className="field-input" />
      </PrField>
      <div className="grid grid-cols-2 gap-2">
        <PrField label="职业">
          <select
            value={jobKnown ? meta.JobId : -1}
            onChange={e => set({ JobId: parseInt(e.target.value) })}
            className="field-input"
          >
            {!jobKnown && <option value={-1}>未知 ({meta.JobId})</option>}
            {PR_JOBS.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
        </PrField>
        <PrField label="地图 ID (TerritoryId)" hint="0 = 不限">
          <input
            type="number" step={1} value={meta.TerritoryId}
            onChange={e => set({ TerritoryId: parseInt(e.target.value) || 0 })}
            className="field-input"
          />
        </PrField>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PrField label="作者">
          <input type="text" value={meta.Author ?? ''} onChange={e => set({ Author: e.target.value || null })} className="field-input" />
        </PrField>
        <PrField label="ACR 作者">
          <input type="text" value={meta.AcrAuthor ?? ''} onChange={e => set({ AcrAuthor: e.target.value || null })} className="field-input" />
        </PrField>
      </div>
      <PrField label="起手模板 (Opener)" hint="留空 = PTL 不覆盖起手">
        <input type="text" value={meta.Opener ?? ''} onChange={e => set({ Opener: e.target.value || null })} className="field-input" placeholder="ACR 中注册的起手名称" />
      </PrField>
      <PrField label="自定义起手脚本 (CustomOpener)" hint={openerScript ? `${openerScript.split('\n').length} 行 · ${openerScript.length} 字符` : '未设置'}>
        <button
          onClick={() => {
            editPrOpenerScript()
            document.dispatchEvent(new CustomEvent('editor:openScript'))
          }}
          className="w-full px-2 py-1.5 text-[12px] bg-purple-900/50 hover:bg-purple-800/60 text-purple-200 rounded transition-colors"
          title="在底部 Monaco 面板中编辑 C# 起手脚本；留空则不覆盖起手"
        >
          {'</>'} 在脚本面板中编辑
        </button>
      </PrField>
      <PrField label="备注">
        <textarea value={meta.Remark ?? ''} onChange={e => set({ Remark: e.target.value || null })} className="field-input" rows={3} />
      </PrField>
      <div className="pt-1 border-t border-gray-700/60">
        <div className="text-[10px] text-gray-500 mb-1.5">变量 (Variables)</div>
        <VariablesEditor />
      </div>
      <div className="text-[10px] text-gray-600 pt-2 border-t border-gray-700 space-y-0.5">
        <div>锚点：{doc.Anchors.length} · 行为组：{doc.Entries.length} · 变量：{doc.Variables?.length ?? 0}</div>
        {meta.CreatedAt && <div>创建于：{meta.CreatedAt}</div>}
      </div>
    </div>
  )
}

/** Right-side panel for the PromeRotation editor */
export function PrPropertyPanel() {
  const doc = usePrStore(s => s.doc)
  const selection = usePrStore(s => s.selection)
  const select = usePrStore(s => s.select)

  if (!doc) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm p-4 text-center bg-gray-800">
        <div>
          <div className="text-4xl mb-2">⏱️</div>
          <div>未打开 PR 时间轴</div>
        </div>
      </div>
    )
  }

  let title = '时间轴信息'
  let subtitle = 'Meta'
  let body: React.ReactNode = <MetaEditor />

  if (selection?.kind === 'anchor') {
    const anchor = doc.Anchors.find(a => a.Guid === selection.guid)
    if (anchor) {
      title = anchor.Name || '(未命名锚点)'
      subtitle = `锚点 · ${anchor.Guid.slice(0, 8)}`
      body = <PrAnchorEditor anchor={anchor} />
    }
  } else if (selection?.kind === 'entry') {
    const entry = doc.Entries.find(e => e.Guid === selection.guid)
    if (entry) {
      title = entry.Name || '(未命名行为组)'
      subtitle = `行为组 · ${entry.Guid.slice(0, 8)}`
      body = <PrEntryEditor entry={entry} />
    }
  } else if (selection?.kind === 'node') {
    const entry = doc.Entries.find(e => e.Guid === selection.entryGuid)
    const node = entry ? findNode(entry.EntryGroup, selection.nodeId) : null
    if (entry && node) {
      title = node.Name || '(未命名节点)'
      subtitle = `${entry.Name ?? '行为组'} › 节点 #${node.Id}`
      body = <PrNodeEditor entryGuid={entry.Guid} node={node} />
    }
  }

  return (
    <div className="h-full flex flex-col bg-gray-800 overflow-hidden">
      <div className="p-3 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-200 truncate">{title}</div>
          <div className="text-[10px] text-gray-500 truncate">{subtitle}</div>
        </div>
        {selection && selection.kind !== 'meta' && (
          <button
            onClick={() => select({ kind: 'meta' })}
            className="px-2 py-1 text-[11px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded flex-shrink-0"
            title="查看时间轴信息"
          >
            ℹ 信息
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto p-3">
        {body}
      </div>
    </div>
  )
}
