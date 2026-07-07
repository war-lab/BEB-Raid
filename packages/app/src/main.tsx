import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'

// アプリシェルの precache 登録（autoUpdate: 新版検知で次回起動時に更新）
registerSW({ immediate: true })

const root = document.getElementById('root')
if (!root) throw new Error('#root が見つからない')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
