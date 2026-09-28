import { defineConfig } from 'vite'
import { commonPlugins, commonResolve } from './vite.common'
import pkg from './package.json'

// Web 版构建 —— 输出纯静态站点，部署到 GitHub Pages（项目页，base 必须带仓库名前缀）。
// 注意：Electron 构建仍走 vite.config.ts，两者互不影响。

export default defineConfig({
  plugins: [...commonPlugins],
  resolve: commonResolve,
  base: '/TimelineEditor/',
  // data/*.json 作为静态资源直出（Web 端经 fetch 加载，替代 Electron 的 app:load* IPC）
  publicDir: 'data',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  build: {
    outDir: 'dist-web',
    // monaco-editor 体积约 3.5MB（gzip 后约 1MB），放宽 chunk 告警阈值
    chunkSizeWarningLimit: 8192
  }
})
