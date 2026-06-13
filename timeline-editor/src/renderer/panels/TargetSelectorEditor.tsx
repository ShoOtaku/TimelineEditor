import { useCallback } from 'react'

export function TargetSelectorEditor({
  selector,
  onChange,
}: {
  selector: any
  onChange: (changes: any) => void
}) {
  const sel = selector || { Enable: false, Target: 0, FilterDatas: [], NeedTargetable: false, SndFilter: 0, PMIndex: 0 }

  const update = useCallback((key: string, value: any) => {
    onChange({ ...sel, [key]: value })
  }, [sel, onChange])

  return (
    <div className="border border-gray-700 rounded bg-gray-800/60 p-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={!!sel.Enable}
            onChange={e => update('Enable', e.target.checked)} className="rounded bg-gray-700 border-gray-600" />
          <span className="text-[10px] text-gray-400">启用</span>
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={!!sel.NeedTargetable}
            onChange={e => update('NeedTargetable', e.target.checked)} className="rounded bg-gray-700 border-gray-600" />
          <span className="text-[10px] text-gray-400">需要可选中</span>
        </label>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <div className="text-[9px] text-gray-500 mb-0.5">目标</div>
          <select value={sel.Target ?? 0} onChange={e => update('Target', parseInt(e.target.value))}
            className="field-input">
            <option value={0}>当前目标</option>
            <option value={1}>焦点目标</option>
            <option value={2}>目标的目标</option>
            <option value={3}>鼠标指向</option>
            <option value={4}>按过滤条件</option>
            <option value={5}>小队成员</option>
          </select>
        </div>
        <div className="flex-1">
          <div className="text-[9px] text-gray-500 mb-0.5">二级过滤</div>
          <select value={sel.SndFilter ?? 0} onChange={e => update('SndFilter', parseInt(e.target.value))}
            className="field-input">
            <option value={0}>无</option>
            <option value={1}>最近</option>
            <option value={2}>最远</option>
          </select>
        </div>
      </div>

      {sel.Target === 5 && (
        <div>
          <div className="text-[9px] text-gray-500 mb-0.5">队伍成员索引</div>
          <input type="number" value={sel.PMIndex ?? 0}
            onChange={e => update('PMIndex', parseInt(e.target.value) || 0)}
            className="field-input w-20" />
        </div>
      )}

      {/* 过滤条件 */}
      <div>
        <div className="text-[9px] text-gray-500 mb-1">过滤条件</div>
        {(sel.FilterDatas || []).map((f: any, idx: number) => (
          <details key={idx} className="border border-gray-700 rounded bg-gray-800/50 mb-1">
            <summary className="px-2 py-1 text-[10px] text-gray-400 cursor-pointer">
              过滤 #{idx + 1}: {['','DataId','Buff','HP %','距离','职业'][f.Filter] || '未知'}
            </summary>
            <div className="p-2 space-y-1">
              <div className="flex gap-1">
                <div className="flex-1">
                  <div className="text-[8px] text-gray-600">过滤类型</div>
                  <select value={f.Filter ?? 1} onChange={e => {
                    const newFilters = sel.FilterDatas.map((fl: any, i: number) => i === idx ? { ...fl, Filter: parseInt(e.target.value) } : fl)
                    update('FilterDatas', newFilters)
                  }} className="field-input">
                    <option value={1}>DataId</option>
                    <option value={2}>Buff</option>
                    <option value={3}>HP %</option>
                    <option value={4}>距离</option>
                    <option value={5}>职业</option>
                  </select>
                </div>
                {(f.Filter === 1 || f.Filter === 2) ? (
                  <div className="flex-1">
                    <div className="text-[8px] text-gray-600">{f.Filter === 1 ? 'DataId' : 'Buff ID'}</div>
                    <input type="number" value={f.UintParam1 ?? 0} onChange={e => {
                      const newFilters = sel.FilterDatas.map((fl: any, i: number) => i === idx ? { ...fl, UintParam1: parseInt(e.target.value) || 0 } : fl)
                      update('FilterDatas', newFilters)
                    }} className="field-input" />
                  </div>
                ) : (
                  <div className="flex-1">
                    <div className="text-[8px] text-gray-600">浮点参数</div>
                    <input type="number" step={0.1} value={f.FloatParam1 ?? 0} onChange={e => {
                      const newFilters = sel.FilterDatas.map((fl: any, i: number) => i === idx ? { ...fl, FloatParam1: parseFloat(e.target.value) || 0 } : fl)
                      update('FilterDatas', newFilters)
                    }} className="field-input" />
                  </div>
                )}
              </div>
              <div className="flex gap-1">
                <div className="flex-1">
                  <div className="text-[8px] text-gray-600">比较</div>
                  <select value={f.CompareType ?? 5} onChange={e => {
                    const newFilters = sel.FilterDatas.map((fl: any, i: number) => i === idx ? { ...fl, CompareType: parseInt(e.target.value) } : fl)
                    update('FilterDatas', newFilters)
                  }} className="field-input">
                    <option value={0}>==</option><option value={1}>!=</option>
                    <option value={2}>{'>'}</option><option value={3}>{'<'}</option>
                    <option value={4}>≥</option><option value={5}>≤</option>
                  </select>
                </div>
                <div className="flex-1">
                  <div className="text-[8px] text-gray-600">Buff比较</div>
                  <select value={f.BuffCompareType ?? 3} onChange={e => {
                    const newFilters = sel.FilterDatas.map((fl: any, i: number) => i === idx ? { ...fl, BuffCompareType: parseInt(e.target.value) } : fl)
                    update('FilterDatas', newFilters)
                  }} className="field-input">
                    <option value={0}>有</option><option value={1}>无</option>
                    <option value={2}>层数 {'>'}</option><option value={3}>层数 {'<'}</option>
                    <option value={4}>时间 {'>'}</option><option value={5}>时间 {'<'}</option>
                  </select>
                </div>
              </div>
              <button onClick={() => {
                update('FilterDatas', sel.FilterDatas.filter((_: any, i: number) => i !== idx))
              }} className="text-[10px] text-red-400 hover:text-red-300">移除过滤</button>
            </div>
          </details>
        ))}
        <button onClick={() => {
          const newFilter = { Filter: 1, Remark: '', StrParam1: '', UintParam1: 0, FloatParam1: 0, LeftTime: 0, JobsCategory: 0, Jobs: 0, CompareType: 5, BuffCompareType: 3, Marker: 0, Nearest: false }
          update('FilterDatas', [...(sel.FilterDatas || []), newFilter])
        }} className="text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-0.5 rounded">
          + 添加过滤
        </button>
      </div>
    </div>
  )
}
