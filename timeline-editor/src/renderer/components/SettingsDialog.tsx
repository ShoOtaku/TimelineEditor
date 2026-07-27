import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import {
  AlertCircle, CheckCircle2, FolderOpen, LoaderCircle, Network, Save, TestTube2
} from 'lucide-react'
import type { AppSettings, ProxySettings, ProxyTestResult } from '@shared/cactbotTypes'
import { DEFAULT_PROXY_SETTINGS, validateProxySettings } from '@shared/networkSettings'
import { ModalShell } from './ModalShell'

interface SettingsDialogProps {
  onClose: () => void
}

type Feedback = { kind: 'success' | 'error' | 'info'; message: string } | null

export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const model = useSettingsModel()
  return <ModalShell
    title="设置"
    description="管理时间轴目录和 cactbot 网络访问。代理只作用于本应用的 Chromium 网络会话。"
    onClose={onClose}
    widthClass="max-w-2xl"
    footer={<SettingsFooter {...model} />}
  >
    <SettingsBody {...model} />
  </ModalShell>
}

function useSettingsModel() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [proxy, setProxy] = useState<ProxySettings>({ ...DEFAULT_PROXY_SETTINGS })
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    window.electronAPI.getSettings().then(result => {
      setSettings(result)
      setProxy(result.proxy)
    }).catch(error => setFeedback({ kind: 'error', message: `读取设置失败: ${String(error)}` }))
  }, [])
  const saveProxy = useSaveProxy(proxy, setProxy, setFeedback, setSaving)
  const testConnection = useTestConnection(saveProxy, setFeedback, setTesting)
  const selectDirectory = useDirectorySelection(setSettings, setFeedback)
  return { settings, proxy, setProxy, feedback, saving, testing, saveProxy, testConnection, selectDirectory }
}

function useSaveProxy(
  proxy: ProxySettings,
  setProxy: Dispatch<SetStateAction<ProxySettings>>,
  setFeedback: Dispatch<SetStateAction<Feedback>>,
  setSaving: Dispatch<SetStateAction<boolean>>
) {
  return useCallback(async (): Promise<boolean> => {
    const validation = validateProxySettings(proxy)
    if (!validation.success) {
      setFeedback({ kind: 'error', message: validation.error })
      return false
    }
    setSaving(true)
    setFeedback({ kind: 'info', message: '正在应用网络设置...' })
    try {
      const result = await window.electronAPI.setProxySettings(validation.settings)
      if (!result.success) {
        setFeedback({ kind: 'error', message: result.error })
        return false
      }
      setProxy(result.settings)
      setFeedback({ kind: 'success', message: '设置已保存并应用' })
      return true
    } catch (error) {
      setFeedback({ kind: 'error', message: `保存设置失败: ${formatUiError(error)}` })
      return false
    } finally {
      setSaving(false)
    }
  }, [proxy, setFeedback, setProxy, setSaving])
}

function useTestConnection(
  saveProxy: () => Promise<boolean>,
  setFeedback: Dispatch<SetStateAction<Feedback>>,
  setTesting: Dispatch<SetStateAction<boolean>>
) {
  return useCallback(async () => {
    if (!await saveProxy()) return
    setTesting(true)
    setFeedback({ kind: 'info', message: '正在通过当前网络设置访问 GitHub...' })
    try {
      const result = await window.electronAPI.testCactbotProxy()
      setFeedback(toTestFeedback(result))
    } catch (error) {
      setFeedback({ kind: 'error', message: `连接测试失败: ${formatUiError(error)}` })
    } finally {
      setTesting(false)
    }
  }, [saveProxy, setFeedback, setTesting])
}

function useDirectorySelection(
  setSettings: Dispatch<SetStateAction<AppSettings | null>>,
  setFeedback: Dispatch<SetStateAction<Feedback>>
) {
  return useCallback(async (kind: 'ae' | 'pr') => {
    try {
      const result = kind === 'ae'
        ? await window.electronAPI.selectAeDirectory()
        : await window.electronAPI.selectPrDirectory()
      if (!result.cancelled && result.directory) {
        setSettings(current => current ? {
          ...current,
          [kind === 'ae' ? 'aeDirectory' : 'prDirectory']: result.directory!
        } : current)
        setFeedback({ kind: 'success', message: `${kind === 'ae' ? 'AE' : 'PR'} 目录已更新` })
      }
    } catch (error) {
      setFeedback({ kind: 'error', message: `选择目录失败: ${formatUiError(error)}` })
    }
  }, [setFeedback, setSettings])
}

type SettingsModel = ReturnType<typeof useSettingsModel>

function SettingsFooter(model: SettingsModel) {
  const disabled = model.saving || model.testing || !model.settings
  return <div className="flex items-center justify-between gap-4">
    <FeedbackLine feedback={model.feedback} />
    <div className="flex shrink-0 items-center gap-2">
      <button type="button" onClick={model.testConnection} disabled={disabled} className="command-button">
        {model.testing ? <LoaderCircle className="animate-spin" size={15} /> : <TestTube2 size={15} />}
        保存并测试
      </button>
      <button type="button" onClick={model.saveProxy} disabled={disabled} className="command-button-primary">
        {model.saving ? <LoaderCircle className="animate-spin" size={15} /> : <Save size={15} />}
        保存设置
      </button>
    </div>
  </div>
}

function SettingsBody(model: SettingsModel) {
  if (!model.settings) return <SettingsSkeleton />
  return <div className="divide-y divide-gray-700">
    <DirectoriesSection settings={model.settings} onSelect={model.selectDirectory} />
    <NetworkSection proxy={model.proxy} setProxy={model.setProxy} />
  </div>
}

function DirectoriesSection({ settings, onSelect }: {
  settings: AppSettings; onSelect: (kind: 'ae' | 'pr') => Promise<void>
}) {
  return <section className="px-5 py-5" aria-labelledby="directories-title">
    <h3 id="directories-title" className="text-sm font-semibold text-gray-200">时间轴目录</h3>
    <p className="mt-1 text-xs text-gray-500">目录变更会立即刷新对应的文件浏览器。</p>
    <div className="mt-4 space-y-3">
      <DirectoryRow label="AEAssist" path={settings.aeDirectory} onSelect={() => onSelect('ae')} />
      <DirectoryRow label="PromeRotation" path={settings.prDirectory} onSelect={() => onSelect('pr')} />
    </div>
  </section>
}

function NetworkSection({ proxy, setProxy }: {
  proxy: ProxySettings; setProxy: Dispatch<SetStateAction<ProxySettings>>
}) {
  return <section className="px-5 py-5" aria-labelledby="network-title">
    <div className="flex items-center justify-between gap-4">
      <div>
        <h3 id="network-title" className="flex items-center gap-2 text-sm font-semibold text-gray-200">
          <Network size={16} aria-hidden="true" /> 网络代理
        </h3>
        <p className="mt-1 text-xs text-gray-500">支持本机 HTTP 或 SOCKS5 服务，不存储认证信息。</p>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-300">
        <input type="checkbox" checked={proxy.enabled}
          onChange={event => setProxy(current => ({ ...current, enabled: event.target.checked }))}
          className="h-4 w-4 accent-blue-500" />
        启用代理
      </label>
    </div>
    <ProxyFields proxy={proxy} setProxy={setProxy} />
    <p className="mt-2 text-[11px] text-gray-500">可用地址：127.0.0.1、localhost、::1</p>
  </section>
}

function ProxyFields({ proxy, setProxy }: {
  proxy: ProxySettings; setProxy: Dispatch<SetStateAction<ProxySettings>>
}) {
  return <div className="mt-4 grid grid-cols-[160px_minmax(0,1fr)_120px] gap-3 max-[700px]:grid-cols-1">
    <fieldset disabled={!proxy.enabled}>
      <legend className="mb-1.5 text-xs font-medium text-gray-400">协议</legend>
      <div className="segmented-control">{(['http', 'socks5'] as const).map(protocol => <button
        key={protocol} type="button" aria-pressed={proxy.protocol === protocol}
        onClick={() => setProxy(current => ({ ...current, protocol }))}
        className={proxy.protocol === protocol ? 'is-active' : ''}>{protocol.toUpperCase()}</button>)}</div>
    </fieldset>
    <label className="block text-xs font-medium text-gray-400" htmlFor="proxy-host">地址
      <input id="proxy-host" value={proxy.host} disabled={!proxy.enabled}
        onChange={event => setProxy(current => ({ ...current, host: event.target.value }))}
        className="field-input mt-1.5 font-mono" spellCheck={false} />
    </label>
    <label className="block text-xs font-medium text-gray-400" htmlFor="proxy-port">端口
      <input id="proxy-port" type="number" min={1} max={65535} value={proxy.port} disabled={!proxy.enabled}
        onChange={event => setProxy(current => ({ ...current, port: Number(event.target.value) }))}
        className="field-input mt-1.5 font-mono" />
    </label>
  </div>
}

function DirectoryRow({ label, path, onSelect }: { label: string; path: string; onSelect: () => void }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)_36px] items-center gap-3">
      <span className="text-xs font-medium text-gray-400">{label}</span>
      <div className="truncate rounded border border-gray-700 bg-gray-950 px-2.5 py-1.5 font-mono text-xs text-gray-300" title={path}>
        {path}
      </div>
      <button type="button" onClick={onSelect} className="icon-button" aria-label={`选择 ${label} 目录`} title={`选择 ${label} 目录`}>
        <FolderOpen size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  if (!feedback) return <span />
  const Icon = feedback.kind === 'success' ? CheckCircle2 : feedback.kind === 'error' ? AlertCircle : LoaderCircle
  const color = feedback.kind === 'success' ? 'text-emerald-400' : feedback.kind === 'error' ? 'text-red-400' : 'text-gray-400'
  return (
    <span className={`flex min-w-0 items-center gap-2 text-xs ${color}`} role="status">
      <Icon size={15} className={feedback.kind === 'info' ? 'shrink-0 animate-spin' : 'shrink-0'} />
      <span className="truncate">{feedback.message}</span>
    </span>
  )
}

function SettingsSkeleton() {
  return (
    <div className="space-y-5 px-5 py-6" aria-label="正在读取设置">
      <div className="h-4 w-28 animate-pulse rounded bg-gray-700" />
      <div className="h-9 animate-pulse rounded bg-gray-800" />
      <div className="h-9 animate-pulse rounded bg-gray-800" />
      <div className="h-4 w-24 animate-pulse rounded bg-gray-700" />
      <div className="h-10 animate-pulse rounded bg-gray-800" />
    </div>
  )
}

function toTestFeedback(result: ProxyTestResult): Feedback {
  if (!result.success) return { kind: 'error', message: result.error || '连接测试失败' }
  return {
    kind: 'success',
    message: `连接成功，${result.latencyMs ?? 0} ms，${result.resolvedProxy || 'DIRECT'}`
  }
}

function formatUiError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
