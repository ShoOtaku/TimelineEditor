import { useEffect } from 'react'

const normalize = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')

/** 监视 dir，目录内容变化（新建/保存/删除/重命名）时自动调用 reload(dir) 刷新列表 */
export function useDirWatch(dir: string, reload: (dir: string) => void) {
  useEffect(() => {
    if (!dir) return
    void window.electronAPI.watchDir(dir)
    return () => { void window.electronAPI.unwatchDir(dir) }
  }, [dir])

  useEffect(() => {
    if (!dir) return
    return window.electronAPI.onDirChanged(changed => {
      if (normalize(changed) === normalize(dir)) reload(dir)
    })
  }, [dir, reload])
}
