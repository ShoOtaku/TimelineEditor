import { useEffect, useRef, useState } from 'react'

interface BaseProps {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onCancel: () => void
}

/**
 * In-app modal. Electron does not implement window.prompt at all, and
 * window.confirm blocks the renderer with a native modal — both are replaced
 * by this component.
 */
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel, danger, onConfirm, onCancel }:
  BaseProps & { onConfirm: () => void }) {
  return (
    <Shell title={title} onCancel={onCancel}>
      {message && <div className="text-[13px] text-gray-300 whitespace-pre-line">{message}</div>}
      <Buttons
        confirmLabel={confirmLabel ?? '确定'}
        cancelLabel={cancelLabel ?? '取消'}
        danger={danger}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </Shell>
  )
}

export function PromptDialog({ title, message, defaultValue, placeholder, confirmLabel, cancelLabel, onConfirm, onCancel }:
  BaseProps & { defaultValue?: string; placeholder?: string; onConfirm: (value: string) => void }) {
  const [value, setValue] = useState(defaultValue ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const submit = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    onConfirm(trimmed)
  }

  return (
    <Shell title={title} onCancel={onCancel}>
      {message && <div className="text-[12px] text-gray-400">{message}</div>}
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); submit() }
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
        }}
        className="field-input"
      />
      <Buttons
        confirmLabel={confirmLabel ?? '确定'}
        cancelLabel={cancelLabel ?? '取消'}
        confirmDisabled={!value.trim()}
        onConfirm={submit}
        onCancel={onCancel}
      />
    </Shell>
  )
}

function Shell({ title, children, onCancel }: { title: string; children: React.ReactNode; onCancel: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center"
      onClick={onCancel}
    >
      <div
        className="w-[420px] max-w-[90vw] bg-gray-800 border border-gray-600 rounded-lg shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-2.5 border-b border-gray-700 text-sm font-semibold text-gray-100">
          {title}
        </div>
        <div className="p-4 space-y-3">{children}</div>
      </div>
    </div>
  )
}

function Buttons({ confirmLabel, cancelLabel, danger, confirmDisabled, onConfirm, onCancel }: {
  confirmLabel: string
  cancelLabel: string
  danger?: boolean
  confirmDisabled?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <button
        onClick={onCancel}
        className="px-3 py-1.5 text-[12px] bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
      >
        {cancelLabel}
      </button>
      <button
        onClick={onConfirm}
        disabled={confirmDisabled}
        className={`px-3 py-1.5 text-[12px] rounded transition-colors disabled:opacity-40 ${
          danger
            ? 'bg-red-800 hover:bg-red-700 text-red-100'
            : 'bg-emerald-700 hover:bg-emerald-600 text-white'}`}
      >
        {confirmLabel}
      </button>
    </div>
  )
}
