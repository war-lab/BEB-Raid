// P0診断（初回チュートリアル。T-20。正本: docs/03 1.2節・5.1、docs/10 T-20行）。
// 表示名＋自己申告TOEIC（任意）入力→アダプティブ30問（L15/R15交互）→
// 完了画面（L/R初期レート＋「ここから伸ばす」。予測スコア帯は出さない=J-1）。
// 診断は独立したレートキャリブレーションのフローのため、通常ドリルの
// tagStats・SRS・processWrongAnswer 等の副作用は起こさない。
import { useEffect, useRef, useState } from 'react'
import type { Question } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import {
  DIAGNOSTIC_ITEMS_PER_SECTION,
  DIAGNOSTIC_TOTAL_ITEMS,
  initialRatingFromToeic,
  sectionForTurn,
  selectNextQuestion,
  TOEIC_SCORE_MAX,
  TOEIC_SCORE_MIN,
  updateDiagnosticRating,
} from '../engine/diagnostic'
import { DEFAULT_INITIAL_RATING, initializeRatings, sectionForPart } from '../engine/rating'
import { getStreak } from '../engine/streak'
import type { AudioPlayer } from '../platform'
import { recordAttempt } from '../services/attempts'
import { countAttemptsToday } from '../services/dailyStats'
import { createProfile } from '../services/profile'
import { DIAGNOSTIC_PROGRESS_KEY } from '../services/settingsKeys'
import { useAppStore } from '../store/appStore'
import { ChoiceButton } from '../components/ChoiceButton'
import { CompletionCard } from '../components/CompletionCard'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'
import { SessionProgress } from '../components/SessionProgress'
import { Wordmark } from '../components/Wordmark'

interface Props {
  db: BebRaidDatabase
  audioPlayer: AudioPlayer
  /** 診断の出題候補プール（実パック読み込みはT-35）。part1-4=L、part5-7=Rとして振り分ける */
  questionPool: Question[]
}

type Step = 'intro' | 'quiz' | 'complete'

/** 診断の途中経過（T-113）。settingsのDIAGNOSTIC_PROGRESS_KEYに保存する一時データ */
interface DiagnosticProgress {
  displayName: string
  toeicInput: string
  turn: number
  ratingL: number
  ratingR: number
  askedL: string[]
  askedR: string[]
  /**
   * T-174の振り返り一覧の元データ（レビュー指摘、2026-08-03）。
   * 持たないと中断復帰後の完了画面が再開後の分だけになる（15問で中断すれば15件しか出ない）。
   * Question実体は保存せず、questionIdだけを持って復元時にプールから引き直す
   * （settingsを問題文で膨らませない）。省略可なのは旧形式の途中経過との互換のため
   */
  answerLog?: DiagnosticAnswerLogRecord[]
}

/** 途中経過に保存する振り返り1件（Question実体は持たない。上のanswerLog参照） */
interface DiagnosticAnswerLogRecord {
  section: 'L' | 'R'
  questionId: string
  selectedKey: string
  isCorrect: boolean
}

// Date.now() を直接コンポーネント本体に書くと react-hooks/purity に引っかかるため別関数越しに呼ぶ
function now(): number {
  return Date.now()
}

/** T-174: 完了画面の振り返り1件分 */
interface DiagnosticAnswerLog {
  section: 'L' | 'R'
  question: Question
  selectedKey: string
  isCorrect: boolean
}

/** 振り返りを途中経過へ保存する形へ落とす */
function toAnswerLogRecords(log: readonly DiagnosticAnswerLog[]): DiagnosticAnswerLogRecord[] {
  return log.map((entry) => ({
    section: entry.section,
    questionId: entry.question.id,
    selectedKey: entry.selectedKey,
    isCorrect: entry.isCorrect,
  }))
}

/**
 * 途中経過の振り返りをQuestion実体つきへ復元する。
 * プールに無いquestionId（配信パックが入れ替わった等）は一覧から落とす——
 * 問題文・正解を出せないため行として成立しない
 */
export function restoreAnswerLog(
  records: readonly DiagnosticAnswerLogRecord[] | undefined,
  questionPool: readonly Question[],
): DiagnosticAnswerLog[] {
  if (!records) return []
  const byId = new Map(questionPool.map((q) => [q.id, q]))
  const restored: DiagnosticAnswerLog[] = []
  for (const record of records) {
    const question = byId.get(record.questionId)
    if (!question) continue
    restored.push({
      section: record.section,
      question,
      selectedKey: record.selectedKey,
      isCorrect: record.isCorrect,
    })
  }
  return restored
}

export function DiagnosticScreen({ db, audioPlayer, questionPool }: Props) {
  const navigate = useAppStore((s) => s.navigate)

  const [step, setStep] = useState<Step>('intro')
  const [displayName, setDisplayName] = useState('')
  const [toeicInput, setToeicInput] = useState('')

  const [turn, setTurn] = useState(0)
  const [ratingL, setRatingL] = useState(DEFAULT_INITIAL_RATING)
  const [ratingR, setRatingR] = useState(DEFAULT_INITIAL_RATING)
  const [askedL, setAskedL] = useState<ReadonlySet<string>>(new Set())
  const [askedR, setAskedR] = useState<ReadonlySet<string>>(new Set())
  const [startedAt, setStartedAt] = useState(() => now())
  const [playState, setPlayState] = useState<'idle' | 'playing' | 'played'>('idle')
  /**
   * T-218（Q-55。DrillScreenのT-110と同じ方式）: 一度ユーザージェスチャー起点の再生に
   * 成功したら、以降のリスニング設問は自動再生する（毎問「タップして開始」を要求しない）。
   * アプリの最初の体験（診断）で15回の追加タップが入っていた問題への対処。
   * DiagnosticScreenは1セッション=1マウントで再マウントされないため、refで保持してよい
   */
  const hasPlayedOnceRef = useRef(false)
  // T-159: 解答処理中フラグ。refは連打の同期的な遮断用、stateはボタンの無効化用
  const submittingRef = useRef(false)
  const [submitting, setSubmitting] = useState(false)

  const [resultL, setResultL] = useState(DEFAULT_INITIAL_RATING)
  const [resultR, setResultR] = useState(DEFAULT_INITIAL_RATING)
  /**
   * T-174（J-95。docs/27 のS-25）: 30問の振り返り用の解答履歴。
   * **診断中は正誤を出さない**（測定が目的で、途中でフィードバックを与えると後続問題に
   * 学習効果が乗りレートの測定精度が落ちる）。代わりに完了画面でまとめて開示する
   */
  const [answerLog, setAnswerLog] = useState<DiagnosticAnswerLog[]>([])
  // T-70: 音声再生失敗時のリカバリ用エラーメッセージ（14の1.4。DrillScreenと同じパターン）
  const [audioError, setAudioError] = useState<string | null>(null)
  // T-78: 完了カード用の「今日の実施数・ストリーク」は診断完了到達時に1回だけ取得する
  const [completionStats, setCompletionStats] = useState<{
    count: number
    streakDays: number
  } | null>(null)
  // T-113: 診断途中経過の永続化。マウント時に残っていれば再開/やり直しを提示する
  const [progressChecked, setProgressChecked] = useState(false)
  const [savedProgress, setSavedProgress] = useState<DiagnosticProgress | null>(null)

  useEffect(() => {
    let cancelled = false
    void db.settings.get(DIAGNOSTIC_PROGRESS_KEY).then((setting) => {
      if (cancelled) return
      setSavedProgress((setting?.value as DiagnosticProgress | undefined) ?? null)
      setProgressChecked(true)
    })
    return () => {
      cancelled = true
    }
  }, [db])

  useEffect(() => {
    if (step !== 'complete') return
    let cancelled = false
    void Promise.all([countAttemptsToday(db), getStreak(db)]).then(([count, streak]) => {
      if (!cancelled) setCompletionStats({ count, streakDays: streak.currentDays })
    })
    return () => {
      cancelled = true
    }
  }, [step, db])

  const lPool = questionPool.filter((q) => sectionForPart(q.part) === 'L')
  const rPool = questionPool.filter((q) => sectionForPart(q.part) === 'R')

  // 出題対象の計算はstep==='intro'/'complete'のearly returnより前に置く（Hooksを
  // 常に同じ順で呼ぶため。以下のuseEffectがこれらの値に依存する）
  const section = sectionForTurn(turn)
  const pool = section === 'L' ? lPool : rPool
  const asked = section === 'L' ? askedL : askedR
  const rating = section === 'L' ? ratingL : ratingR
  const question = selectNextQuestion(pool, asked, rating)
  const needsAudioGate = question?.format === 'audio_qa'

  async function handlePlayStart() {
    setPlayState('playing')
    setAudioError(null)
    try {
      await audioPlayer.unlock()
      if (question!.audio) {
        // audio_qa の音声は「設問＋正答応答」を1ファイルに連結しているため、
        // questionEndMs で打ち切って正答応答の読み上げを漏らさない（DrillScreen と同じ規約）。
        // 旧生成分（questionEndMs 無し）は従来どおり全長再生にフォールバックする
        const questionEndMs = question!.audioMeta?.questionEndMs
        const options =
          needsAudioGate && typeof questionEndMs === 'number' ? { durationMs: questionEndMs } : {}
        await audioPlayer.play(question!.audio, options)
      }
    } catch (err) {
      console.warn('[DiagnosticScreen] 音声再生に失敗', err)
      setPlayState('idle')
      setAudioError('音声を再生できませんでした')
      return
    }
    // T-218: 自動再生が拒否される環境（iOS Safari等）では、この行に到達せず上のcatchで
    // playState='idle'に戻る＝hasPlayedOnceRefも立たないため、次回も従来のタップ開始UIになる
    hasPlayedOnceRef.current = true
    setPlayState('played')
  }

  /**
   * T-218（Q-55。DrillScreenのT-110と同じ方式）: セッション内で一度ユーザージェスチャー
   * 起点の再生に成功したら（hasPlayedOnceRef）、以降のリスニング設問は自動再生する。
   * 自動再生が拒否された場合はhandlePlayStart内のcatchが従来のタップ開始UIへ戻す
   */
  useEffect(() => {
    if (step !== 'quiz' || !needsAudioGate || playState !== 'idle' || !hasPlayedOnceRef.current) {
      return
    }
    void handlePlayStart()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, question?.id, needsAudioGate])

  function handleStart() {
    const trimmed = displayName.trim()
    if (trimmed === '') return
    const toeic = toeicInput.trim() === '' ? null : Number(toeicInput)
    const fallback = DEFAULT_INITIAL_RATING
    const initialL = initialRatingFromToeic(toeic, fallback)
    const initialR = initialRatingFromToeic(toeic, fallback)
    setRatingL(initialL)
    setRatingR(initialR)
    setAskedL(new Set())
    setAskedR(new Set())
    setTurn(0)
    setStartedAt(now())
    setPlayState('idle')
    setStep('quiz')
    void db.settings.put({
      key: DIAGNOSTIC_PROGRESS_KEY,
      value: {
        displayName: trimmed,
        toeicInput,
        turn: 0,
        ratingL: initialL,
        ratingR: initialR,
        askedL: [],
        askedR: [],
      } satisfies DiagnosticProgress,
    })
  }

  /** T-113: 途中経過から再開する（保存済みstateを復元してquizへ進む） */
  function handleResumeProgress() {
    if (!savedProgress) return
    setDisplayName(savedProgress.displayName)
    setToeicInput(savedProgress.toeicInput)
    setRatingL(savedProgress.ratingL)
    setRatingR(savedProgress.ratingR)
    setAskedL(new Set(savedProgress.askedL))
    setAskedR(new Set(savedProgress.askedR))
    // 振り返り一覧も復元する（レビュー指摘、2026-08-03。復元しないと完了画面が
    // 再開後の分だけになる）
    setAnswerLog(restoreAnswerLog(savedProgress.answerLog, questionPool))
    setTurn(savedProgress.turn)
    setStartedAt(now())
    setPlayState('idle')
    setSavedProgress(null)
    setStep('quiz')
  }

  /** T-113: 途中経過を破棄して最初からやり直す */
  function handleRestartProgress() {
    void db.settings.delete(DIAGNOSTIC_PROGRESS_KEY)
    setSavedProgress(null)
  }

  /**
   * 自己申告スコアがあれば30問診断をスキップする（ユーザー指示による設計変更。
   * docs/03 5.1節の「事前値として混ぜる」に加え、スキップ導線を追加した）。
   * `R = TOEIC×1000/990` をそのままL/R初期レートとして確定させる
   */
  async function handleSkip() {
    const trimmed = displayName.trim()
    if (trimmed === '') return
    const toeic = toeicInput.trim() === '' ? null : Number(toeicInput)
    if (toeic === null) return
    const rating = initialRatingFromToeic(toeic, DEFAULT_INITIAL_RATING)
    await initializeRatings(db, { listening: rating, reading: rating })
    await createProfile(db, { displayName: trimmed, initialToeic: toeic })
    // T-113: スキップ時も途中経過を消す（残っていた別セッションの途中経過を含む）
    await db.settings.delete(DIAGNOSTIC_PROGRESS_KEY)
    setResultL(rating)
    setResultR(rating)
    setStep('complete')
  }

  if (step === 'intro') {
    // T-113: 途中経過の有無を確認するまでは何も出さない（settingsの1回読み込みのみで即完了する）
    if (!progressChecked) return null

    // docs/20 V-6: 診断ウェルカムの第一印象改善。
    // docs/26 A-4: 当初はテキストワードマーク（鋼グラデ）だったが、ホーム以降のロゴ画像と
    // 別マークになっていたため Wordmark へ統一した。診断側には別に h1 があるので as="plain"
    // で見出しにはしない（aria-level=1 の重複回避）。
    const wordmark = <Wordmark as="plain" sub="ビーブレイド" />

    if (savedProgress) {
      return (
        <ScreenLayout
          action={
            <>
              <PrimaryButton onClick={handleResumeProgress}>
                続きから再開（{savedProgress.turn + 1}問目から）
              </PrimaryButton>
              <button type="button" className="secondary-action" onClick={handleRestartProgress}>
                最初からやり直す
              </button>
            </>
          }
        >
          {wordmark}
          <div className="diagnostic-hero">
            <h1 style={{ fontSize: 'var(--fs-heading)' }}>診断を再開しますか？</h1>
            <p>前回の診断が途中で終わっています。続きから再開できます。</p>
          </div>
        </ScreenLayout>
      )
    }

    const toeicNum = Number(toeicInput)
    // T-187（Q-36）: NaNチェックのみだと桁誤り（65や6500）がそのまま初期レートへ伝播する。
    // 特にスキップ経路は30問診断を経ずにレートを確定させるため、範囲外は入力時に拒否する
    const toeicValid =
      toeicInput.trim() === '' ||
      (!Number.isNaN(toeicNum) && toeicNum >= TOEIC_SCORE_MIN && toeicNum <= TOEIC_SCORE_MAX)
    const canSkip = toeicInput.trim() !== '' && toeicValid && displayName.trim() !== ''
    return (
      <ScreenLayout
        action={
          <>
            <PrimaryButton
              onClick={handleStart}
              disabled={displayName.trim() === '' || !toeicValid}
            >
              診断を始める
            </PrimaryButton>
            {toeicInput.trim() !== '' && (
              <button
                type="button"
                className="secondary-action"
                onClick={() => void handleSkip()}
                disabled={!canSkip}
              >
                自己申告スコアで診断をスキップ
              </button>
            )}
          </>
        }
      >
        {wordmark}
        <div className="diagnostic-hero">
          <h1 style={{ fontSize: 'var(--fs-heading)' }}>ようこそ</h1>
          <p>
            30問（リスニング15問・リーディング15問）に答えると、あなたの今のレートを推定します。
          </p>
          <p>自己申告TOEICスコアを入力すると、診断をスキップしてすぐ始めることもできます。</p>
        </div>
        {/* T-116(1): 375px幅でラベルと入力欄が同一行に詰まり折返しが乱れる問題への対処。
            settings-listの既存スタイル（label display:block）をブロック配置に流用する。
            docs/20 V-6: フォームを--surface-gradのカード面（diagnostic-form-card）に収める */}
        <div className="settings-list diagnostic-form-card">
          <label>
            表示名
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="表示名"
            />
          </label>
          <label>
            自己申告TOEICスコア（任意）
            <input
              value={toeicInput}
              onChange={(e) => setToeicInput(e.target.value)}
              inputMode="numeric"
              placeholder="例: 650"
            />
          </label>
          {/* T-187（Q-36）: 範囲外入力でボタンが無効になる理由を示す（無言で押せないだけだと
              桁誤りに気づけない） */}
          {toeicInput.trim() !== '' && !toeicValid && (
            <p style={{ color: 'var(--ng)', fontSize: 'var(--fs-note)' }} role="alert">
              TOEICスコアは{TOEIC_SCORE_MIN}〜{TOEIC_SCORE_MAX}の範囲で入力してください
            </p>
          )}
        </div>
      </ScreenLayout>
    )
  }

  if (step === 'complete') {
    return (
      <ScreenLayout
        action={<PrimaryButton onClick={() => navigate('home')}>ホームへ</PrimaryButton>}
      >
        <h1 style={{ fontSize: 'var(--fs-heading)' }}>診断完了</h1>
        <p className="display-num">L: {Math.round(resultL)}</p>
        <p className="display-num">R: {Math.round(resultR)}</p>
        <p>ここから伸ばしていきましょう。</p>
        {completionStats && (
          <CompletionCard
            countLabel={`今日の実施数 ${completionStats.count}問`}
            streakDays={completionStats.streakDays}
            message="ここから伸ばしていきましょう"
          />
        )}
        {/* T-174（J-95。docs/27 のS-25）: 診断中は正誤を出さない代わりに、ここで
            まとめて振り返れるようにする。従来は30問すべて「当たったか外れたか分からない
            まま」連続で答えるだけで、学習アプリの初回体験として離脱要因になっていた。
            測定精度を守るため、途中でのフィードバックは追加していない */}
        {answerLog.length > 0 && (
          <>
            <h2 style={{ fontSize: 'var(--fs-sub)' }}>
              解答の振り返り（正解 {answerLog.filter((a) => a.isCorrect).length}/{answerLog.length}
              ）
            </h2>
            <ul className="result-list" data-testid="diagnostic-review-list">
              {answerLog.map((entry, i) => {
                const correctChoice = entry.question.choices?.find(
                  (c) => c.key === entry.question.answer,
                )
                const selectedChoice = entry.question.choices?.find(
                  (c) => c.key === entry.selectedKey,
                )
                return (
                  <li key={i} className="result-list__item" data-correct={entry.isCorrect}>
                    <span aria-hidden="true" className="result-list__icon" />
                    {/* T-224（J-108）: 番号・セクション記号は言語中立、設問文だけが英文
                        （無ければaudio_qa用の日本語フォールバック） */}
                    <span className="result-list__question">
                      {i + 1}. [{entry.section}]{' '}
                      {entry.question.question ? (
                        <span lang="en">{entry.question.question}</span>
                      ) : (
                        '音声問題'
                      )}
                    </span>
                    {/* 誤答のときだけ「何を選んで何が正解だったか」を出す。
                        正解した問題に同じ量の情報を出すと一覧が読めなくなる。
                        T-224（J-108）: 選択肢本文（英文）だけをspanで括る（記号のみの
                        フォールバックは言語中立なので付けない） */}
                    {!entry.isCorrect && (
                      <span className="result-list__note">
                        選択:{' '}
                        {selectedChoice ? (
                          <span lang="en">{selectedChoice.text}</span>
                        ) : (
                          entry.selectedKey
                        )}{' '}
                        / 正解:{' '}
                        {correctChoice ? (
                          <span lang="en">{correctChoice.text}</span>
                        ) : (
                          entry.question.answer
                        )}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </ScreenLayout>
    )
  }

  // step === 'quiz'（section・pool・asked・rating・question・needsAudioGateは
  // Hooksの呼び出し順を保つため上でまとめて計算済み）
  if (!question) {
    return (
      <ScreenLayout
        action={<PrimaryButton onClick={() => navigate('home')}>ホームへ</PrimaryButton>}
      >
        <p>診断に使える問題がありません。</p>
      </ScreenLayout>
    )
  }

  const choicesInteractive = !needsAudioGate || playState === 'played'

  /** 音声再生に失敗した際、音声なしで解答へ進むフォールバック */
  function handlePlayWithoutAudio() {
    setAudioError(null)
    setPlayState('played')
  }

  async function handleReplay() {
    try {
      await audioPlayer.replay()
    } catch (err) {
      console.warn('[DiagnosticScreen] 再生に失敗', err)
      setAudioError('音声を再生できませんでした')
    }
  }

  /**
   * 解答の多重発火を防ぐ（T-159。docs/27 のS-3）。
   * 従来はボタンが常に有効で解答済みフラグも無く、反応待ちで連打すると
   * recordAttempt が2件・updateDiagnosticRating が2回走った。turn は同じ値から
   * 計算されるため進むのは1問分で、レートだけが二重に動く（＝以降のすべての
   * 出題難易度が実力と乖離する）。
   * refで持つのは、同一バッチ内の2クリックに対してstateの更新が間に合わないため
   */
  async function handleSelect(choiceKey: string) {
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    try {
      await submitAnswer(choiceKey)
    } finally {
      // 失敗時もフラグを戻す（戻さないと画面が操作不能のまま固まる）。
      // 保存失敗の表示自体はこの画面の既存挙動を変えない
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  async function submitAnswer(choiceKey: string) {
    const isCorrect = choiceKey === question!.answer
    const responseMs = now() - startedAt

    await recordAttempt(db, {
      questionId: question!.id,
      mode: 'solo',
      isCorrect,
      responseMs,
    })

    // T-174: 振り返り用に保持する（画面には出さない。完了画面でまとめて開示する）。
    // 追加は attempt の保存が成功した**後**に行う（レビュー指摘、2026-08-03）。
    // 先に足すと、保存が失敗して同じ問題を解答し直したときに一覧だけが重複する
    const nextAnswerLog = [
      ...answerLog,
      { section, question: question!, selectedKey: choiceKey, isCorrect },
    ]
    setAnswerLog(nextAnswerLog)

    const newRating = updateDiagnosticRating(rating, question!.difficulty, isCorrect)
    const nextAsked = new Set(asked)
    nextAsked.add(question!.id)
    if (section === 'L') {
      setRatingL(newRating)
      setAskedL(nextAsked)
    } else {
      setRatingR(newRating)
      setAskedR(nextAsked)
    }

    const nextTurn = turn + 1
    const finalListening = section === 'L' ? newRating : ratingL
    const finalReading = section === 'R' ? newRating : ratingR
    if (nextTurn >= DIAGNOSTIC_TOTAL_ITEMS) {
      // T-306（K-34）: 30問診断（L/R各15問）が既に与えたレート変動の実績を早期K
      // （最初の50問はK=32）の消費量として引き継ぐ。0のままだと診断後さらに
      // 丸ごと50問分の早期Kが乗り、K=32区間が仕様（50問）より長引く
      await initializeRatings(db, {
        listening: finalListening,
        reading: finalReading,
        answerCount: DIAGNOSTIC_ITEMS_PER_SECTION,
      })
      await createProfile(db, {
        displayName: displayName.trim(),
        initialToeic: toeicInput.trim() === '' ? null : Number(toeicInput),
      })
      // T-113: 完了時に途中経過を消す
      await db.settings.delete(DIAGNOSTIC_PROGRESS_KEY)
      setResultL(finalListening)
      setResultR(finalReading)
      setStep('complete')
      return
    }
    setTurn(nextTurn)
    setStartedAt(now())
    setPlayState('idle')
    setAudioError(null)
    // T-113: 1問ごとに途中経過を保存する（中断→再開で1問目からやり直しにならないように）
    void db.settings.put({
      key: DIAGNOSTIC_PROGRESS_KEY,
      value: {
        displayName: displayName.trim(),
        toeicInput,
        turn: nextTurn,
        ratingL: finalListening,
        ratingR: finalReading,
        askedL: [...(section === 'L' ? nextAsked : askedL)],
        askedR: [...(section === 'R' ? nextAsked : askedR)],
        answerLog: toAnswerLogRecords(nextAnswerLog),
      } satisfies DiagnosticProgress,
    })
  }

  return (
    <ScreenLayout
      status={
        <>
          <SessionProgress current={turn + 1} total={DIAGNOSTIC_TOTAL_ITEMS} />
          <button type="button" className="drill-abort" onClick={() => navigate('home')}>
            中断
          </button>
          <p>{section === 'L' ? 'リスニング' : 'リーディング'}</p>
          {/* T-174（J-95）: 正誤が出ないのが意図的であることを伝える。無表示だと
              「壊れているのか」「当たったのか外れたのか」が分からないまま30問続く */}
          <p className="diagnostic-note">正誤は最後にまとめて表示します</p>
        </>
      }
      action={
        <>
          {audioError && (
            <p className="drill-error" role="alert">
              {audioError}
            </p>
          )}
          {needsAudioGate && playState !== 'played' && (
            <>
              <PrimaryButton
                onClick={() => void handlePlayStart()}
                disabled={playState === 'playing'}
              >
                {playState === 'playing'
                  ? '再生中…'
                  : audioError
                    ? 'もう一度試す'
                    : 'タップして開始'}
              </PrimaryButton>
              {audioError && (
                <button type="button" className="secondary-action" onClick={handlePlayWithoutAudio}>
                  音声なしで解答する
                </button>
              )}
            </>
          )}
          {needsAudioGate && playState === 'played' && (
            <button type="button" className="drill-replay" onClick={() => void handleReplay()}>
              もう一度再生
            </button>
          )}
          {choicesInteractive &&
            (question.choices ?? []).map((choice) => (
              <ChoiceButton
                key={choice.key}
                marker={choice.key}
                disabled={submitting}
                onClick={() => void handleSelect(choice.key)}
              >
                {choice.text}
              </ChoiceButton>
            ))}
        </>
      }
    >
      {question.format === 'audio_qa' ? (
        <p className="question-text">
          {playState === 'playing'
            ? '再生中…'
            : playState === 'played'
              ? '音声再生済み'
              : '音声を聞いて解答してください'}
        </p>
      ) : (
        // T-224（J-108）: 設問文は英文そのもの
        <p className="question-text" lang="en">
          {question.question}
        </p>
      )}
    </ScreenLayout>
  )
}
