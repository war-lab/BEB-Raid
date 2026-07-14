// S4 シャドーイング画面（T-48。正本: docs/13 3.5節、docs/02 3.3-3.4、docs/07 6節・7節S4）。
// セッション（SessionItem/attempts記録）の枠外で独立に動く画面（VocabScreenと同様、
// HomeScreenから直接遷移）。1素材の再生完了（最後まで到達 or 3周）で実施ログを記録し、
// レート・tagStats・SRSの対象外にする（J-13）。
import { useEffect, useState } from 'react'
import type { Question } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import type { ListeningStage } from '../db/schema'
import type { ShadowingSentence } from '../engine/shadowing'
import { evaluateStreak } from '../engine/streak'
import type { AudioPlayer } from '../platform'
import { recordAttempt } from '../services/attempts'
import { getOrInitPhaseState } from '../services/phase'
import { useAppStore } from '../store/appStore'
import { KaraokeScript } from '../components/KaraokeScript'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'

interface Props {
  db: BebRaidDatabase
  audioPlayer: AudioPlayer
  /** シャドーイング素材一覧（実データ前はダミー。format==='shadowing'のみ渡される想定） */
  shadowingQuestions: Question[]
}

type ScriptDisplayMode = 'hidden' | 'en' | 'en_ja'

/** 速度チップ（3.5節）。1.15以上はlisteningStage=4のみ表示 */
const SPEED_CHIPS = [0.7, 0.85, 1, 1.15, 1.3] as const
const HIGH_SPEED_MIN_STAGE: ListeningStage = 4
/** 再生完了とみなす周回数（3.5節: 記録規約） */
const COMPLETION_LAPS = 3
/** 3秒戻し（02の3.4） */
const REWIND_MS = 3000

export function ShadowingScreen({ db, audioPlayer, shadowingQuestions }: Props) {
  const navigate = useAppStore((s) => s.navigate)

  const [index, setIndex] = useState(0)
  const [listeningStage, setListeningStage] = useState<ListeningStage>(1)
  const [rate, setRate] = useState<(typeof SPEED_CHIPS)[number]>(1)
  const [scriptMode, setScriptMode] = useState<ScriptDisplayMode>('en')
  const [positionMs, setPositionMs] = useState(0)
  const [laps, setLaps] = useState(0)
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    let cancelled = false
    void getOrInitPhaseState(db)
      .then((state) => {
        if (!cancelled) setListeningStage(state.listeningStage)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [db])

  const question = shadowingQuestions[index]

  function playOptions(overrides?: { startMs?: number; durationMs?: number }) {
    return {
      ...overrides,
      rate: rate !== 1 ? rate : undefined,
      onPosition: setPositionMs,
    }
  }

  async function handlePlay() {
    if (!question?.audio) return
    await audioPlayer.unlock()
    setPositionMs(0)
    await audioPlayer.play(question.audio, playOptions())
    await handlePlaybackEnded()
  }

  async function handlePlaybackEnded() {
    if (!question) return
    const nextLaps = laps + 1
    setLaps(nextLaps)
    if (nextLaps >= COMPLETION_LAPS && !completed) {
      setCompleted(true)
      await recordAttempt(db, {
        questionId: `shadow:${question.id}`,
        mode: 'solo',
        isCorrect: true,
        responseMs: 0,
      })
      await evaluateStreak(db)
    }
  }

  function handleRewind() {
    if (!question?.audio) return
    const startMs = Math.max(0, positionMs - REWIND_MS)
    void audioPlayer.play(question.audio, playOptions({ startMs }))
  }

  function handleSentenceTap(sentence: ShadowingSentence) {
    if (!question?.audio) return
    void audioPlayer.play(
      question.audio,
      playOptions({ startMs: sentence.startMs, durationMs: sentence.durationMs }),
    )
  }

  function handleNext() {
    setIndex((i) => i + 1)
    setLaps(0)
    setCompleted(false)
    setPositionMs(0)
  }

  if (!question) {
    return (
      <ScreenLayout
        action={<PrimaryButton onClick={() => navigate('home')}>ホームへ</PrimaryButton>}
      >
        <p>シャドーイング素材がありません</p>
      </ScreenLayout>
    )
  }

  const availableSpeeds = SPEED_CHIPS.filter(
    (s) => s < 1.15 || listeningStage >= HIGH_SPEED_MIN_STAGE,
  )

  return (
    <ScreenLayout
      status={
        <p className="shadowing-status">
          {index + 1}/{shadowingQuestions.length}（{laps}/{COMPLETION_LAPS}周）
        </p>
      }
      action={
        <>
          {completed ? (
            <PrimaryButton onClick={handleNext}>次へ</PrimaryButton>
          ) : (
            <PrimaryButton onClick={() => void handlePlay()}>再生</PrimaryButton>
          )}
          <button type="button" className="secondary-action" onClick={handleRewind}>
            3秒戻し
          </button>
          <div className="shadowing-speed-chips">
            {availableSpeeds.map((s) => (
              <button
                key={s}
                type="button"
                className={s === rate ? 'is-selected' : ''}
                onClick={() => setRate(s)}
              >
                {s}x
              </button>
            ))}
          </div>
          <div className="shadowing-script-toggle">
            <button
              type="button"
              className={scriptMode === 'hidden' ? 'is-selected' : ''}
              onClick={() => setScriptMode('hidden')}
            >
              非表示
            </button>
            <button
              type="button"
              className={scriptMode === 'en' ? 'is-selected' : ''}
              onClick={() => setScriptMode('en')}
            >
              英文
            </button>
            <button
              type="button"
              className={scriptMode === 'en_ja' ? 'is-selected' : ''}
              onClick={() => setScriptMode('en_ja')}
            >
              英文+和訳
            </button>
          </div>
        </>
      }
    >
      <div className="shadowing-accent-line" />
      {scriptMode !== 'hidden' && question.script && (
        <>
          <KaraokeScript
            script={question.script}
            timing={question.timing ?? null}
            positionMs={positionMs}
            durationMs={question.audioMeta?.durationMs ?? 0}
            onSentenceTap={handleSentenceTap}
          />
          {scriptMode === 'en_ja' && question.translation && (
            <p className="shadowing-translation">{question.translation}</p>
          )}
        </>
      )}
    </ScreenLayout>
  )
}
