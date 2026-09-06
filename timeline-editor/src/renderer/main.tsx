import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { usePrStore } from './store/prStore'

// Use local monaco-editor package instead of CDN (avoids CSP blocking)
loader.config({ monaco })

// Dev-only handle for CDP/E2E verification scripts
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__prStore = usePrStore
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
