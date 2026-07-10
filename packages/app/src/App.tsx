// ルーターレスの画面切替（docs/10 3.1節）。screen 状態（store/appStore.ts）で
// 画面コンポーネントを切り替える。S1ホーム本実装はT-21のため、それまでは
// 暫定のホーム代替画面（コンポーネント確認＋ダミーセッション開始）を置く。
import { SCHEMA_VERSION, type Question } from '@beb-raid/shared-schema'
import { PrimaryButton } from './components/PrimaryButton'
import { ScreenLayout } from './components/ScreenLayout'
import { getDb } from './db/database'
import { DEFAULT_INITIAL_RATING } from './engine/rating'
import { InstallHint } from './pwa/InstallHint'
import { DrillScreen } from './screens/DrillScreen'
import { ResultScreen } from './screens/ResultScreen'
import { startSession, type SessionItem } from './services/session'
import { useAppStore } from './store/appStore'
import { useSessionStore } from './store/sessionStore'
import { getTheme, setTheme } from './theme'

/**
 * 開発用ダミーコンテンツ（docs/10 3.7節）。実パック読み込みはT-35、
 * ホーム画面の本実装はT-21。それまでの「今日のクエスト」代替として、
 * このダミー問題だけでドリル→リザルトの一連を手動確認できるようにする。
 */
const DUMMY_QUESTIONS: Question[] = [
  {
    id: 'dev-p5-001',
    part: 5,
    format: 'text_blank',
    difficulty: 2,
    tags: ['品詞'],
    keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
    question: 'Please ___ the report by Friday.',
    choices: [
      { key: 'A', text: 'submit' },
      { key: 'B', text: 'submission' },
      { key: 'C', text: 'submitted' },
      { key: 'D', text: 'submitting' },
    ],
    answer: 'A',
    explanation: '命令文のため動詞の原形 submit が入る。',
    translation: '金曜日までに報告書を提出してください。',
  },
  {
    id: 'dev-p5-002',
    part: 5,
    format: 'text_blank',
    difficulty: 2,
    tags: ['動詞の形'],
    keyVocab: [{ word: 'attend', sense: '出席する', freqRank: 'A' }],
    question: 'She will ___ the meeting tomorrow.',
    choices: [
      { key: 'A', text: 'attends' },
      { key: 'B', text: 'attend' },
      { key: 'C', text: 'attended' },
      { key: 'D', text: 'attending' },
    ],
    answer: 'B',
    explanation: 'will の後ろは動詞の原形。',
    translation: '彼女は明日その会議に出席する予定だ。',
  },
]

export function App() {
  const screen = useAppStore((s) => s.screen)
  const navigate = useAppStore((s) => s.navigate)
  const beginSession = useSessionStore((s) => s.begin)

  async function handleStartDummySession() {
    const db = getDb()
    const items: SessionItem[] = DUMMY_QUESTIONS.map((q) => ({ questionId: q.id, mode: 'solo' }))
    const snapshot = await startSession(db, { items })
    const [l, r] = await Promise.all([db.ratings.get('L'), db.ratings.get('R')])
    beginSession(snapshot, DUMMY_QUESTIONS, {
      L: l?.rating ?? DEFAULT_INITIAL_RATING,
      R: r?.rating ?? DEFAULT_INITIAL_RATING,
    })
    navigate('drill')
  }

  if (screen === 'drill') return <DrillScreen db={getDb()} />
  if (screen === 'result') return <ResultScreen db={getDb()} />

  return (
    <ScreenLayout
      action={
        <PrimaryButton onClick={() => void handleStartDummySession()}>
          ダミーセッション開始（開発用）
        </PrimaryButton>
      }
    >
      <h1 style={{ fontSize: 'var(--fs-heading)' }}>BEB Raid</h1>
      <p className="question-text">
        開発基盤の確認画面（実画面は F4 で実装）。パックスキーマ v{SCHEMA_VERSION}
      </p>
      <button type="button" onClick={() => setTheme(getTheme() === 'dark' ? 'light' : 'dark')}>
        テーマ切替（確認用）
      </button>
      <InstallHint />
    </ScreenLayout>
  )
}
