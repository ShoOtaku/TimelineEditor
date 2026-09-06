import { create } from 'zustand'

interface ConfirmRequest {
  kind: 'confirm'
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  resolve: (ok: boolean) => void
}

interface AlertRequest {
  kind: 'alert'
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
  resolve: () => void
}

interface PromptRequest {
  kind: 'prompt'
  title: string
  message?: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
  resolve: (value: string | null) => void
}

export type DialogRequest = ConfirmRequest | PromptRequest | AlertRequest

interface DialogStore {
  request: DialogRequest | null
  open: (req: DialogRequest) => void
  close: () => void
}

export const useDialogStore = create<DialogStore>((set) => ({
  request: null,
  open: (req) => set({ request: req }),
  close: () => set({ request: null })
}))

/** Await a yes/no answer from the in-app modal (replaces window.confirm) */
export function askConfirm(opts: Omit<ConfirmRequest, 'kind' | 'resolve'>): Promise<boolean> {
  return new Promise(resolve => {
    useDialogStore.getState().open({
      ...opts,
      kind: 'confirm',
      resolve: (ok) => { useDialogStore.getState().close(); resolve(ok) }
    })
  })
}

/** Await a text answer from the in-app modal (window.prompt is unavailable in Electron) */
export function askPrompt(opts: Omit<PromptRequest, 'kind' | 'resolve'>): Promise<string | null> {
  return new Promise(resolve => {
    useDialogStore.getState().open({
      ...opts,
      kind: 'prompt',
      resolve: (value) => { useDialogStore.getState().close(); resolve(value) }
    })
  })
}

/** Show a message with a single dismiss button (e.g. save/load failure) */
export function askAlert(opts: Omit<AlertRequest, 'kind' | 'resolve'>): Promise<void> {
  return new Promise(resolve => {
    useDialogStore.getState().open({
      ...opts,
      kind: 'alert',
      resolve: () => { useDialogStore.getState().close(); resolve() }
    })
  })
}

/** True while any in-app modal is open — global shortcuts must stay quiet then */
export function isDialogOpen(): boolean {
  return useDialogStore.getState().request !== null
}
