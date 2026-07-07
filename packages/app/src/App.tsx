// 暫定のコンポーネント確認画面。実画面（S1ホーム等）は F4 で実装し、本コンポーネントは差し替える。
import { useState } from 'react'
import { SCHEMA_VERSION } from '@beb-raid/shared-schema'
import { ChoiceButton } from './components/ChoiceButton'
import { PrimaryButton } from './components/PrimaryButton'
import { ScreenLayout } from './components/ScreenLayout'
import { SessionProgress } from './components/SessionProgress'
import { InstallHint } from './pwa/InstallHint'
import { getTheme, setTheme } from './theme'

export function App() {
  const [answered, setAnswered] = useState(false)

  return (
    <ScreenLayout
      status={<SessionProgress current={7} total={12} />}
      action={
        <>
          <ChoiceButton marker="A" state={answered ? 'correct' : 'idle'}>
            He submitted the report yesterday.
          </ChoiceButton>
          <ChoiceButton marker="B" state={answered ? 'wrong' : 'idle'}>
            It opens at nine.
          </ChoiceButton>
          <ChoiceButton marker="C" state={answered ? 'dimmed' : 'idle'}>
            Near the main entrance.
          </ChoiceButton>
          <PrimaryButton onClick={() => setAnswered((v) => !v)}>
            {answered ? 'リセット' : '正誤表示を確認'}
          </PrimaryButton>
        </>
      }
    >
      <h1 style={{ fontSize: 'var(--fs-heading)' }}>BEB Raid</h1>
      <p className="question-text">
        開発基盤の確認画面（実画面は F4 で実装）。パックスキーマ v{SCHEMA_VERSION}
      </p>
      <p>
        <span className="display-num" style={{ fontSize: 'var(--fs-display)' }}>
          +124
        </span>
      </p>
      <button type="button" onClick={() => setTheme(getTheme() === 'dark' ? 'light' : 'dark')}>
        テーマ切替（確認用）
      </button>
      <InstallHint />
    </ScreenLayout>
  )
}
