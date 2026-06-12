import { useCallback } from 'react'
import { useStore } from '../store'

export function SpellConfigEditor({
  config,
  onChange,
}: {
  config: any
  onChange: (changes: any) => void
}) {
  const spellLookup = useStore(s => s.spellLookup)
  const update = useCallback((key: string, value: any) => {
    onChange({ [key]: value })
  }, [onChange])

  const spellId = config.SpellId ?? 0
  const spellInfo = spellLookup ? spellLookup[String(spellId)] : null

  const handleSpellIdChange = useCallback((raw: string) => {
    const v = parseInt(raw) || 0
    onChange({ SpellId: v })
  }, [onChange])

  return (
    <div className="border border-gray-700 rounded bg-gray-800/60 p-2 space-y-1.5">
      <div className="flex gap-2">
        <div className="flex-1">
          <div className="text-[9px] text-gray-500 mb-0.5">技能ID</div>
          <input
            type="number"
            value={config.SpellId ?? 0}
            onChange={e => handleSpellIdChange(e.target.value)}
            className="field-input"
          />
          {spellInfo && spellId > 0 && (
            <div className="text-[11px] text-green-400 mt-0.5">
              {spellInfo.n}
            </div>
          )}
          {!spellInfo && spellId > 0 && spellLookup && (
            <div className="text-[11px] text-yellow-500/60 mt-0.5">
              未找到技能数据
            </div>
          )}
        </div>
        <div className="flex-1">
          <div className="text-[9px] text-gray-500 mb-0.5">类别</div>
          <select value={config.Category ?? 0} onChange={e => update('Category', parseInt(e.target.value))}
            className="field-input">
            <option value={0}>默认</option>
            <option value={1}>LB</option>
            <option value={2}>爆发药</option>
            <option value={3}>疾跑</option>
            <option value={4}>跳舞</option>
            <option value={5}>道具</option>
            <option value={3}>其他</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <div className="text-[9px] text-gray-500 mb-0.5">目标类型</div>
          <select value={config.TargetType ?? 0} onChange={e => update('TargetType', parseInt(e.target.value))}
            className="field-input">
            <option value={0}>目标</option>
            <option value={1}>自身</option>
            <option value={2}>队友</option>
            <option value={3}>焦点目标</option>
          </select>
        </div>
        <div className="flex-1">
          <div className="text-[9px] text-gray-500 mb-0.5">限制职能</div>
          <select value={config.LimitJobType ?? 0} onChange={e => update('LimitJobType', parseInt(e.target.value))}
            className="field-input">
            <option value={0}>无限制</option>
            <option value={1}>坦克</option>
            <option value={2}>治疗</option>
            <option value={3}>近战DPS</option>
            <option value={4}>远程DPS</option>
            <option value={5}>法系DPS</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={!!config.IsPartyMember} onChange={e => update('IsPartyMember', e.target.checked)} className="rounded bg-gray-700 border-gray-600" />
          <span className="text-[10px] text-gray-400">队友</span>
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={!!config.CoolDowncheck} onChange={e => update('CoolDowncheck', e.target.checked)} className="rounded bg-gray-700 border-gray-600" />
          <span className="text-[10px] text-gray-400">CD检测</span>
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={!!config.AutoCheckActionChange} onChange={e => update('AutoCheckActionChange', e.target.checked)} className="rounded bg-gray-700 border-gray-600" />
          <span className="text-[10px] text-gray-400">自动检测</span>
        </label>
      </div>

      {config.CoolDowncheck && (
        <div>
          <div className="text-[9px] text-gray-500 mb-0.5">CD检测时间</div>
          <input type="number" step={0.1} value={config.CoolDowncheck_time ?? 0}
            onChange={e => update('CoolDowncheck_time', parseFloat(e.target.value) || 0)}
            className="field-input" />
        </div>
      )}

      <div>
        <div className="text-[9px] text-gray-500 mb-0.5">限制HP类型</div>
        <select value={config.LimitHpType ?? 0} onChange={e => update('LimitHpType', parseInt(e.target.value))}
          className="field-input">
          <option value={0}>无限制</option>
          <option value={1}>HP {'>'} %</option>
          <option value={2}>HP {'<'} %</option>
        </select>
      </div>

      <div>
        <div className="text-[9px] text-gray-500 mb-0.5">限制最大HP类型</div>
        <select value={config.LimitMaxHpType ?? 0} onChange={e => update('LimitMaxHpType', parseInt(e.target.value))}
          className="field-input">
          <option value={0}>无限制</option>
          <option value={1}>最大HP {'>'} %</option>
          <option value={2}>最大HP {'<'} %</option>
        </select>
      </div>

      <div>
        <div className="text-[9px] text-gray-500 mb-0.5">位置</div>
        <div className="flex gap-1">
          <input type="number" step={0.1} value={config.Location?.X ?? 0}
            onChange={e => update('Location', { ...config.Location, X: parseFloat(e.target.value) || 0 })}
            className="field-input w-1/3" placeholder="X" />
          <input type="number" step={0.1} value={config.Location?.Y ?? 0}
            onChange={e => update('Location', { ...config.Location, Y: parseFloat(e.target.value) || 0 })}
            className="field-input w-1/3" placeholder="Y" />
          <input type="number" step={0.1} value={config.Location?.Z ?? 0}
            onChange={e => update('Location', { ...config.Location, Z: parseFloat(e.target.value) || 0 })}
            className="field-input w-1/3" placeholder="Z" />
        </div>
      </div>

      <div>
        <div className="text-[9px] text-gray-500 mb-0.5">备注</div>
        <input type="text" value={config.Remark ?? ''}
          onChange={e => update('Remark', e.target.value)}
          className="field-input" placeholder="可选..." />
      </div>

      <details>
        <summary className="text-[10px] text-gray-500 cursor-pointer">目标选择器</summary>
        <div className="mt-1">
          <div className="text-[9px] text-gray-500 mb-0.5">目标</div>
          <select value={config.TargetSelector?.Target ?? 0}
            onChange={e => update('TargetSelector', { ...config.TargetSelector, Target: parseInt(e.target.value) })}
            className="field-input mb-1">
            <option value={0}>当前目标</option>
            <option value={1}>焦点目标</option>
            <option value={2}>目标的目标</option>
            <option value={3}>鼠标指向</option>
            <option value={4}>按过滤条件</option>
          </select>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={!!config.TargetSelector?.Enable}
              onChange={e => update('TargetSelector', { ...config.TargetSelector, Enable: e.target.checked })}
              className="rounded bg-gray-700 border-gray-600" />
            <span className="text-[10px] text-gray-400">启用目标选择器</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer ml-3">
            <input type="checkbox" checked={!!config.TargetSelector?.NeedTargetable}
              onChange={e => update('TargetSelector', { ...config.TargetSelector, NeedTargetable: e.target.checked })}
              className="rounded bg-gray-700 border-gray-600" />
            <span className="text-[10px] text-gray-400">需要可选中</span>
          </label>
        </div>
      </details>
    </div>
  )
}
