import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { registerServiceWorkerUpdates } from './pwa/registerServiceWorkerUpdates'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'

// アプリシェルの precache 登録。T-280（K-3）: onNeedRefreshを渡さないと新版検知時に
// 無条件でリロードされ、セッション中の進行が失われる。適用はユーザー操作に限定する
registerServiceWorkerUpdates(registerSW)

const root = document.getElementById('root')
if (!root) throw new Error('#root が見つからない')

createRoot(root).render(
  <StrictMode>
    {/* レビューF7: render例外の白画面防止（フォールバックUI＋再読み込み導線） */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
