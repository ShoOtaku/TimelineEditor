import { useState, useMemo } from 'react'
import { useStore } from '../store'
import type { AcrTypeDef } from '@shared/types'

// ============================================================
// ACR Type Viewer — debug panel showing all discovered ACR
// conditions/actions with full field details
// ============================================================

type ViewTab = 'conditions' | 'actions'

export function AcrViewerPanel() {
  const acrConditionTypes = useStore(s => s.acrConditionTypes)
  const acrActionTypes = useStore(s => s.acrActionTypes)
  const acrDllNames = useStore(s => s.acrDllNames)

  const [activeTab, setActiveTab] = useState<ViewTab>('conditions')
  const [expandedType, setExpandedType] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')

  const types = activeTab === 'conditions' ? acrConditionTypes : acrActionTypes

  // Group types by assembly (DLL name)
  const grouped = useMemo(() => {
    const map = new Map<string, AcrTypeDef[]>()
    for (const t of types) {
      const key = t.assemblyName || 'Unknown'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    }
    // Sort groups alphabetically
    return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])))
  }, [types])

  // Filter by search text
  const filteredGroups = useMemo(() => {
    if (!searchText.trim()) return grouped
    const q = searchText.toLowerCase()
    const result = new Map<string, AcrTypeDef[]>()
    for (const [asm, list] of grouped) {
      const filtered = list.filter(t =>
        t.$type.toLowerCase().includes(q) ||
        t.displayName.toLowerCase().includes(q) ||
        t.fields.some(f => f.key.toLowerCase().includes(q)) ||
        (t.interfaces && t.interfaces.some(i => i.toLowerCase().includes(q)))
      )
      if (filtered.length > 0) result.set(asm, filtered)
    }
    return result
  }, [grouped, searchText])

  const totalTypes = types.length
  const totalAssemblies = filteredGroups.size

  const toggleExpand = (key: string) => {
    setExpandedType(prev => prev === key ? null : key)
  }

  return (
    <div className="h-full flex flex-col bg-gray-900 text-gray-200 overflow-hidden">
      {/* Header */}
      <div className="h-8 bg-gray-800 border-b border-gray-700 flex items-center px-3 gap-2 flex-shrink-0">
        <span className="text-[11px] font-semibold text-blue-400">🔍 ACR 类型查看器</span>
        <span className="text-[10px] text-gray-500">
          ({totalTypes} 类型, {totalAssemblies} DLL)
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-700 bg-gray-800/50 flex-shrink-0">
        <TabButton
          active={activeTab === 'conditions'}
          onClick={() => { setActiveTab('conditions'); setExpandedType(null) }}
          count={acrConditionTypes.length}
          label="条件"
        />
        <TabButton
          active={activeTab === 'actions'}
          onClick={() => { setActiveTab('actions'); setExpandedType(null) }}
          count={acrActionTypes.length}
          label="动作"
        />
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 border-b border-gray-700/50 flex-shrink-0">
        <input
          type="text"
          placeholder="搜索类型名 / 字段名 / 接口名..."
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-[11px] text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Type list */}
      <div className="flex-1 overflow-y-auto">
        {filteredGroups.size === 0 ? (
          <div className="p-4 text-center text-gray-500 text-[12px]">
            {searchText ? '没有匹配的类型' : `没有发现 ACR ${activeTab === 'conditions' ? '条件' : '动作'} 类型`}
          </div>
        ) : (
          [...filteredGroups.entries()].map(([asmName, typeList]) => (
            <div key={asmName}>
              {/* Assembly group header */}
              <div className="px-2 py-1 bg-gray-800/70 border-b border-gray-700/30 text-[10px] text-gray-400 font-semibold uppercase tracking-wide sticky top-0">
                📦 {asmName} ({typeList.length})
              </div>
              {typeList.map(t => {
                const typeKey = t.$type
                const isExpanded = expandedType === typeKey
                return (
                  <div key={typeKey} className="border-b border-gray-700/20">
                    {/* Type row */}
                    <div
                      className="px-2 py-1 flex items-center gap-1.5 cursor-pointer hover:bg-gray-800/50 transition-colors"
                      onClick={() => toggleExpand(typeKey)}
                    >
                      <span className="text-[10px] text-gray-500">{isExpanded ? '▼' : '▶'}</span>
                      <span className="text-[11px] font-medium text-gray-200 truncate flex-1">
                        {t.displayName || t.$type.split(',')[0].split('.').pop() || '?'}
                      </span>
                      <span className="text-[9px] text-gray-600">{t.fields.length} 字段</span>
                      {t.interfaces && t.interfaces.length > 0 && (
                        <span className="text-[9px] text-blue-500/70">{t.interfaces.length} 接口</span>
                      )}
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-4 py-1.5 bg-gray-850 border-t border-gray-700/30">
                        {/* Full type name */}
                        <DetailRow label="$type" value={t.$type} mono />
                        <DetailRow label="DisplayName" value={t.displayName} />

                        {/* Interfaces */}
                        {t.interfaces && t.interfaces.length > 0 && (
                          <div className="mb-1">
                            <span className="text-[9px] text-gray-500">接口:</span>
                            {t.interfaces.map((iface, i) => (
                              <div key={i} className="text-[10px] text-blue-400 font-mono ml-2">{iface}</div>
                            ))}
                          </div>
                        )}

                        {/* Base type */}
                        {t.baseType && (
                          <DetailRow label="基类" value={t.baseType} mono />
                        )}

                        {/* Fields */}
                        <div className="mt-1.5 mb-1">
                          <span className="text-[9px] text-gray-500 font-semibold uppercase tracking-wide">字段 ({t.fields.length}):</span>
                        </div>
                        <div className="space-y-0.5">
                          {t.fields.map(f => (
                            <div key={f.key} className="flex items-start gap-1.5 text-[10px] ml-1">
                              <span className="text-yellow-400 font-mono min-w-[80px]">{f.key}</span>
                              <span className="text-gray-500 min-w-[48px]">{f.type}</span>
                              {f.typeName && (
                                <span className="text-purple-400 font-mono text-[9px] truncate" title={f.typeName}>
                                  {f.typeName.split(',').length > 1
                                    ? f.typeName.split(',')[0]
                                    : f.typeName}
                                </span>
                              )}
                              {f.enumValues && f.enumValues.length > 0 && (
                                <span className="text-green-500 text-[9px]">
                                  enum[{f.enumValues.length}]:{' '}
                                  {f.enumValues.slice(0, 5).map(ev => ev.name).join(', ')}
                                  {f.enumValues.length > 5 && '...'}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Enum value detail (expandable per field) */}
                        {t.fields.filter(f => f.enumValues && f.enumValues.length > 0).map(f => (
                          <div key={`enum-${f.key}`} className="mt-1.5 mb-1 ml-1">
                            <div className="text-[9px] text-green-600 font-semibold mb-0.5">
                              {f.key} 枚举值:
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                              {f.enumValues!.map(ev => (
                                <div key={ev.name} className="flex gap-1.5 text-[9px]">
                                  <span className="text-green-400 font-mono min-w-[30px] text-right">{ev.value}</span>
                                  <span className="text-gray-300">{ev.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="h-5 bg-gray-800 border-t border-gray-700 flex items-center px-2 flex-shrink-0">
        <span className="text-[9px] text-gray-600">
          ACR DLLs: {acrDllNames.length > 0 ? acrDllNames.join(', ') : '无'}
        </span>
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────

function TabButton({ active, onClick, count, label }: {
  active: boolean
  onClick: () => void
  count: number
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-1.5 text-[11px] font-medium transition-colors ${
        active
          ? 'bg-gray-900 text-blue-400 border-b-2 border-blue-500'
          : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
      }`}
    >
      {label}
      <span className={`ml-1 text-[9px] ${active ? 'text-blue-500' : 'text-gray-600'}`}>
        ({count})
      </span>
    </button>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  if (!value) return null
  return (
    <div className="flex gap-2 text-[10px] mb-0.5">
      <span className="text-gray-500 min-w-[50px]">{label}:</span>
      <span className={`text-gray-300 truncate ${mono ? 'font-mono' : ''}`} title={value}>
        {value}
      </span>
    </div>
  )
}
