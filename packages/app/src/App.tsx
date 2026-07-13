// ルーターレスの画面切替（docs/10 3.1節）。screen 状態（store/appStore.ts）で
// 画面コンポーネントを切り替える。S1ホーム（T-21）で暫定の確認画面から差し替え済み。
// 起動時、profile未作成（=P0診断未完了）なら診断画面から始める（T-20）。
import { useEffect, useState } from 'react'
import type { Question } from '@beb-raid/shared-schema'
import { getDb } from './db/database'
import { createAudioPlayer, createPackCache } from './platform'
import { hasProfile } from './services/profile'
import { DashboardScreen } from './screens/DashboardScreen'
import { DiagnosticScreen } from './screens/DiagnosticScreen'
import { DrillScreen } from './screens/DrillScreen'
import { HomeScreen } from './screens/HomeScreen'
import { ResultScreen } from './screens/ResultScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { VocabScreen } from './screens/VocabScreen'
import { useAppStore } from './store/appStore'

/**
 * 開発用ダミーコンテンツ（docs/10 3.7節）。実パック読み込みはT-35で差し替える。
 * ホーム画面の「今日のクエスト」quickPack生成・各モード単独起動の両方に使う出題プール
 */
const DUMMY_PART5_QUESTIONS: Question[] = [
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

/** ホーム画面の「今日のクエスト」quickPack生成用（全形式を混ぜたプール） */
const QUESTION_POOL: Question[] = [
  ...DUMMY_PART5_QUESTIONS,
  ...DUMMY_PART2_QUESTIONS,
  ...DUMMY_VOCAB_QUESTIONS,
]

const audioPlayer = createAudioPlayer()
const packCache = createPackCache()

export function App() {
  const screen = useAppStore((s) => s.screen)
  const navigate = useAppStore((s) => s.navigate)
  // 起動時のprofile有無チェックが終わるまで描画をブロックする（HomeScreenが一瞬
  // 見えてから診断へ切り替わるチラつきを防ぐ。IndexedDBの主キー1件読みのみのため
  // 起動3秒要件には影響しない）
  const [bootChecked, setBootChecked] = useState(false)

  useEffect(() => {
    let cancelled = false
    void hasProfile(getDb()).then((exists) => {
      if (cancelled) return
      if (!exists) navigate('diagnostic')
      setBootChecked(true)
    })
    return () => {
      cancelled = true
    }
  }, [navigate])

  if (!bootChecked) return null

  if (screen === 'diagnostic') {
    return <DiagnosticScreen db={getDb()} audioPlayer={audioPlayer} questionPool={QUESTION_POOL} />
  }
  if (screen === 'drill') return <DrillScreen db={getDb()} audioPlayer={audioPlayer} />
  if (screen === 'result') return <ResultScreen db={getDb()} />
  if (screen === 'vocab') {
    return (
      <VocabScreen db={getDb()} audioPlayer={audioPlayer} vocabQuestions={DUMMY_VOCAB_QUESTIONS} />
    )
  }
  if (screen === 'dashboard') return <DashboardScreen db={getDb()} />
  if (screen === 'settings') return <SettingsScreen db={getDb()} packCache={packCache} />

  // 'home' に加え、未実装の画面もホームへフォールバックする
  return <HomeScreen db={getDb()} questionPool={QUESTION_POOL} />
}
