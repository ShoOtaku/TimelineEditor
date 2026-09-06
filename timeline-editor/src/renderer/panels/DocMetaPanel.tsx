import { useEffect, useState } from 'react'
import type { TriggerLineDocument } from '@shared/types'
import { PR_JOBS } from '@shared/prTypes'
import { useStore } from '../store'
import { PrField, PrNumberInput, PrCheckbox } from '../pr/prFields'

function asStr(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function asNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * string[] ↔ one-per-line textarea. Keeps a local draft while typing so a
 * trailing newline isn't eaten by the filtered round-trip (same reason as PrNumberInput).
 */
function LinesTextarea({ value, onChange, rows, placeholder }: {
  value: string[]
  onChange: (v: string[]) => void
  rows?: number
  placeholder?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const external = value.join('\n')
  useEffect(() => { setDraft(null) }, [external])
  return (
    <textarea
      value={draft ?? external}
      onChange={e => {
        setDraft(e.target.value)
        onChange(e.target.value.split('\n').map(l => l.trim()).filter(Boolean))
      }}
      onBlur={() => setDraft(null)}
      className="field-input font-mono !text-[11px]"
      rows={rows ?? 3}
      placeholder={placeholder}
    />
  )
}

/** AE Triggerline 顶级元数据编辑（Name/Author/TerritoryTypeId 等） */
export function DocMetaPanel() {
  const doc = useStore(s => s.doc)!
  const updateDocMeta = useStore(s => s.updateDocMeta)
  const editOpenerScript = useStore(s => s.editOpenerScript)
  const set = (changes: Partial<TriggerLineDocument>) =>
    // 同字段的连续击键合并为一步撤销
    updateDocMeta(changes, `meta:${Object.keys(changes)[0]}`)

  const targetJob = asNum(doc.TargetJob)
  const jobKnown = targetJob !== null && PR_JOBS.some(j => j.id === targetJob)
  const opener = asStr(doc.OpenerScript)
  const exposedVars = Array.isArray(doc.ExposedVars) ? doc.ExposedVars.filter(v => typeof v === 'string') as string[] : []
  const guid = asStr(doc.GUID)

  return (
    <div className="space-y-3">
      <PrField label="时间轴名称">
        <input type="text" value={asStr(doc.Name)} onChange={e => set({ Name: e.target.value })} className="field-input" />
      </PrField>

      <div className="grid grid-cols-2 gap-2">
        <PrField label="作者">
          <input type="text" value={asStr(doc.Author)} onChange={e => set({ Author: e.target.value })} className="field-input" />
        </PrField>
        <PrField label="ACR 作者 (TargetAcrAuthor)">
          <input type="text" value={asStr(doc.TargetAcrAuthor)} onChange={e => set({ TargetAcrAuthor: e.target.value })} className="field-input" />
        </PrField>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <PrField label="目标职业">
          <select
            value={jobKnown ? targetJob! : -1}
            onChange={e => set({ TargetJob: parseInt(e.target.value) })}
            className="field-input"
          >
            {!jobKnown && <option value={-1}>未知 ({targetJob ?? '未设置'})</option>}
            {PR_JOBS.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
          </select>
        </PrField>
        <PrField label="区域 ID (TerritoryTypeId)" hint="0 = 不限">
          <PrNumberInput integer value={asNum(doc.TerritoryTypeId)} onChange={v => set({ TerritoryTypeId: v ?? 0 })} />
        </PrField>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <PrField label="天气 ID (TerritoryWeatherId)" hint="0 = 不限">
          <PrNumberInput integer value={asNum(doc.TerritoryWeatherId)} onChange={v => set({ TerritoryWeatherId: v ?? 0 })} />
        </PrField>
        <PrField label="Logs 地址">
          <input type="text" value={asStr(doc.LogsAddress)} onChange={e => set({ LogsAddress: e.target.value })} className="field-input" placeholder="https://... 留空则不填" />
        </PrField>
      </div>

      <PrField label="备注 (Note)">
        <textarea value={asStr(doc.Note)} onChange={e => set({ Note: e.target.value })} className="field-input" rows={2} />
      </PrField>

      <PrField label="暴露变量 (ExposedVars)" hint="每行一个，供 ACR 侧 QT 开关使用">
        <LinesTextarea value={exposedVars} onChange={v => set({ ExposedVars: v })} rows={3} />
      </PrField>

      <PrField label="变量说明 (ExposedVarDesc)">
        <textarea value={asStr(doc.ExposedVarDesc)} onChange={e => set({ ExposedVarDesc: e.target.value })} className="field-input" rows={4} />
      </PrField>

      <PrField label="起手脚本 (OpenerScript)" hint={opener ? `${opener.split('\n').length} 行 · ${opener.length} 字符` : '未设置'}>
        <button
          onClick={() => {
            editOpenerScript()
            document.dispatchEvent(new CustomEvent('editor:openScript'))
          }}
          className="w-full px-2 py-1.5 text-[12px] bg-purple-900/50 hover:bg-purple-800/60 text-purple-200 rounded transition-colors"
        >
          {'</>'} 在脚本面板中编辑
        </button>
      </PrField>

      <PrCheckbox
        label="ClearCustomed（AE 内部标志，通常保持默认）"
        checked={doc.ClearCustomed === true}
        onChange={v => set({ ClearCustomed: v })}
      />

      {/* 只读信息 */}
      <div className="text-[10px] text-gray-600 pt-2 border-t border-gray-700 space-y-1">
        <div>ConfigVersion：{asNum(doc.ConfigVersion) ?? '未知'}</div>
        <div className="flex items-center gap-2">
          <span className="flex-shrink-0">GUID：</span>
          <span className="font-mono truncate" title={guid}>{guid || '未设置'}</span>
          <button
            onClick={() => set({ GUID: crypto.randomUUID().replace(/-/g, '') })}
            className="px-1.5 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded flex-shrink-0"
            title="复制此时间轴后重新生成 GUID，避免与原文件冲突"
          >
            重新生成
          </button>
        </div>
      </div>
    </div>
  )
}
