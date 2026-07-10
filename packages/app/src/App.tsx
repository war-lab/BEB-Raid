// ルーターレスの画面切替（docs/10 3.1節）。screen 状態（store/appStore.ts）で
// 画面コンポーネントを切り替える。S1ホーム本実装はT-21のため、それまでは
// 暫定のホーム代替画面（コンポーネント確認＋ダミーセッション開始）を置く。
import { useState } from 'react'
import { SCHEMA_VERSION, type Question } from '@beb-raid/shared-schema'
import { PrimaryButton } from './components/PrimaryButton'
import { ScreenLayout } from './components/ScreenLayout'
import { getDb } from './db/database'
import { DEFAULT_INITIAL_RATING } from './engine/rating'
import { createAudioPlayer } from './platform'
import { InstallHint } from './pwa/InstallHint'
import { DashboardScreen } from './screens/DashboardScreen'
import { DrillScreen } from './screens/DrillScreen'
import { ResultScreen } from './screens/ResultScreen'
import { VocabScreen } from './screens/VocabScreen'
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

/** Part2瞬発（audio_qa）用ダミー問題（T-17。音声は scripts/generate-dummy-audio.mjs で生成） */
const DUMMY_PART2_QUESTIONS: Question[] = [
  {
    id: 'dev-p2-001',
    part: 2,
    format: 'audio_qa',
    difficulty: 2,
    tags: ['疑問詞聞き取り'],
    keyVocab: [{ word: 'submit', sense: '提出する', freqRank: 'S' }],
    audio: '/packs/dev/audio/p2-001.mp3',
    audioMeta: { accent: 'US', tts: false, voice: 'dev-dummy', durationMs: 3000 },
    script: 'When did you submit the report? — I submitted it yesterday.',
    choices: [
      { key: 'A', text: 'Yesterday.' },
      { key: 'B', text: 'In the meeting room.' },
      { key: 'C', text: 'By email.' },
    ],
    answer: 'A',
    explanation: 'When（いつ）への応答なので時を表す Yesterday が正解。',
    translation: '報告書はいつ提出しましたか？ — 昨日提出しました。',
  },
  {
    id: 'dev-p2-002',
    part: 2,
    format: 'audio_qa',
    difficulty: 2,
    tags: ['疑問詞聞き取り'],
    keyVocab: [{ word: 'attend', sense: '出席する', freqRank: 'A' }],
    audio: '/packs/dev/audio/p2-002.mp3',
    audioMeta: { accent: 'UK', tts: false, voice: 'dev-dummy', durationMs: 3000 },
    script: 'Who will attend the meeting? — Ms. Tanaka will.',
    choices: [
      { key: 'A', text: 'At 3 PM.' },
      { key: 'B', text: 'Ms. Tanaka will.' },
      { key: 'C', text: 'In room 4.' },
    ],
    answer: 'B',
    explanation: 'Who（誰）への応答なので人物名で答える B が正解。',
    translation: '誰が会議に出席しますか？ — 田中さんです。',
  },
]

/**
 * 語彙SRS（T-19）用ダミー語彙カード。phraseAudio はPart2用に生成済みの
 * placeholder音声を仮に共用する（本番コンテンツはT-26/T-31で差し替え）
 */
const DUMMY_VOCAB_QUESTIONS: Question[] = [
  ['submit', '提出する', 'S'],
  ['attend', '出席する', 'A'],
  ['negotiate', '交渉する', 'S'],
  ['reimburse', '払い戻す', 'B'],
  ['postpone', '延期する', 'A'],
].map(([word, back, freqRank]) => ({
  id: `dev-vocab-${word}`,
  part: 0,
  format: 'vocab_card',
  difficulty: 1,
  tags: [],
  keyVocab: [],
  front: word,
  phrase: `Please ${word} it as soon as possible.`,
  phraseAudio: '/packs/dev/audio/p2-001.mp3',
  back,
  freqRank: freqRank as Question['freqRank'],
  levelBand: 730,
}))

const audioPlayer = createAudioPlayer()

export function App() {
  const screen = useAppStore((s) => s.screen)
  const navigate = useAppStore((s) => s.navigate)
  const beginSession = useSessionStore((s) => s.begin)
  const [partialAudioMode, setPartialAudioMode] = useState(false)

  async function startDummySession(questions: Question[], usePartialAudio: boolean) {
    const db = getDb()
    const items: SessionItem[] = questions.map((q) => ({ questionId: q.id, mode: 'solo' }))
    const snapshot = await startSession(db, { items })
    const [l, r] = await Promise.all([db.ratings.get('L'), db.ratings.get('R')])
    beginSession(
      snapshot,
      questions,
      { L: l?.rating ?? DEFAULT_INITIAL_RATING, R: r?.rating ?? DEFAULT_INITIAL_RATING },
      { partialAudioMode: usePartialAudio },
    )
    navigate('drill')
  }

  if (screen === 'drill') return <DrillScreen db={getDb()} audioPlayer={audioPlayer} />
  if (screen === 'result') return <ResultScreen db={getDb()} />
  if (screen === 'vocab') {
    return (
      <VocabScreen db={getDb()} audioPlayer={audioPlayer} vocabQuestions={DUMMY_VOCAB_QUESTIONS} />
    )
  }
  if (screen === 'dashboard') return <DashboardScreen db={getDb()} />

  return (
    <ScreenLayout
      action={
        <>
          <PrimaryButton onClick={() => void startDummySession(DUMMY_QUESTIONS, false)}>
            ダミーセッション開始（開発用）
          </PrimaryButton>
          <PrimaryButton
            onClick={() => void startDummySession(DUMMY_PART2_QUESTIONS, partialAudioMode)}
          >
            Part2ダミーセッション開始（開発用）
          </PrimaryButton>
          <label>
            <input
              type="checkbox"
              checked={partialAudioMode}
              onChange={(e) => setPartialAudioMode(e.target.checked)}
            />
            冒頭だけ再生モード（J-5）
          </label>
          <PrimaryButton onClick={() => navigate('vocab')}>語彙SRS開始（開発用）</PrimaryButton>
          <PrimaryButton onClick={() => navigate('dashboard')}>
            ダッシュボード表示（開発用）
          </PrimaryButton>
        </>
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
