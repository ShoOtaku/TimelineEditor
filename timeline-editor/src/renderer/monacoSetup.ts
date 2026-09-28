// Monaco 初始化 —— 使用本地 npm 包而非 CDN（CSP 友好，离线可用），
// 并显式配置 Web Worker，避免编辑器回退到主线程运行。
// C# 语法高亮在 monaco 主包内（basic-languages），只需基础 editor worker。

import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker()
}

loader.config({ monaco })
