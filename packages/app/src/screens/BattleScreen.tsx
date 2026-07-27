// S7 昼バトル参加画面（M4・T-125。正本: docs/22_M4実装計画.md 3.2節・3.6節、docs/02 6.1節・6.2節）。
// ルームコード入力→ロビー（参加者一覧）→出題中（選択肢ボタンのみの大ボタンUI）→
// 各問後の順位表示→最終リザルト（順位・ベストグロース賞・自分の誤答一覧）の一連。
// BattleRoomDOはコンテンツ非依存（questionIdと換算点のみ）のため、問題文・選択肢の解決・
// 正誤判定はこの画面（各参加端末のローカルパック）が担う（3.2節）。
import { useEffect, useRef, useState } from 'react'
import type { BattleServerMessage, Question } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import { PROFILE_ID } from '../db/schema'
import { basePoints, difficultyToRatingSpace, DEFAULT_INITIAL_RATING } from '../engine/rating'
import type { QuestionLookup } from '../engine/types'
import type { BattleSocket } from '../platform'
import { recordAnswerPipeline } from '../services/answerPipeline'
import { useAppStore } from '../store/appStore'
import { ChoiceButton, type ChoiceState } from '../components/ChoiceButton'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'

interface Props {
  db: BebRaidDatabase
  battleSocket: BattleSocket
  /** ルームコードからの参加者向け選択肢解決・正誤判定に使う出題プール */
  questionPool: Question[]
}

/**
 * 出題seedとなる難易度→レート空間dの中央値（Part2/Part5の平均的な難易度3を仮定した近似値）。
 * 「期待点=直近の自己平均基礎点」（22の3.2節）の厳密な過去平均はattemptsに基礎点を
 * 保存していないため算出不能（別途スキーマ変更が要る＝R-1/schema領域の変更は本タスク対象外）。
 * 現在のレーティングから導出する近似値を暫定として使う（数値パラメータの暫定扱い＝22の3節冒頭）
 */
const NOMINAL_DIFFICULTY = 3

type Phase = 'entry' | 'connecting' | 'lobby' | 'question' | 'standings' | 'result' | 'closed'

interface AnsweredRecord {
  questionId: string
  question: Question
  isCorrect: boolean
  responseMs: number
}

interface StandingRow {
  displayName: string
  totalPoints: number
}

function now(): number {
  return Date.now()
}

/** ルームコード入力の正規化（4文字・大文字化。22の3.6節） */
export function normalizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4)
}

export function BattleScreen({ db, battleSocket, questionPool }: Props) {
  const navigate = useAppStore((s) => s.navigate)
  const [phase, setPhase] = useState<Phase>('entry')
  const [codeInput, setCodeInput] = useState('')
  const [participants, setParticipants] = useState<string[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [packMissing, setPackMissing] = useState(false)
  const [deadlineAt, setDeadlineAt] = useState<number | null>(null)
  const [remainingSec, setRemainingSec] = useState(0)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [ownPoints, setOwnPoints] = useState<number | null>(null)
  const [standings, setStandings] = useState<StandingRow[]>([])
  const [resultEntries, setResultEntries] = useState<StandingRow[]>([])
  const [bestGrowthName, setBestGrowthName] = useState<string | null>(null)
  const [wrongCount, setWrongCount] = useState(0)

  // questionPoolはprops経由で固定のためMapはマウント時に1回だけ作る
  const questionLookup = useRef<QuestionLookup>(new Map(questionPool.map((q) => [q.id, q])))
  const answeredThisQuestion = useRef(false)
  const answerRecords = useRef<AnsweredRecord[]>([])
  const finalized = useRef(false)
  /**
   * attempts記録の直列化チェーン。解答のたびにここへ繋いで記録する（最終リザルト受信まで
   * 貯めておくと、ホスト切断・通信断でclosedへ落ちた回の解答が1件も残らないため。
   * attemptsは分析の基盤で欠落させない＝CLAUDE.mdの不変条件）。
   * 直列化するのは同一セッションのDexie書き込み順序を解答順と一致させるため
   */
  const persistChain = useRef<Promise<void>>(Promise.resolve())
  /** join時に取得した現在レート（各問の基礎点算出に使い回す。回線都度の再取得はしない） */
  const ratingRef = useRef(DEFAULT_INITIAL_RATING)
  /** questionOpen受信時刻（responseMs算出用） */
  const questionOpenedAtRef = useRef(0)

  useEffect(() => {
    battleSocket.onMessage((message: BattleServerMessage) => {
      if (message.type === 'roomState') {
        setParticipants(message.participants.map((p) => p.displayName))
        setPhase((p) => (p === 'connecting' ? 'lobby' : p))
        return
      }
      if (message.type === 'questionOpen') {
        answeredThisQuestion.current = false
        questionOpenedAtRef.current = now()
        setSelectedKey(null)
        setOwnPoints(null)
        setCurrentQuestionIndex(message.questionIndex)
        setDeadlineAt(message.deadlineAt)
        const question = questionLookup.current.get(message.questionId) ?? null
        setCurrentQuestion(question)
        setPackMissing(question === null)
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
    battleSocket.onClose(() => {
      setPhase((p) => (p === 'result' ? p : 'closed'))
    })
  }, [battleSocket])

  // 出題中のカウントダウン表示（deadlineAt基準。DO側タイマーが正=22の3.2節）
  useEffect(() => {
    if (phase !== 'question' || deadlineAt === null) return
    const tick = () => setRemainingSec(Math.max(0, Math.ceil((deadlineAt - now()) / 1000)))
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [phase, deadlineAt])

  // 画面を離れるときは必ずWebSocketを閉じる（battleSocketはApp.tsxのモジュール単位
  // シングルトンのため、閉じ忘れるとホーム遷移後も接続とルーム内の参加者枠が残る）
  useEffect(() => {
    return () => battleSocket.close()
  }, [battleSocket])

  // 最終リザルト受信時に、解答時から進めてきたattempts記録の完了を待って誤答数を確定する
  // （記録そのものはhandleAnswer時点で開始済み＝persistAnswer。ここでは表示の確定だけを行う）
  useEffect(() => {
    if (phase !== 'result' || finalized.current) return
    finalized.current = true
    let cancelled = false
    void persistChain.current.then(() => {
      if (!cancelled) setWrongCount(answerRecords.current.filter((r) => !r.isCorrect).length)
    })
    return () => {
      cancelled = true
    }
  }, [phase])

  async function handleJoin() {
    const code = normalizeRoomCode(codeInput)
    if (code.length !== 4) {
      setErrorMessage('ルームコードは4文字で入力してください')
      return
    }
    setErrorMessage(null)
    setPhase('connecting')
    try {
      const [profile, totalRating] = await Promise.all([
        db.profile.get(PROFILE_ID),
        db.ratings.get('total'),
      ])
      const displayName = profile?.displayName ?? '参加者'
      const rating = totalRating?.rating ?? DEFAULT_INITIAL_RATING
      ratingRef.current = rating
      const expectedPointsPerQuestion = basePoints(
        rating,
        difficultyToRatingSpace(NOMINAL_DIFFICULTY),
      )
      battleSocket.connect(code)
      battleSocket.send({ type: 'join', displayName, expectedPointsPerQuestion })
    } catch (e) {
      console.error('[BattleScreen] ルーム参加に失敗', e)
      setErrorMessage('ルームへの参加に失敗しました')
      setPhase('entry')
    }
  }

  /**
   * 1問ぶんのattempts記録＋誤答のkeyVocab復習デッキ登録を行う（22の3.2節末尾。
   * レート更新は行わない=skip.rating）。解答した時点で記録するため、以降にホスト切断・
   * 通信断でclosedへ落ちても解答ログは端末に残る
   */
  function persistAnswer(record: AnsweredRecord): void {
    persistChain.current = persistChain.current.then(async () => {
      try {
        await recordAnswerPipeline(db, {
          questionId: record.questionId,
          question: record.question,
          lookup: questionLookup.current,
          isCorrect: record.isCorrect,
          responseMs: record.responseMs,
          mode: 'battle',
          skip: { rating: true },
        })
      } catch (e) {
        console.warn('[BattleScreen] バトル解答のattempts記録に失敗', e)
      }
    })
  }

  function handleAnswer(choiceKey: string) {
    if (
      phase !== 'question' ||
      currentQuestion === null ||
      currentQuestionIndex === null ||
      answeredThisQuestion.current
    ) {
      return
    }
    answeredThisQuestion.current = true
    setSelectedKey(choiceKey)
    const isCorrect = choiceKey === currentQuestion.answer
    const points = isCorrect
      ? basePoints(ratingRef.current, difficultyToRatingSpace(currentQuestion.difficulty))
      : 0
    setOwnPoints(points)
    const responseMs = questionOpenedAtRef.current > 0 ? now() - questionOpenedAtRef.current : 0
    const record: AnsweredRecord = {
      questionId: currentQuestion.id,
      question: currentQuestion,
      isCorrect,
      responseMs,
    }
    answerRecords.current.push(record)
    persistAnswer(record)
    battleSocket.send({ type: 'answer', questionIndex: currentQuestionIndex, points })
  }

  function handleLeave() {
    battleSocket.close()
    navigate('home')
  }

  if (phase === 'entry' || phase === 'connecting') {
    return (
      <ScreenLayout
        status={<p>昼バトルに参加</p>}
        action={
          <>
            <PrimaryButton onClick={() => void handleJoin()} disabled={phase === 'connecting'}>
              参加する
            </PrimaryButton>
            <button type="button" className="secondary-action" onClick={() => navigate('home')}>
              やめる
            </button>
          </>
        }
      >
        <label htmlFor="battle-room-code">ルームコード（4文字）</label>
        <input
          id="battle-room-code"
          className="battle-room-code-input"
          value={codeInput}
          maxLength={4}
          onChange={(e) => setCodeInput(normalizeRoomCode(e.target.value))}
          autoCapitalize="characters"
          autoComplete="off"
        />
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
        status={<p>ロビー</p>}
        action={
          <button type="button" className="secondary-action" onClick={handleLeave}>
            退出する
          </button>
        }
      >
        <p>ホストが開始するまでお待ちください</p>
        <p className="battle-lobby-hint">
          最新パックを取得してから参加してください（未取得の問題は0点で流れます）
        </p>
        <ul className="raid-list">
          {/* 表示名は重複しうる（同名の参加者）ためkeyには使わず、サーバー送出順のindexを使う */}
          {participants.map((name, i) => (
            <li key={i}>{name}</li>
          ))}
        </ul>
      </ScreenLayout>
    )
  }

  if (phase === 'question') {
    return (
      <ScreenLayout
        status={
          <p className="drill-timer display-num" data-testid="battle-timer">
            残り{remainingSec}秒
          </p>
        }
        action={
          selectedKey !== null ? (
            <p data-testid="battle-own-points">
              {ownPoints !== null ? `獲得点: ${ownPoints}点` : '結果を待っています'}
            </p>
          ) : (
            <p>選択肢をタップして解答してください</p>
          )
        }
      >
        {packMissing || currentQuestion === null ? (
          <p data-testid="battle-pack-missing">パック未取得（0点で進行します）</p>
        ) : (
          <>
            <p>{currentQuestion.question}</p>
            {currentQuestion.choices?.map((choice) => {
              let state: ChoiceState = 'idle'
              if (selectedKey !== null) {
                if (choice.key === currentQuestion.answer) state = 'correct'
                else if (choice.key === selectedKey) state = 'wrong'
                else state = 'dimmed'
              }
              return (
                <ChoiceButton
                  key={choice.key}
                  marker={choice.key}
                  state={state}
                  disabled={selectedKey !== null}
                  onClick={() => handleAnswer(choice.key)}
                >
                  {choice.text}
                </ChoiceButton>
              )
            })}
          </>
        )}
      </ScreenLayout>
    )
  }

  if (phase === 'standings') {
    return (
      <ScreenLayout status={<p>途中順位</p>} action={<p>次の問題をお待ちください</p>}>
        <ol className="raid-list" data-testid="battle-standings">
          {standings.map((entry, i) => (
            <li key={i}>
              {entry.displayName}: {entry.totalPoints}点
            </li>
          ))}
        </ol>
      </ScreenLayout>
    )
  }

  if (phase === 'result') {
    return (
      <ScreenLayout
        status={<p>最終リザルト</p>}
        action={<PrimaryButton onClick={() => navigate('home')}>ホームへ戻る</PrimaryButton>}
      >
        <ol className="raid-list" data-testid="battle-result">
          {resultEntries.map((entry, i) => (
            <li key={i}>
              {entry.displayName}: {entry.totalPoints}点
            </li>
          ))}
        </ol>
        {bestGrowthName && (
          <p data-testid="battle-best-growth">ベストグロース賞: {bestGrowthName}</p>
        )}
        <p data-testid="battle-review-note">誤答{wrongCount}問を復習デッキに登録しました</p>
      </ScreenLayout>
    )
  }

  // closed（サーバー切断・finish以外の予期しないクローズ）
  return (
    <ScreenLayout
      status={<p>接続が切れました</p>}
      action={<PrimaryButton onClick={() => navigate('home')}>ホームへ戻る</PrimaryButton>}
    >
      <p>ホストの終了、または通信断で接続が終了しました</p>
    </ScreenLayout>
  )
}
