import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './monacoSetup'
import { usePrStore } from './store/prStore'

// Dev-only handle for CDP/E2E verification scripts
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__prStore = usePrStore
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
