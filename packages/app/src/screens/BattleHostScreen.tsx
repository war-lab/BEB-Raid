// S8 昼バトルホスト画面（M4・T-126。正本: docs/22_M4実装計画.md 3.2節・3.6節、docs/02 6.1節・6.2節、
// docs/05 4.2節）。
// ルーム作成→出題セット抽選プレビュー（再抽選可）→参加者が揃ったら開始→
// 問題投影（音声再生完了後にopenQuestion送信）→カウントダウン→各問順位→最終順位・
// ベストグロース表彰、の一連。ホストは参加者として解答しない（進行専任。3.6節末尾）。
// BattleRoomDOはコンテンツ非依存のため、出題セットの抽選・問題文/選択肢の表示・
// 音声再生の判断はすべてこの画面（ホスト端末のローカルパック）が担う
import { useEffect, useRef, useState } from 'react'
import type { BattleServerMessage, Question } from '@beb-raid/shared-schema'
import { drawBattleQuestionSet } from '../engine/battleLottery'
import type { AudioPlayer, BattleSocket, RaidApi } from '../platform'
import { useAppStore } from '../store/appStore'
import { BattleAward } from '../components/BattleAward'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'
import { StandingsList } from '../components/StandingsList'
import { resolveBattleCloseMessage } from './battleCloseMessage'

interface Props {
  raidApi: RaidApi
  battleSocket: BattleSocket
  audioPlayer: AudioPlayer
  /** 出題抽選のプール（キャッシュ済み配信パック由来。App.tsxのquestionPoolをそのまま渡す） */
  questionPool: Question[]
  /** 抽選rng（省略時Math.random。テストで決定的に検証するための注入口） */
  rng?: () => number
}

type Phase =
  'setup' | 'creating' | 'lobby' | 'presenting' | 'question' | 'standings' | 'result' | 'closed'

interface StandingRow {
  displayName: string
  totalPoints: number
}

function now(): number {
  return Date.now()
}

export function BattleHostScreen({ raidApi, battleSocket, audioPlayer, questionPool, rng }: Props) {
  const navigate = useAppStore((s) => s.navigate)
  const [phase, setPhase] = useState<Phase>('setup')
  const [questionSet, setQuestionSet] = useState<Question[]>(() =>
    drawBattleQuestionSet(questionPool, rng),
  )
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [participants, setParticipants] = useState<string[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [deadlineAt, setDeadlineAt] = useState<number | null>(null)
  const [remainingSec, setRemainingSec] = useState(0)
  const [standings, setStandings] = useState<StandingRow[]>([])
  const [resultEntries, setResultEntries] = useState<StandingRow[]>([])
  const [bestGrowthName, setBestGrowthName] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  /** サーバーが付与した切断理由（closed表示の案内文の出し分けに使う。通信断時は空文字） */
  const [closeReason, setCloseReason] = useState('')

  const closeQuestionSentRef = useRef(false)

  useEffect(() => {
    battleSocket.onMessage((message: BattleServerMessage) => {
      if (message.type === 'roomState') {
        setParticipants(message.participants.map((p) => p.displayName))
        return
      }
      if (message.type === 'questionOpen') {
        closeQuestionSentRef.current = false
        setDeadlineAt(message.deadlineAt)
        setPhase('question')
        return
      }
      if (message.type === 'standings') {
        setStandings(message.entries)
        setPhase('standings')
        return
      }
      if (message.type === 'result') {
        setResultEntries(message.entries)
        setBestGrowthName(message.bestGrowth.displayName)
        setPhase('result')
        return
      }
      if (message.type === 'error') {
        setErrorMessage(`エラーが発生しました（${message.code}）`)
      }
    })
    battleSocket.onClose((event) => {
      // 切断理由を保持して案内文を出し分ける（未登録・ルーム不在・終了・通信断）
      setCloseReason(event.reason)
      setPhase((p) => (p === 'result' ? p : 'closed'))
    })
  }, [battleSocket])

  // 画面を離れるときは必ずWebSocketを閉じる（battleSocketはApp.tsxのモジュール単位
  // シングルトンのため、閉じ忘れるとホーム遷移後もホスト接続が残る）
  useEffect(() => {
    return () => battleSocket.close()
  }, [battleSocket])

  // 出題中のカウントダウン。0になったらホストが closeQuestion を送る
  // （DO側タイマーが正=22の3.2節。ホストのタイマーは締切送信の契機に過ぎない）
  useEffect(() => {
    if (phase !== 'question' || deadlineAt === null) return
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadlineAt - now()) / 1000))
      setRemainingSec(remaining)
      if (remaining === 0 && currentIndex >= 0 && !closeQuestionSentRef.current) {
        closeQuestionSentRef.current = true
        battleSocket.send({ type: 'closeQuestion', questionIndex: currentIndex })
      }
    }
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [phase, deadlineAt, currentIndex, battleSocket])

  async function handleRedraw() {
    setQuestionSet(drawBattleQuestionSet(questionPool, rng))
  }

  async function handleCreateRoom() {
    setErrorMessage(null)
    setPhase('creating')
    try {
      const code = await raidApi.createBattleRoom()
      setRoomCode(code)
      battleSocket.connect(code)
      setPhase('lobby')
    } catch (e) {
      console.error('[BattleHostScreen] ルーム作成に失敗', e)
      setErrorMessage('ルームの作成に失敗しました')
      setPhase('setup')
    }
  }

  /**
   * 指定indexの問題を投影する。音声のある問題（Part2=audio_qa）は再生完了後に、
   * 音声の無い問題（Part5=text_blank）は表示と同時に openQuestion を送る
   * （05の4.2節「再生完了イベントで解答受付を開く」。22の6節T-126シート）
   */
  async function presentQuestion(index: number) {
    const question = questionSet[index]
    if (!question) return
    setCurrentIndex(index)
    setCurrentQuestion(question)
    setDeadlineAt(null)
    setPhase('presenting')

    if (question.audio) {
      try {
        await audioPlayer.unlock()
        const questionEndMs = question.audioMeta?.questionEndMs
        await audioPlayer.play(
          question.audio,
          typeof questionEndMs === 'number' ? { durationMs: questionEndMs } : undefined,
        )
      } catch (e) {
        console.warn('[BattleHostScreen] 音声再生に失敗。解答受付は開始する', e)
      }
    }
    battleSocket.send({ type: 'openQuestion', questionIndex: index, questionId: question.id })
  }

  function handleStart() {
    void presentQuestion(0)
  }

  function handleNext() {
    if (currentIndex + 1 < questionSet.length) {
      void presentQuestion(currentIndex + 1)
    }
  }

  function handleFinish() {
    battleSocket.send({ type: 'finish' })
  }

  function handleLeave() {
    battleSocket.close()
    navigate('home')
  }

  const isLastQuestion = currentIndex + 1 >= questionSet.length
  const part2Count = questionSet.filter((q) => q.part === 2).length
  const part5Count = questionSet.filter((q) => q.part === 5).length

  if (phase === 'setup' || phase === 'creating') {
    return (
      <ScreenLayout
        status={<p>昼バトルを主催</p>}
        action={
          <>
            <PrimaryButton onClick={() => void handleCreateRoom()} disabled={phase === 'creating'}>
              ルームを作成
            </PrimaryButton>
            <button type="button" className="secondary-action" onClick={handleRedraw}>
              再抽選
            </button>
            <button type="button" className="secondary-action" onClick={() => navigate('home')}>
              やめる
            </button>
          </>
        }
      >
        <p data-testid="battle-host-lottery-summary">
          出題セット: Part2 {part2Count}問 / Part5 {part5Count}問（計{questionSet.length}問）
        </p>
        <ol className="raid-list" data-testid="battle-host-lottery-preview">
          {questionSet.map((q, i) => (
            <li key={q.id}>
              {i + 1}. [Part{q.part}] {q.question ?? q.script ?? q.id}
            </li>
          ))}
        </ol>
        {errorMessage && (
          <p className="drill-error" role="alert">
            {errorMessage}
          </p>
        )}
      </ScreenLayout>
    )
  }

  if (phase === 'lobby') {
    return (
      <ScreenLayout
        status={<p>ロビー（ルームコード: {roomCode}）</p>}
        action={
          <>
            <PrimaryButton onClick={handleStart}>開始する</PrimaryButton>
            <button type="button" className="secondary-action" onClick={handleLeave}>
              やめる
            </button>
          </>
        }
      >
        <p data-testid="battle-host-room-code" className="drill-timer display-num">
          {roomCode}
        </p>
        <p>参加者にルームコードを伝えてください</p>
        <ul className="raid-list" data-testid="battle-host-participants">
          {/* 表示名は重複しうる（同名の参加者）ためkeyには使わず、サーバー送出順のindexを使う */}
          {participants.map((name, i) => (
            <li key={i}>{name}</li>
          ))}
        </ul>
      </ScreenLayout>
    )
  }

  if (phase === 'presenting') {
    return (
      <ScreenLayout
        status={<p>問{currentIndex + 1}: 音声再生中…</p>}
        action={<p>再生完了後に解答受付が開きます</p>}
      >
        {currentQuestion && <p>{currentQuestion.question ?? currentQuestion.script ?? ''}</p>}
      </ScreenLayout>
    )
  }

  if (phase === 'question') {
    return (
      <ScreenLayout
        status={
          <p className="drill-timer display-num" data-testid="battle-host-timer">
            問{currentIndex + 1}: 残り{remainingSec}秒
          </p>
        }
        action={<p>参加者が解答中です</p>}
      >
        {currentQuestion && (
          <>
            <p>{currentQuestion.question ?? currentQuestion.script ?? ''}</p>
            <ul className="raid-list">
              {currentQuestion.choices?.map((choice) => (
                <li key={choice.key}>
                  {choice.key}. {choice.text}
                </li>
              ))}
            </ul>
          </>
        )}
      </ScreenLayout>
    )
  }

  if (phase === 'standings') {
    return (
      <ScreenLayout
        status={<p>問{currentIndex + 1}終了・途中順位</p>}
        action={
          isLastQuestion ? (
            <PrimaryButton onClick={handleFinish}>結果発表</PrimaryButton>
          ) : (
            <PrimaryButton onClick={handleNext}>次の問題へ</PrimaryButton>
          )
        }
      >
        {/* ホストは解答しないため自分の行が無い（selfDisplayNameを渡さない）。
            投影用のサイズ差は.battle-host配下のCSSで上書きする（docs/25 4.1節） */}
        <div className="battle-host">
          <StandingsList entries={standings} listTestId="battle-host-standings" />
        </div>
      </ScreenLayout>
    )
  }

  if (phase === 'result') {
    return (
      <ScreenLayout
        status={<p>最終リザルト</p>}
        action={<PrimaryButton onClick={() => navigate('home')}>ホームへ戻る</PrimaryButton>}
      >
        {/* 表彰（表彰台・ベストグロース賞・段階開示）はV-10のBattleAwardが持つ。
            上位3名は表彰台に載るため順位表は4位以下だけを描く（fromRank=4）。
            ホストは解答しないためselfDisplayNameは渡さない（docs/25 4.1節・4.2節） */}
        <div className="battle-host">
          <StandingsList
            entries={resultEntries}
            label="FINAL RESULT"
            fromRank={4}
            listTestId="battle-host-result"
          >
            <BattleAward
              entries={resultEntries}
              bestGrowthName={bestGrowthName}
              bestGrowthTestId="battle-host-best-growth"
            />
          </StandingsList>
        </div>
      </ScreenLayout>
    )
  }

  // closed（参加者切断は無関係。ホスト自身の切断・エラー等のクローズ）。
  // 理由ごとに原因と次にとる行動を出す
  const closeMessage = resolveBattleCloseMessage(closeReason, 'host')
  return (
    <ScreenLayout
      status={<p>{closeMessage.title}</p>}
      action={<PrimaryButton onClick={() => navigate('home')}>ホームへ戻る</PrimaryButton>}
    >
      <p data-testid="battle-host-close-reason">{closeMessage.body}</p>
    </ScreenLayout>
  )
}
