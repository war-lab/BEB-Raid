// 読解（Part6/7単一）専用画面（T-104。正本: docs/24 3.5節・02の2.2節）。
// DrillScreenに分岐追加ではなく専用画面にする理由: 本文＋設問の2ペインが
// 既存4択UI（1問1画面）と別レイアウトのため（3.5節）。
// Part7複数パッセージ（相互参照）はT-165でタブ切替を実装した（docs/27 のS-32）。
// 従来は passages[0] のみを描画しており、相互参照型の設問が出ると2通目を読めないまま
// 解答不能になっていた。通常パック配分からの除外（isReadingAllocatable）は維持する——
// あれは「じっくり読解モード専用」という長さの判断（docs/24 3.3節・ADR 0006 判断2）で、
// 表示できるかどうかの話ではない。一方でSRS復習item経由の混入は**許してよくなった**
// （タブで全通を読めるので解答不能にならない）ため、isServable 側にフィルタは足していない。
//
// 採点方針（ADR 0006 判断4・docs/24 3.2節）: audio_setの2/3セット正解ルールは使わず、
// 各subQuestionを独立採点対象とする。レートはRセクションへ1問ごとに反映
// （question.part=6/7→engine/rating.tsのsectionForPartが自動でRへ振る）。
// SRSレビューは本文まるごと再出題しない（3.4節）ため、audio_setと違いセット完了時の
// reviewSrsCard呼び出しは行わない。
//
// Part6は本文に空所マーカー [[1]]…[[n]] を持つ（subQuestions[i]がマーカー[[i+1]]に対応。
// docs/24 3.1節）。空所は非線形にタップして該当設問へジャンプできる（3.5節）。
// Part7単一はマーカーを持たず、設問は「次へ」で順番に進める。
//
// 画面切替（T-105。docs/24 3.3節・3.5節）: 7分/15分パックにPart6・Part7単一が弱点配分で
// 混在するようになったため、セッション内の現在item（useSessionStoreで共有）の
// question.formatを見て、text_passageならこの画面、それ以外ならDrillScreenへ自動的に
// 切り替える（対の効果をDrillScreen側にも実装）。T-104時点では未実装だった
// 「通常セッションからreading画面への遷移方式」の設計判断はここで確定した
import { useEffect, useMemo, useState } from 'react'
import type { BebRaidDatabase } from '../db/database'
import { withSubQuestionLookup } from '../engine/subQuestionLookup'
import { answerSlotsBefore, totalAnswerSlots } from '../engine/answerSlots'
import { shuffle } from '../engine/shuffle'
import type { AiClient, RaidApi } from '../platform'
import { recordAnswerPipeline, type RaidDamageResult } from '../services/answerPipeline'
import { advanceSession } from '../services/session'
import { useAppStore } from '../store/appStore'
import { useSessionStore } from '../store/sessionStore'
import { ChoiceButton, type ChoiceState } from '../components/ChoiceButton'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ExplanationCard } from '../components/ExplanationCard'
import { PassageText, type PassageAnswer } from '../components/PassageText'
import { PrimaryButton } from '../components/PrimaryButton'
import { ScreenLayout } from '../components/ScreenLayout'
import { SessionProgress } from '../components/SessionProgress'

interface Props {
  db: BebRaidDatabase
  /** BYOK AIクライアント（M2・T-56。未注入ならExplanationCardの「AIに聞く」は出ない） */
  aiClient?: AiClient
  /** 共有API（レイド）クライアント（M3・T-101。未注入ならExplanationCardの報告ボタンは出ない） */
  raidApi?: RaidApi
}

/**
 * ペース表示の目安（3.5節: 1問1分）。T-164でこの秒数を超えたら数値のカウントアップを止める
 * （制限時間ではないので自動確定はしない）
 */
const PACE_GUIDE_SECONDS = 60

/**
 * ペース表示のラベル（T-164。docs/27 のS-13）。
 * 目安を超えたら数値のカウントアップをやめる——制限時間ではないのに「経過180秒」と
 * 出続けると、機能的な影響なしに心理的な圧だけが増える。
 *
 * 判定規則を純関数に切り出しているのは、画面テストで60秒の経過を作るには `Date` を
 * フェイクにする必要があり、同一ファイル内の他テスト（実データのDexie操作）と干渉して
 * 不安定になったため。規則はこの関数の単体テストで固定し、画面側は配線だけを見る
 */
export function readingPaceLabel(elapsedSec: number): string {
  return elapsedSec >= PACE_GUIDE_SECONDS
    ? '目安1問/分（1分超）'
    : `目安1問/分（経過${elapsedSec}秒）`
}

// Date.now() を直接コンポーネント本体に書くと react-hooks/purity に引っかかるため
// （DrillScreenと同じ回避策）、別関数越しに呼ぶ
function now(): number {
  return Date.now()
}

export function ReadingScreen({ db, aiClient, raidApi }: Props) {
  const snapshot = useSessionStore((s) => s.snapshot)
  const questions = useSessionStore((s) => s.questions)
  const recordAnswer = useSessionStore((s) => s.recordAnswer)
  const navigate = useAppStore((s) => s.navigate)

  // 表示中の item インデックス（DrillScreenと同じ理由でsnapshot.answeredCountと独立に持つ）
  const [displayIndex, setDisplayIndex] = useState(() => snapshot?.answeredCount ?? 0)
  // サブ設問インデックス（0始まり）→ 解答済みの結果。Part6は非線形にタップされうるためMapで持つ
  const [answers, setAnswers] = useState<Map<number, PassageAnswer>>(new Map())
  // M4・T-129: サブ設問インデックス→レイドダメージ結果（該当時のみ設定。ExplanationCardの
  // 堅い/弱点バッジ・実ダメージ表示に使う。answersと同じライフサイクルでitem切替時にクリアする）
  const [ghostDefenseByIndex, setGhostDefenseByIndex] = useState<Map<number, RaidDamageResult>>(
    new Map(),
  )
  // 現在選択肢を表示しているサブ設問（空所タップ・「次へ」で切り替わる）
  const [activeIndex, setActiveIndex] = useState(0)
  const [startedAt, setStartedAt] = useState(() => now())
  // ペース表示用の経過秒数（3.5節: 15秒タイマーは付けない。柔らかい目安のみ）
  const [elapsedSec, setElapsedSec] = useState(0)
  const [saveError, setSaveError] = useState<string | null>(null)
  // T-176: 保存に失敗した解答をやり直すための保持（関数はオブジェクトで包む）
  const [retrySave, setRetrySave] = useState<{ run: () => Promise<void> } | null>(null)
  // T-162（docs/27 のS-7）: 中断の確認
  const [abortConfirm, setAbortConfirm] = useState(false)
  /**
   * T-165（docs/27 のS-32）: 表示中のパッセージ（複数文書のPart7用）。
   * 従来は passages[0] しか描画せず、相互参照型の設問が出ると2通目を読めないまま
   * 解答不能になっていた
   */
  const [activePassageIndex, setActivePassageIndex] = useState(0)

  const item = snapshot?.items[displayIndex]
  const question = item ? questions.get(item.questionId) : undefined
  const subQuestions = question?.subQuestions ?? []
  const passages = question?.passages ?? []
  // 範囲外（item切替直後にindexが残っている等）は先頭へ落とす
  const passage = passages[activePassageIndex] ?? passages[0]
  const activeSub = subQuestions[activeIndex]
  const activeAnswer = answers.get(activeIndex) ?? null

  const subQuestionLookup = useMemo(
    () => (question ? withSubQuestionLookup(question, questions) : questions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question?.id],
  )

  // T-79と同じ理由: 選択肢は設問が変わるたびに1回だけシャッフルする（丸暗記防止）
  const shuffledChoices = useMemo(
    () => (activeSub?.choices ? shuffle(activeSub.choices) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question?.id, activeIndex],
  )

  // ペース表示の秒針を進める。解答済みなら止める（速答を煽らないため自動確定はしない）。
  // T-164: 目安（PACE_GUIDE_SECONDS）を超えたら更新自体を止める（表示が「1分超」に切り替わり
  // 数値を出さなくなるため、進め続ける意味がない）
  useEffect(() => {
    if (activeAnswer || elapsedSec >= PACE_GUIDE_SECONDS) return
    const interval = setInterval(() => {
      setElapsedSec(Math.floor((now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [activeAnswer, startedAt, elapsedSec])

  // T-105（24の3.3節・3.5節）: 7分/15分パックに読解以外のitem（Part2音声・Part5等）が
  // 混在するようになったため、現在itemがtext_passageでなければDrillScreenへ切り替える
  // （DrillScreen側の対の効果と合わせ、item.question.formatに応じて2画面を往復する）
  useEffect(() => {
    if (!snapshot || !item || !question || question.format === 'text_passage') return
    navigate('drill')
  }, [item, question, snapshot, navigate])

  // item はあるが questionId が解決できない場合（DrillScreenと同じ理由のリカバリ）
  useEffect(() => {
    if (!snapshot || !item || question) return
    let cancelled = false
    console.warn(`[ReadingScreen] questionIdが解決できないためスキップ: ${item.questionId}`)
    void advanceSession(db, snapshot)
      .then((nextSnapshot) => {
        if (cancelled) return
        useSessionStore.setState({ snapshot: nextSnapshot })
        if (displayIndex + 1 >= snapshot.items.length) {
          navigate('result')
        } else {
          setDisplayIndex((i) => i + 1)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [item, question, snapshot, displayIndex, db, navigate])

  if (!snapshot || !item || !question) {
    if (snapshot && !item) navigate('result')
    return null
  }
  // text_passage以外はこのコンポーネントの担当外（上のeffectがdrill画面へ切り替える）。
  // 切り替え完了までの1レンダーは何も描画しない
  if (question.format !== 'text_passage') return null

  // T-175（docs/27 のS-26）: 進捗の分母を実際の解答回数にする。text_passage は1itemで
  // サブ設問全問を要求するため、item数だと進捗が実態と合わない
  const total = totalAnswerSlots(snapshot.items, questions)
  // レビュー指摘: 読解5問なら最終解答後に 6/5 と出てしまう（バー幅だけは丸められるが
  // 表示文字とaria-valuenowは超過する）。総数で丸める
  const current = Math.min(
    answerSlotsBefore(snapshot.items, questions, displayIndex) + answers.size + 1,
    total,
  )

  /** 空所タップ・設問切替（該当設問へジャンプ。3.5節）。解答済み設問も閲覧のため切替可 */
  function handleSelectBlank(index: number) {
    setActiveIndex(index)
  }

  async function finalizeSubQuestionAnswer(
    index: number,
    choiceKey: string,
    options?: { isRetry?: boolean },
  ) {
    const sub = subQuestions[index]
    // 再試行時は answers に残っている（正誤表示を保持しているため）ので二重解答ガードを通す
    if (!question || !item || !sub || (answers.has(index) && !options?.isRetry)) return
    const isCorrect = choiceKey === sub.answer
    const responseMs = now() - startedAt
    setAnswers((prev) => new Map(prev).set(index, { selectedKey: choiceKey, isCorrect }))
    setSaveError(null)

    try {
      // 読解は各subQuestionを独立採点（2/3ルール不使用=3.2節）。SRSレビューは
      // 本文まるごと再出題しないため呼ばない（skip.srs）。レート・tagStats・
      // keyVocab循環は通常どおり（skipしない）。ただしmode='battle'（ボス役セッション=
      // M4・T-128）はレート更新の対象外（docs/22 3.5節・DrillScreenと同じ扱い）
      const { ratingUpdate, raidDamage } = await recordAnswerPipeline(db, {
        questionId: sub.id,
        question,
        lookup: subQuestionLookup,
        isCorrect,
        responseMs,
        mode: item.mode,
        skip: { srs: true, rating: item.mode === 'battle' },
      })
      if (raidDamage) {
        setGhostDefenseByIndex((prev) => new Map(prev).set(index, raidDamage))
      }
      recordAnswer(snapshot, {
        questionId: sub.id,
        isCorrect,
        basePoints: isCorrect ? (ratingUpdate?.basePoints ?? 0) : 0,
      })
      setRetrySave(null)
    } catch (err) {
      console.error('[ReadingScreen] 解答の保存に失敗', err)
      setSaveError('解答を保存できませんでした。通信状態と空き容量を確認してください')
      // T-176（docs/27 のS-27）: 正誤フィードバックは保持したまま再試行させる。
      // 従来は answers から該当indexを消して選び直させていたが、正解が既に見えている
      // 状態で選び直させることになり操作の意味がなかった
      setRetrySave({ run: () => finalizeSubQuestionAnswer(index, choiceKey, { isRetry: true }) })
    }
  }

  function handleSelectChoice(choiceKey: string) {
    if (activeAnswer) return
    void finalizeSubQuestionAnswer(activeIndex, choiceKey)
  }

  /** 次の未解答設問へ（無ければ次の未解答へ巡回）。全問解答済みならitemを進める */
  function findNextUnanswered(from: number, answered: ReadonlyMap<number, PassageAnswer>) {
    for (let step = 1; step <= subQuestions.length; step++) {
      const idx = (from + step) % subQuestions.length
      if (!answered.has(idx)) return idx
    }
    return null
  }

  async function handleNext() {
    if (answers.size >= subQuestions.length) {
      const nextSnapshot = await advanceSession(db, snapshot!)
      useSessionStore.setState({ snapshot: nextSnapshot })
      if (displayIndex + 1 >= total) {
        navigate('result')
        return
      }
      setDisplayIndex((i) => i + 1)
      setAnswers(new Map())
      setGhostDefenseByIndex(new Map())
      setActiveIndex(0)
      setActivePassageIndex(0)
      setStartedAt(now())
      return
    }
    const next = findNextUnanswered(activeIndex, answers)
    if (next !== null) {
      setActiveIndex(next)
      setStartedAt(now())
    }
  }

  return (
    <ScreenLayout
      status={
        <>
          {/* T-162（docs/27 のS-7）: 中断は画面最上部にあり、誤タップでセッションから
              抜けていた。ダイアログは position:fixed なのでDOM上の位置は問わない */}
          {abortConfirm && (
            <ConfirmDialog
              message="読解を中断してホームへ戻りますか？（解答済みの分は保存されます）"
              onDismiss={() => setAbortConfirm(false)}
              actions={[
                {
                  label: '中断してホームへ',
                  primary: true,
                  onSelect: () => {
                    setAbortConfirm(false)
                    navigate('home')
                  },
                },
                { label: '読解を続ける', onSelect: () => setAbortConfirm(false) },
              ]}
            />
          )}
          <SessionProgress current={current} total={total} />
          <button type="button" className="drill-abort" onClick={() => setAbortConfirm(true)}>
            中断
          </button>
          {/* docs/25 4.8節（V-19）: DrillScreenと同じ英字パートタグ（.drill-part-tagを再利用）。
              表示のみの追加で、読解は必ずPart6/7なのでVOCAB分岐は持たない */}
          <span className="drill-part-tag">PART {question.part}</span>
          {/* T-164（docs/27 のS-13）: 目安の1分を超えたら数値のカウントアップを止める。
              制限時間ではないのに「経過180秒」と出続けると、機能的な影響なしに心理的な圧だけが
              増える。自動確定は従来どおり行わない（速答を煽らない=3.5節） */}
          {!activeAnswer && <p className="reading-pace">{readingPaceLabel(elapsedSec)}</p>}
        </>
      }
      action={
        <>
          {saveError && (
            <>
              <p className="drill-error" role="alert">
                {saveError}
              </p>
              {retrySave && (
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => void retrySave.run()}
                >
                  保存を再試行する
                </button>
              )}
            </>
          )}
          {activeSub &&
            shuffledChoices.map((choice) => {
              let state: ChoiceState = 'idle'
              if (activeAnswer) {
                if (choice.key === activeSub.answer) state = 'correct'
                else if (choice.key === activeAnswer.selectedKey) state = 'wrong'
                else state = 'dimmed'
              }
              return (
                <ChoiceButton
                  key={choice.key}
                  marker={choice.key}
                  state={state}
                  disabled={activeAnswer !== null}
                  onClick={() => handleSelectChoice(choice.key)}
                >
                  {choice.text}
                </ChoiceButton>
              )
            })}
          {activeAnswer && activeSub && (
            <>
              <ExplanationCard
                question={{
                  ...question,
                  question: activeSub.question,
                  choices: activeSub.choices,
                  answer: activeSub.answer,
                  explanation: activeSub.explanation,
                  translation: activeSub.translation,
                }}
                isCorrect={activeAnswer.isCorrect}
                aiClient={aiClient}
                raidApi={raidApi}
                db={db}
                ghostDefense={
                  ghostDefenseByIndex.get(activeIndex)?.ghostDefenseMultiplier !== undefined
                    ? {
                        multiplier: ghostDefenseByIndex.get(activeIndex)!.ghostDefenseMultiplier!,
                        damage: ghostDefenseByIndex.get(activeIndex)!.damage,
                      }
                    : null
                }
              />
              <PrimaryButton onClick={() => void handleNext()}>次へ</PrimaryButton>
              {/* T-164（docs/27 のS-31）: T-122でドリルに入れた途中終了導線を読解にも適用する。
                  従来は全サブ設問を解き切るまでリザルトへ到達できず、抜ける手段は「中断」
                  （ホーム直行）だけだったため、Part7の長文を全問解く覚悟がないと入れなかった。
                  解答済みが1問以上あり、かつ未解答が残っているときだけ出す */}
              {answers.size < subQuestions.length && (
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => navigate('result')}
                >
                  ここで終了して結果を見る
                </button>
              )}
            </>
          )}
        </>
      }
    >
      {/* T-165（docs/27 のS-32）: 複数文書のときだけタブを出す。1件のときは従来の表示を
          変えない（タブが常に出ると単一文書の読解に無用な要素が増える） */}
      {passages.length >= 2 && (
        <div className="reading-passage-tabs" role="tablist" aria-label="文書の切り替え">
          {passages.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={i === activePassageIndex}
              className={i === activePassageIndex ? 'is-selected' : ''}
              onClick={() => setActivePassageIndex(i)}
            >
              文書{i + 1}（{p.kind}）
            </button>
          ))}
        </div>
      )}
      {passage && (
        // docs/25 4.8節（V-19）: パッセージ面に--surface-gradを当てる。面と罫線だけで、
        // 光暈・アニメーションは足さない（07の原則3: 読解中は静かであるべき）
        <div className="reading-passage">
          <p className="passage-kind">{passage.kind}</p>
          <PassageText
            text={passage.text}
            subQuestions={subQuestions}
            answers={answers}
            activeIndex={activeIndex}
            onSelectBlank={handleSelectBlank}
          />
        </div>
      )}
      {activeSub && (
        <p className="question-text" data-testid="reading-question">
          設問{activeIndex + 1}/{subQuestions.length}: {activeSub.question}
        </p>
      )}
    </ScreenLayout>
  )
}
