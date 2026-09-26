import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const FOCUSABLE = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

interface ModalShellProps {
  title: string
  description?: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  widthClass?: string
}

export function ModalShell({
  title,
  description,
  onClose,
  children,
  footer,
  widthClass = 'max-w-3xl'
}: ModalShellProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current
    const first = dialog?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? dialog)?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      } else if (event.key === 'Tab' && dialog) {
        trapFocus(event, dialog)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus()
    }
  }, [onClose])

  // Portal 到 body：界面缩放（zoom）会放大 fixed 定位元素，挂在缩放容器内会让
  // 对话框渲染得比窗口还高（底栏按钮被推出屏幕），脱离容器后 max-h 按真实视口计算
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-6"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`flex max-h-[calc(100vh-48px)] w-full ${widthClass} flex-col overflow-hidden rounded-lg border border-gray-600 bg-gray-900 shadow-2xl outline-none`}
      >
        <header className="flex min-h-14 items-start gap-4 border-b border-gray-700 px-5 py-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-gray-100">{title}</h2>
            {description && (
              <p id={descriptionId} className="mt-0.5 text-xs leading-5 text-gray-400">{description}</p>
            )}
          </div>
          <button type="button" onClick={onClose} className="icon-button" aria-label="关闭" title="关闭">
            <X size={17} aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        {footer && <footer className="border-t border-gray-700 px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body
  )
}

function trapFocus(event: KeyboardEvent, dialog: HTMLElement): void {
  const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)]
  if (focusable.length === 0) {
    event.preventDefault()
    dialog.focus()
    return
  }
  const first = focusable[0]
  const last = focusable.at(-1)!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
