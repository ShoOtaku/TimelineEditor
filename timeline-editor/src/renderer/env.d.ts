/// <reference types="vite/client" />

import type { PlatformApi } from '../shared/platformApi'

declare global {
  interface Window {
    electronAPI: PlatformApi
  }
}

export {}
