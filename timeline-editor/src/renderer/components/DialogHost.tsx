import { useDialogStore } from '../store/dialogStore'
import { ConfirmDialog, PromptDialog } from './Dialog'

/** Renders whichever dialog askConfirm/askPrompt requested */
export function DialogHost() {
  const request = useDialogStore(s => s.request)
  if (!request) return null

  if (request.kind === 'confirm') {
    return (
      <ConfirmDialog
        title={request.title}
        message={request.message}
        confirmLabel={request.confirmLabel}
        cancelLabel={request.cancelLabel}
        danger={request.danger}
        onConfirm={() => request.resolve(true)}
        onCancel={() => request.resolve(false)}
      />
    )
  }

  return (
    <PromptDialog
      title={request.title}
      message={request.message}
      defaultValue={request.defaultValue}
      placeholder={request.placeholder}
      confirmLabel={request.confirmLabel}
      cancelLabel={request.cancelLabel}
      onConfirm={(value) => request.resolve(value)}
      onCancel={() => request.resolve(null)}
    />
  )
}
