import { useCallback } from 'react'
import { AE_ENUMS, createComplexDefault } from '@shared/aeAssistSpecs'

export function SimplePointSelectorEditor({ selector, onChange }: {
  selector: any
  onChange: (value: any) => void
}) {
  const sel = selector || createComplexDefault('SimplePointSelector')
  const update = useCallback((key: string, value: any) => onChange({ ...sel, [key]: value }), [sel, onChange])
  const selectType = sel.SelectType ?? 0

  return (
    <div className="border border-gray-700 rounded bg-gray-800/60 p-2 space-y-1.5">
      <Field label="点位来源">
        <EnumSelect enumName="SimplePointSelectType" value={selectType} onChange={v => update('SelectType', v)} />
      </Field>

      {selectType === 0 && (
        <Field label="固定坐标">
          <Vector3Editor value={sel.FixedPoint} onChange={v => update('FixedPoint', v)} />
        </Field>
      )}
      {selectType === 3 && (
        <Field label="场地标点"><EnumSelect enumName="WayMark" value={sel.MapMarker ?? 0} onChange={v => update('MapMarker', v)} /></Field>
      )}
      {selectType === 4 && (
        <Field label="头顶标记"><EnumSelect enumName="HeadMarker" value={sel.HeadMarker ?? 0} onChange={v => update('HeadMarker', v)} /></Field>
      )}
      {selectType === 5 && (
        <Field label="小队成员"><EnumSelect enumName="SpellTargetType" value={sel.PartyMember ?? 0} onChange={v => update('PartyMember', v)} /></Field>
      )}
      {(selectType === 4 || selectType === 5) && (
        <>
          <Field label="事件参数 Args0"><NumberInput value={sel.Args0 ?? 0} integer onChange={v => update('Args0', v)} /></Field>
          <Field label="最近事件时间（秒）"><NumberInput value={sel.RecentTime ?? 1} onChange={v => update('RecentTime', v)} /></Field>
        </>
      )}

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={!!sel.RelatePos} onChange={e => update('RelatePos', e.target.checked)} className="rounded bg-gray-700 border-gray-600" />
        <span className="text-[10px] text-gray-400">使用相对位置</span>
      </label>
      {sel.RelatePos && (
        <div className="grid grid-cols-2 gap-1">
          <Field label="外延距离"><NumberInput value={sel.RelatedExDis ?? 1} onChange={v => update('RelatedExDis', v)} /></Field>
          <Field label="旋转角度"><NumberInput value={sel.RelatedRot ?? 0} onChange={v => update('RelatedRot', v)} /></Field>
        </div>
      )}
    </div>
  )
}

export function Vector3Editor({ value, onChange }: { value: any; onChange: (value: any) => void }) {
  const vec = value || { X: 0, Y: 0, Z: 0 }
  return (
    <div className="grid grid-cols-3 gap-1">
      {(['X', 'Y', 'Z'] as const).map(axis => (
        <NumberInput key={axis} value={vec[axis] ?? 0} onChange={n => onChange({ ...vec, [axis]: n })} placeholder={axis} />
      ))}
    </div>
  )
}

export function EnumSelect({ enumName, value, onChange }: { enumName: string; value: number; onChange: (value: number) => void }) {
  return (
    <select value={value} onChange={e => onChange(Number(e.target.value))} className="field-input">
      {(AE_ENUMS[enumName] || []).map(e => <option key={`${e.name}:${e.value}`} value={e.value}>{e.name} ({e.value})</option>)}
    </select>
  )
}

function NumberInput({ value, onChange, integer, placeholder }: { value: number; onChange: (value: number) => void; integer?: boolean; placeholder?: string }) {
  return <input type="number" step={integer ? 1 : 0.1} value={value}
    onChange={e => onChange((integer ? parseInt(e.target.value) : parseFloat(e.target.value)) || 0)}
    placeholder={placeholder} className="field-input" />
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="text-[9px] text-gray-500 mb-0.5">{label}</div>{children}</div>
}
