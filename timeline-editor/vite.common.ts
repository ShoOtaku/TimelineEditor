import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Electron 与 Web 构建共用的插件与解析配置

export const commonPlugins = [
  react(),
  tailwindcss(),
]

export const commonResolve = {
  alias: {
    '@shared': path.resolve(__dirname, 'src/shared'),
  },
}
