import type { PtlAnchor } from '@shared/prTypes'
import { PR_SYNC_TYPES, PR_SYNC_TYPE_LABELS, PR_SYNC_ACTION_TYPES } from '@shared/prTypes'
import { usePrStore } from '../store/prStore'
import { formatPrTime } from './prModel'
import { PrField, PrCheckbox, PrNumberInput, PrParamsTextarea, SpellNameHint } from './prFields'

/** Anchor properties + sync rule editor */
export function PrAnchorEditor({ anchor }: { anchor: PtlAnchor }) {
  const updateAnchor = usePrStore(s => s.updateAnchor)
  const updateSync = usePrStore(s => s.updateSync)

  const set = (changes: Partial<PtlAnchor>) => updateAnchor(anchor.Guid, changes)
  const sync = anchor.Sync

  const setParam = (key: string, value: string) => {
    const params = { ...(sync?.Params ?? {}) }
    if (value === '') delete params[key]
    else params[key] = value
    updateSync(anchor.Guid, { Params: params })
  }

  return (
    <div className="space-y-3">
      <PrField label="锚点名称">
        <input type="text" value={anchor.Name ?? ''} onChange={e => set({ Name: e.target.value })} className="field-input" />
      </PrField>

      <PrField label="时间 (秒)" hint={formatPrTime(anchor.Time)}>
        <PrNumberInput value={anchor.Time} onChange={v => set({ Time: v ?? 0 })} />
      </PrField>

      <div className="grid grid-cols-2 gap-2">
        <PrCheckbox label="🚩 阶段锚点" checked={anchor.IsPhaseAnchor}
          title="阶段锚点默认同步窗口 ±10s"
          onChange={v => set({ IsPhaseAnchor: v, ...(v ? { IsEndAnchor: false } : {}) })} />
        <PrCheckbox label="🏁 结束锚点" checked={anchor.IsEndAnchor}
          title="时间轴最后一个功能锚点必须是结束锚点"
          onChange={v => set({ IsEndAnchor: v, ...(v ? { IsPhaseAnchor: false } : {}) })} />
        <PrCheckbox label="💬 注释锚点" checked={anchor.IsCommentAnchor}
          title="仅作标注，不参与分段和同步"
          onChange={v => set({ IsCommentAnchor: v })} />
        <PrCheckbox label="🔧 技术锚点" checked={anchor.IsTechnicalAnchor}
          title="不参与分段的技术标记"
          onChange={v => set({ IsTechnicalAnchor: v })} />
      </div>

      <PrCheckbox label="启用" checked={anchor.Enabled} onChange={v => set({ Enabled: v })} />

      <PrField label="备注">
        <input type="text" value={anchor.Remark ?? ''} onChange={e => set({ Remark: e.target.value || null })}
          className="field-input" placeholder="可选备注..." />
      </PrField>

      {/* Sync rule */}
      <div className="pt-2 border-t border-gray-700">
        <div className="text-[11px] font-semibold text-sky-400 mb-2">同步规则</div>
        <div className="space-y-3">
          <PrField label="同步类型">
            <select
              value={sync?.Type ?? 'None'}
              onChange={e => {
                const t = e.target.value
                if (t === 'None' && !sync) return
                updateSync(anchor.Guid, { Type: t })
              }}
              className="field-input"
            >
              {PR_SYNC_TYPES.map(t => (
                <option key={t} value={t}>{PR_SYNC_TYPE_LABELS[t] ?? t}</option>
              ))}
            </select>
          </PrField>

          {sync && sync.Type !== 'None' && (
            <>
              {PR_SYNC_ACTION_TYPES.has(sync.Type) && (
                <>
                  <PrField label="技能 ID (ActionId)">
                    <input
                      type="text"
                      value={sync.Params?.ActionId ?? ''}
                      onChange={e => setParam('ActionId', e.target.value)}
                      className="field-input"
                      placeholder="如 46086"
                    />
                    <SpellNameHint actionId={sync.Params?.ActionId} />
                  </PrField>
                  <PrField label="正则匹配 (Regex)" hint="可选，与技能ID二选一">
                    <input
                      type="text"
                      value={sync.Params?.Regex ?? ''}
                      onChange={e => setParam('Regex', e.target.value)}
                      className="field-input"
                      placeholder="可选"
                    />
                  </PrField>
                </>
              )}

              {!PR_SYNC_ACTION_TYPES.has(sync.Type) && sync.Type !== 'InCombat' && (
                <PrField label="同步参数 (Params)" hint="键=值，每行一条">
                  <PrParamsTextarea
                    params={sync.Params}
                    rows={3}
                    onChange={p => updateSync(anchor.Guid, { Params: p ?? {} })}
                  />
                </PrField>
              )}

              <div className="grid grid-cols-2 gap-2">
                <PrField label="窗口·前 (秒)" hint="0=默认2.5/10">
                  <PrNumberInput value={sync.WindowBefore}
                    onChange={v => updateSync(anchor.Guid, { WindowBefore: v ?? 0 })} />
                </PrField>
                <PrField label="窗口·后 (秒)">
                  <PrNumberInput value={sync.WindowAfter}
                    onChange={v => updateSync(anchor.Guid, { WindowAfter: v ?? 0 })} />
                </PrField>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <PrField label="匹配时间" hint="留空=锚点时间">
                  <PrNumberInput value={sync.MatchTime ?? null}
                    onChange={v => updateSync(anchor.Guid, { MatchTime: v })} />
                </PrField>
                <PrField label="跳转目标时间" hint="留空=锚点时间">
                  <PrNumberInput value={sync.JumpTargetTime ?? null}
                    onChange={v => updateSync(anchor.Guid, { JumpTargetTime: v })} />
                </PrField>
              </div>

              <PrCheckbox label="强制跳转 (IsForceJump)" checked={sync.IsForceJump}
                title="到达匹配时间时即使未命中同步事件也强制跳转"
                onChange={v => updateSync(anchor.Guid, { IsForceJump: v })} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
