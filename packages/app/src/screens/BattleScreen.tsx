// S7 イベントバトル参加画面（M4・T-125。正本: docs/22_M4実装計画.md 3.2節・3.6節、docs/02 6.1節・6.2節）。
// ルームコード入力→ロビー（参加者一覧）→出題中（選択肢ボタンのみの大ボタンUI）→
// 各問後の順位表示→最終リザルト（順位・ベストグロース賞・自分の誤答一覧）の一連。
// BattleRoomDOはコンテンツ非依存（questionIdと換算点のみ）のため、問題文・選択肢の解決・
// 正誤判定はこの画面（各参加端末のローカルパック）が担う（3.2節）。
import { useEffect, useRef, useState } from 'react'
import {
  isBattleCloseReason,
  type BattleServerMessage,
  type Question,
} from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import { PROFILE_ID } from '../db/schema'
import { basePoints, difficultyToRatingSpace, DEFAULT_INITIAL_RATING } from '../engine/rating'
import type { QuestionLookup } from '../engine/types'
import type { BattleSocket } from '../platform'
import { wrongAnswerReviewIds, WRONG_ANSWER_REVIEW_LIMIT } from '../engine/wrongAnswers'
import { useReviewSession } from '../hooks/useReviewSession'
import { recordAnswerPipeline } from '../services/answerPipeline'
import { useAppStore } from '../store/appStore'
import { BattleAward } from '../components/BattleAward'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ChoiceButton, type ChoiceState } from '../components/ChoiceButton'
import { ExplanationCard } from '../components/ExplanationCard'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'
import { StandingsList } from '../components/StandingsList'
import { Wordmark } from '../components/Wordmark'
import { resolveBattleCloseMessage } from './battleCloseMessage'

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
  /** T-178: 未解答のまま締切を迎えた分（ソロ側の isTimeout と同じ扱いで記録する） */
  isTimeout?: boolean
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

/**
 * 参加者の手元に出す設問文（T-178。docs/27 のS-34）。
 * audio_qa は `question` を持たない（音声で流れる）ため、空文字ではなく指示文を出す。
 * ホスト投影側の projectedQuestionText と同じ扱いに揃える
 */
export function participantQuestionText(question: Question): string {
  if (question.question) return question.question
  return '音声で質問が流れます。応答として正しい選択肢を選んでください'
}

export function BattleScreen({ db, battleSocket, questionPool }: Props) {
  const navigate = useAppStore((s) => s.navigate)
  // バトル直後の復習セッション（発起人の要望、2026-08-03）
  const review = useReviewSession(db, questionPool)
  const [phase, setPhase] = useState<Phase>('entry')
  const [codeInput, setCodeInput] = useState('')
  const [participants, setParticipants] = useState<string[]>([])
  /** 自分の表示名（join時に確定）。順位表で自分の行を示すために保持する（V-9） */
  const [selfDisplayName, setSelfDisplayName] = useState('')
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
  /**
   * バトル直後の復習セッションに入れる問題ID（発起人の要望、2026-08-03）。
   * 誤答した問題を mode='solo' の通常セッションとして解き直す。バトル中の解答が
   * レート対象外なのは同時解答という条件差を持ち込まないためで（docs/22 3.5節）、
   * 解き直しは通常の学習なのでレートも通常どおり動く
   */
  const [reviewIds, setReviewIds] = useState<string[]>([])
  /** サーバーが付与した切断理由（closed表示の案内文の出し分けに使う。通信断時は空文字） */
  const [closeReason, setCloseReason] = useState('')
  // T-202（docs/29 Q-46）: window.confirmはPWAでネイティブダイアログが出て文脈が切れる
  // （ConfirmDialog導入の理由そのもの。T-162時点で置換漏れていた2箇所の1つ）
  const [leaveConfirm, setLeaveConfirm] = useState(false)

  // questionPoolはprops経由で固定のためMapはマウント時に1回だけ作る
  const questionLookup = useRef<QuestionLookup>(new Map(questionPool.map((q) => [q.id, q])))
  const answeredThisQuestion = useRef(false)
  const answerRecords = useRef<AnsweredRecord[]>([])
  const finalized = useRef(false)
  /**
   * T-212(Q-44): 一度でもroomStateを受信した（＝実際に接続できた）かどうか。
   * closeReasonが未知（通信断・サーバー到達不可・ルーム不在の一部はいずれも空文字で
   * 区別が付かない）のとき、接続済みからの切断（「接続が切れました」）と、そもそも
   * 接続できなかった（「接続できませんでした」）を出し分けるために使う
   */
  const hasConnectedRef = useRef(false)
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
  /**
   * 出題中の問題の同期参照（レビュー指摘、2026-08-03）。
   * WebSocketのメッセージハンドラはマウント時のクロージャなので state からは読めない。
   * 未解答の時間切れをメッセージ受信時にも確定させるために持つ
   */
  const currentQuestionRef = useRef<Question | null>(null)
  /**
   * T-178: 1問の制限時間（秒）。最初の questionOpen の deadlineAt から実測して覚える。
   * クライアント側に定数を置かない（秒数はDO側が正＝22の3.2節。J-97でDOは変更対象外）
   */
  const [questionSeconds, setQuestionSeconds] = useState<number | null>(null)

  /**
   * 未解答のまま締切を迎えた問題を時間切れとして記録する（T-178。docs/27 のS-36後半）。
   *
   * 呼び出し元は3系統ある——ローカルタイマー（deadlineAt到達）、次の `questionOpen` 受信、
   * `standings`／`result` 受信。**どれが先に来ても1回だけ記録する**ことが要点で、
   * `answeredThisQuestion` で冪等にしている。
   *
   * タイマー単独では足りない（レビュー指摘、2026-08-03）。サーバーの締切判定が
   * ローカルタイマーより先に届くと phase が 'standings' に変わり、カウントダウンeffectの
   * cleanupがタイマーを解除するため、未解答の記録が消えていた。
   *
   * 参照はすべてrefにする（WebSocketのメッセージハンドラはマウント時のクロージャで、
   * stateからは現在の問題を読めない）
   */
  function finalizeUnansweredQuestion(): void {
    const question = currentQuestionRef.current
    if (question === null || answeredThisQuestion.current) return
    answeredThisQuestion.current = true
    const entry: AnsweredRecord = {
      questionId: question.id,
      question,
      isCorrect: false,
      responseMs: questionOpenedAtRef.current > 0 ? now() - questionOpenedAtRef.current : 0,
      isTimeout: true,
    }
    answerRecords.current.push(entry)
    persistAnswer(entry)
  }

  function persistAnswer(record: AnsweredRecord): void {
    persistChain.current = persistChain.current.then(async () => {
      try {
        await recordAnswerPipeline(db, {
          questionId: record.questionId,
          question: record.question,
          lookup: questionLookup.current,
          isCorrect: record.isCorrect,
          responseMs: record.responseMs,
          isTimeout: record.isTimeout,
          mode: 'battle',
          skip: { rating: true },
        })
      } catch (e) {
        console.warn('[BattleScreen] バトル解答のattempts記録に失敗', e)
      }
    })
  }

  useEffect(() => {
    battleSocket.onMessage((message: BattleServerMessage) => {
      if (message.type === 'roomState') {
        hasConnectedRef.current = true
        setParticipants(message.participants.map((p) => p.displayName))
        setPhase((p) => (p === 'connecting' ? 'lobby' : p))
        return
      }
      if (message.type === 'questionOpen') {
        // 前問が未解答のまま次の出題へ進んだ場合はここで時間切れを確定する
        // （レビュー指摘、2026-08-03。ローカルタイマーより先にサーバーのメッセージが
        // 届くと、phase遷移でタイマーが解除されて記録が消えていた）
        finalizeUnansweredQuestion()
        answeredThisQuestion.current = false
        questionOpenedAtRef.current = now()
        setSelectedKey(null)
        setOwnPoints(null)
        setCurrentQuestionIndex(message.questionIndex)
        setDeadlineAt(message.deadlineAt)
        setQuestionSeconds((prev) => prev ?? Math.round((message.deadlineAt - now()) / 1000))
        const question = questionLookup.current.get(message.questionId) ?? null
        currentQuestionRef.current = question
        setCurrentQuestion(question)
        setPackMissing(question === null)
        setPhase('question')
        return
      }
      if (message.type === 'standings') {
        // 締切をサーバーが先に判定した場合の受け皿（上と同じ理由）
        finalizeUnansweredQuestion()
        setStandings(message.entries)
        setPhase('standings')
        return
      }
      if (message.type === 'result') {
        // standingsを挟まずに終了した回でも取りこぼさない
        finalizeUnansweredQuestion()
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
      // 切断理由を保持して案内文を出し分ける（未登録・ルーム不在・ホスト終了・通信断）
      setCloseReason(event.reason)
      setPhase((p) => (p === 'result' ? p : 'closed'))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finalizeUnansweredQuestionは関数宣言（hoisted）でrefのみ参照する。ハンドラの登録はマウント時1回に限る
  }, [battleSocket])

  // 出題中のカウントダウン表示（deadlineAt基準。DO側タイマーが正=22の3.2節）
  useEffect(() => {
    if (phase !== 'question' || deadlineAt === null) return
    const tick = () => setRemainingSec(Math.max(0, Math.ceil((deadlineAt - now()) / 1000)))
    tick()
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [phase, deadlineAt])

  /**
   * T-178（docs/27 のS-36後半）: 未解答のまま締切を迎えた分を記録する。
   * 従来は handleAnswer が呼ばれないので attempts に何も残らず、ソロ側が isTimeout を
   * 記録・可視化しているのに対してバトルの時間切れだけが統計にも復習にも出てこなかった。
   * 記録規則はソロ側に揃える（isCorrect=false・selectedIndex相当なし・isTimeout=true）。
   * 締切の検知は remainingSec が0に達したことで行う（DO側の standings 受信より先に、
   * 参加者の手元で確定させる。二重記録は answeredThisQuestion で防ぐ）
   */
  useEffect(() => {
    if (phase !== 'question' || deadlineAt === null || currentQuestion === null) return
    // 表示用の remainingSec は見ない——初期値0のまま同じコミットでこのeffectが走るため、
    // 出題直後に「締切」と誤判定して解答前に時間切れを記録してしまう（実装時に踏んだ）。
    // deadlineAt から残り時間を直接計算し、その時刻に1回だけ発火させる
    const msLeft = deadlineAt - now()
    if (msLeft <= 0) {
      finalizeUnansweredQuestion()
      return
    }
    const id = window.setTimeout(finalizeUnansweredQuestion, msLeft)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finalizeUnansweredQuestionは関数宣言（hoisted）でrefのみ参照する
  }, [phase, deadlineAt, currentQuestion])

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
      if (cancelled) return
      const wrong = answerRecords.current.filter((r) => !r.isCorrect)
      setWrongCount(wrong.length)
      // 発起人の要望（2026-08-03）: バトル直後に解き直す導線を出す。誤答は復習デッキにも
      // 入るが、次のSRS期限まで待つと熱量が冷める。ここで確定させるのは、refを
      // レンダー中に読まないため（react-hooks/refs）
      setReviewIds(wrongAnswerReviewIds(wrong, WRONG_ANSWER_REVIEW_LIMIT))
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
    // T-212: 再試行のたびに接続実績をリセットする（前回の失敗を今回の判定に持ち越さない）
    hasConnectedRef.current = false
    setPhase('connecting')
    try {
      const [profile, totalRating] = await Promise.all([
        db.profile.get(PROFILE_ID),
        db.ratings.get('total'),
      ])
      const displayName = profile?.displayName ?? '参加者'
      setSelfDisplayName(displayName)
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

  /**
   * 出題中・順位表示中の退出（T-178。docs/27 のS-33）。
   * 抜けると自分の得点が伸びなくなるだけでなくルーム内の参加者枠も空くため、
   * ロビーの退出（確認なし）とは別に確認を挟む
   */
  function handleLeaveWithConfirm() {
    setLeaveConfirm(true)
  }

  /** 退出確認ダイアログ（T-202。docs/29 Q-46）。出題中・順位表示中の両方から共用する */
  const leaveConfirmDialog = leaveConfirm ? (
    <ConfirmDialog
      message="バトルから退出しますか？（このバトルの続きには戻れません）"
      onDismiss={() => setLeaveConfirm(false)}
      actions={[
        {
          label: '退出する',
          primary: true,
          onSelect: () => {
            setLeaveConfirm(false)
            handleLeave()
          },
        },
        { label: 'キャンセル', onSelect: () => setLeaveConfirm(false) },
      ]}
    />
  ) : null

  if (phase === 'entry' || phase === 'connecting') {
    return (
      <ScreenLayout
        status={<p>イベントバトルに参加</p>}
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
        {/* V-13（docs/25 4.4節）: 社内で新しい人が最初に触る場面になりやすく、この画面が
            第一印象になる。ワードマークを1つ置き、入力欄をディスプレイ書体の特大にして
            --surface-gradのカードに収める。演出（アニメーション・光暈）は足さない */}
        <div className="battle-entry">
          <Wordmark />
          <div className="battle-entry__card">
            <p className="battle-entry__eyebrow">ROOM CODE</p>
            <label className="battle-entry__label" htmlFor="battle-room-code">
              ルームコード（4文字）
            </label>
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
          </div>
        </div>
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
        {/* V-13（docs/25 4.4節）: 待機中の唯一の情報は「人が増えるのが見える」ことなので、
            参加者一覧をピル形のチップの並びにする。それ以上の演出は置かない */}
        <div className="battle-lobby">
          <p className="battle-lobby__eyebrow">LOBBY</p>
          <p className="battle-lobby__wait">ホストが開始するまでお待ちください</p>
          <ul className="battle-lobby__chips">
            {/* 表示名は重複しうる（同名の参加者）ためkeyには使わず、サーバー送出順のindexを使う */}
            {participants.map((name, i) => (
              <li key={i} className="battle-lobby__chip">
                {name}
              </li>
            ))}
          </ul>
        </div>
        {/* T-207（Q-56）: 「取得してから参加してください」に対応する操作がアプリ内に無い
            （パック同期は起動時とonline復帰時の自動のみ）。実装に合わせた文言にする */}
        <p className="battle-lobby-hint">
          問題パックは自動で同期されます（未取得の問題は0点で流れます）
        </p>
        {/* T-178（docs/27 のS-35のうちクライアント側で解消できる部分）: 1問の制限時間を
            事前に知らせる。従来は questionOpen 受信時にいきなり「残り30秒」が出ていた。
            秒数はクライアント側に定数を持たず、最初の questionOpen の deadlineAt から
            算出した実測値を使う（サーバー=DOが正という関係を崩さない） */}
        <p className="battle-lobby-hint">
          {questionSeconds === null
            ? '1問あたりの制限時間はホストの設定に従います'
            : `1問あたり約${questionSeconds}秒です`}
        </p>
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
          <>
            {selectedKey !== null ? (
              <p data-testid="battle-own-points">
                {ownPoints !== null ? `獲得点: ${ownPoints}点` : '結果を待っています'}
              </p>
            ) : (
              <p>選択肢をタップして解答してください</p>
            )}
            {/* T-178（docs/27 のS-36前半）: 解答後は解説を出す。従来は選択肢の色と獲得点だけで、
                間違えた理由がその場で分からず、最終リザルトも誤答件数しか出さなかった */}
            {selectedKey !== null && currentQuestion !== null && (
              <ExplanationCard
                question={currentQuestion}
                isCorrect={selectedKey === currentQuestion.answer}
                // aiClient / raidApi はこの画面に注入されていない（BattleScreenのPropsは
                // db・battleSocket・questionPoolのみ）。どちらも任意なので、AI解説と
                // 「問題がおかしい」は出さず、解説・和訳の表示だけを行う。
                // propsを増やすとApp.tsxの配線に及ぶため、J-97のクライアント側限定の
                // 範囲に収める判断で据え置く
                db={db}
                ghostDefense={null}
              />
            )}
            {/* T-178（docs/27 のS-33）: 出題が始まると退出手段が無かった（退出ボタンは
                ロビーのみ）。会議・電車の都合で抜けたいときの逃げ道を出す。
                他の参加者に影響するので確認を挟む */}
            <button type="button" className="secondary-action" onClick={handleLeaveWithConfirm}>
              退出する
            </button>
            {leaveConfirmDialog}
          </>
        }
      >
        {packMissing || currentQuestion === null ? (
          <p data-testid="battle-pack-missing">パック未取得（0点で進行します）</p>
        ) : (
          <>
            {/* T-178（docs/27 のS-34）: audio_qa は question が未定義のため、従来は手元に
                空白＋選択肢だけが並び、投影を見られない位置の参加者は何を問われているか
                分からないまま制限時間が減っていた。ホスト投影側（BattleHostScreen の
                projectedQuestionText）と同じ補完をする */}
            {/* T-225(Q-63): question-textクラスが無く文字サイズ設定（--fs-question）が
                効いていなかった。ドリル・診断・読解・ディクテーションと同じクラスを適用する */}
            <p className="question-text">{participantQuestionText(currentQuestion)}</p>
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
                  // V-12（docs/25 4.4節・JV-7=案B）: イベントバトルだけ記号A–Dを形マーカー
                  // （▲■●◆）に置き換え、ホスト画面の投影と形で対応付ける。ソロ学習の
                  // ドリルは既定の記号表示のまま。出題中に演出は足さない（07の原則3）
                  markerVariant="shape"
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
      <ScreenLayout
        status={<p>途中順位</p>}
        action={
          <>
            <p>次の問題をお待ちください</p>
            <button type="button" className="secondary-action" onClick={handleLeaveWithConfirm}>
              退出する
            </button>
            {leaveConfirmDialog}
          </>
        }
      >
        <StandingsList
          entries={standings}
          selfDisplayName={selfDisplayName}
          listTestId="battle-standings"
        />
      </ScreenLayout>
    )
  }

  if (phase === 'result') {
    return (
      <ScreenLayout
        status={
          <>
            <p>最終リザルト</p>
            {review.conflict && (
              <ConfirmDialog
                message="進行中のセッションを破棄して復習を始めますか？"
                onDismiss={review.cancel}
                actions={[
                  {
                    label: '続きから再開する',
                    primary: true,
                    onSelect: () => void review.resume(),
                  },
                  {
                    label: '破棄して復習を始める',
                    onSelect: () => void review.discardAndStart(),
                  },
                  { label: 'やめる', onSelect: review.cancel },
                ]}
              />
            )}
          </>
        }
        action={
          <>
            {reviewIds.length > 0 && (
              <PrimaryButton onClick={() => void review.start(reviewIds)}>
                間違えた{reviewIds.length}問を復習する
              </PrimaryButton>
            )}
            <button type="button" className="secondary-action" onClick={() => navigate('home')}>
              ホームへ戻る
            </button>
          </>
        }
      >
        {/* 表彰（表彰台・ベストグロース賞・段階開示）はV-10のBattleAwardが持つ。
            上位3名は表彰台に載るため順位表は4位以下だけを描く（fromRank=4）。
            得点バーの基準は entries 全体の1位のままなので相対長は変わらない（docs/25 4.2節） */}
        <StandingsList
          entries={resultEntries}
          label="FINAL RESULT"
          selfDisplayName={selfDisplayName}
          fromRank={4}
          listTestId="battle-result"
        >
          <BattleAward
            entries={resultEntries}
            bestGrowthName={bestGrowthName}
            selfDisplayName={selfDisplayName}
            bestGrowthTestId="battle-best-growth"
          />
        </StandingsList>
        <p data-testid="battle-review-note">誤答{wrongCount}問を復習デッキに登録しました</p>
        {reviewIds.length > 0 && (
          <p data-testid="battle-review-hint">
            このまま解き直せます（下の「間違えた{reviewIds.length}問を復習する」）。
            あとで見返す場合はホームの「間違えた問題」から開けます。
          </p>
        )}
      </ScreenLayout>
    )
  }

  // closed（サーバー切断・finish以外のクローズ）。理由ごとに原因と次にとる行動を出す。
  // V-13（docs/25 4.4節）: 文言はbattleCloseMessage.tsのまま変えず、面をカード化して
  // 見出し（title）と本文（body）の階層を付けるだけに留める。見出しはステータス帯から
  // カード内へ移し、本文と隣り合わせて読めるようにする（重複表示はしない）
  //
  // T-212(Q-44): reasonが未知（通信断・サーバー到達不可はブラウザのWebSocket APIでは
  // いずれも空文字にしかならず区別できない）かつ一度もroomStateを受信していない
  // （＝接続実績が無い）場合は、「切れた」ではなく「そもそも繋がらなかった」と伝える。
  // navigator.onLineでオフラインかどうかだけは区別できるため、その旨を添える
  const knownReason = isBattleCloseReason(closeReason)
  const closeMessage =
    !knownReason && !hasConnectedRef.current
      ? {
          title: '接続できませんでした',
          body: navigator.onLine
            ? 'ルームコードが違っているか、サーバー側に問題が発生している可能性があります。ルームコードを主催者に確認してください。'
            : '通信がオフラインになっています。電波の届く場所でもう一度お試しください。',
        }
      : resolveBattleCloseMessage(closeReason, 'participant')
  return (
    <ScreenLayout
      status={<p>イベントバトル</p>}
      action={
        <>
          {/* T-212(Q-44): 従来は「ホームへ戻る」のみで、再試行にはコード再入力からの
              やり直しが必要だった。codeInputは保持したままentryへ戻すことで、
              コード再入力なしに再試行（または誤りの修正）ができるようにする */}
          <PrimaryButton onClick={() => setPhase('entry')}>もう一度試す</PrimaryButton>
          <button type="button" className="secondary-action" onClick={() => navigate('home')}>
            ホームへ戻る
          </button>
        </>
      }
    >
      <div className="battle-closed">
        <p className="battle-closed__title">{closeMessage.title}</p>
        <p className="battle-closed__body" data-testid="battle-close-reason">
          {closeMessage.body}
        </p>
      </div>
    </ScreenLayout>
  )
}
