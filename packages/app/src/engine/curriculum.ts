// フェーズエンジン（M2・T-51。正本: docs/03 1.2・8節、docs/13 3.1・3.2節）。
//
// カリキュラム（P1–P3）・リスニング段階（L1–L4）の達成条件判定と初期割当を行う。
// 「純粋関数（本体）＋DBアクセスの薄い層（services/phase.ts）」の構成は
// srs.ts/rating.ts と同じパターンに揃える。ここでは判定ロジックのみを持ち、
// DB読み書きは services/phase.ts が担う。

import type { FreqRank, Question } from '@beb-raid/shared-schema'

import type { ListeningStage, PhaseSeason, SrsCardRecord } from '../db/schema'
import rawCurriculumConfig from './curriculumConfig.json'
import type {
  AccuracyCriterion,
  CriterionEvaluation,
  CurriculumTemplate,
  ExamScoreCriterion,
  PhaseCriteria,
  PhaseCriterion,
  PhaseTransitionResult,
  SetAccuracyCriterion,
  SrsRetentionCriterion,
} from './types'

/** attempts側の最小限フィールド（cli/calibrate.tsと同じ疎結合の型設計） */
export interface CriterionAttempt {
  questionId: string
  isCorrect: boolean
  answeredAt: number
}

/** examScores側の最小限フィールド */
export interface CriterionExamScore {
  total: number
}

/** 各条件タイプの評価に必要な入力データ一式（呼び出し側=services/phase.tsが組み立てる） */
export interface CriterionContext {
  attempts: readonly CriterionAttempt[]
  srsCards: readonly SrsCardRecord[]
  examScores: readonly CriterionExamScore[]
  /** 問題ID→問題実体の解決表（part/tags/keyVocab/freqRankの参照に使う） */
  questionLookup: ReadonlyMap<string, Question>
}

/** SRS定着の判定基準（13の3.1節: stage>=2=間隔7日以上 または 卒業済み） */
const RETENTION_MIN_STAGE = 2

/** srsRetention判定の最低サンプル数（導入済みカード数。3.1節） */
const MIN_INTRODUCED_FOR_RETENTION = 20

/** accuracy/setAccuracy判定で「分母不足」とみなす閾値（window/windowSetsの半分未満） */
const INSUFFICIENT_SAMPLE_RATIO = 0.5

/** レート更新対象外のattemptsを問題別集計から除外するプレフィックス（03の規約） */
function isCountableAttempt(questionId: string): boolean {
  return !questionId.startsWith('vocab:') && !questionId.startsWith('shadow:')
}

/**
 * 単語の頻出度ランクを問題解決表から引く（calibrate.tsのcurrentRankByWordと同じ発想）。
 * vocab_cardのfrontが一致すればそれを優先し、無ければ他問題のkeyVocabから探す
 */
function wordFreqRank(word: string, questions: Iterable<Question>): FreqRank | undefined {
  let fallback: FreqRank | undefined
  for (const q of questions) {
    if (q.format === 'vocab_card' && q.front === word && q.freqRank) {
      return q.freqRank
    }
    if (fallback === undefined) {
      const kv = q.keyVocab.find((k) => k.word === word)
      if (kv) fallback = kv.freqRank
    }
  }
  return fallback
}

/** srsRetention条件の評価（13の3.1節） */
export function evaluateSrsRetention(
  criterion: SrsRetentionCriterion,
  ctx: CriterionContext,
): CriterionEvaluation {
  const targetCards = ctx.srsCards.filter(
    (c) =>
      c.refType === 'vocab' &&
      wordFreqRank(c.refId, ctx.questionLookup.values()) === criterion.minRank,
  )
  const introduced = targetCards.filter((c) => (c.introducedDate ?? null) !== null)
  if (introduced.length < MIN_INTRODUCED_FOR_RETENTION) {
    return { criterion, insufficientData: true, met: false }
  }
  const retained = introduced.filter(
    (c) => c.stage >= RETENTION_MIN_STAGE || (c.graduatedAt ?? null) !== null,
  )
  const rate = retained.length / introduced.length
  return { criterion, insufficientData: false, met: rate >= criterion.min }
}

function attemptMatchesScope(
  attempt: CriterionAttempt,
  scope: AccuracyCriterion['scope'],
  questionLookup: ReadonlyMap<string, Question>,
): boolean {
  const question = questionLookup.get(attempt.questionId)
  if (!question) return false
  if ('part' in scope) return question.part === scope.part
  return question.tags.includes(scope.tag)
}

/** accuracy条件の評価（直近window問。vocab:/shadow:プレフィックスは除外済みの前提=13の3.1節） */
export function evaluateAccuracy(
  criterion: AccuracyCriterion,
  ctx: CriterionContext,
): CriterionEvaluation {
  const countable = ctx.attempts
    .filter((a) => isCountableAttempt(a.questionId))
    .sort((a, b) => b.answeredAt - a.answeredAt)
  const scoped = countable.filter((a) =>
    attemptMatchesScope(a, criterion.scope, ctx.questionLookup),
  )
  const windowed = scoped.slice(0, criterion.window)
  if (windowed.length < criterion.window * INSUFFICIENT_SAMPLE_RATIO) {
    return { criterion, insufficientData: true, met: false }
  }
  const correct = windowed.filter((a) => a.isCorrect).length
  const accuracy = correct / windowed.length
  return { criterion, insufficientData: false, met: accuracy >= criterion.min }
}

/** subQuestion ID（`<questionId>-q<n>`規約=13の3.6節）からセットIDを取り出す */
function setIdOf(subQuestionId: string): string | null {
  const match = /^(.+)-q\d+$/.exec(subQuestionId)
  return match ? match[1]! : null
}

interface SetAggregate {
  lastAnsweredAt: number
  total: number
  correct: number
}

/**
 * attemptsをセット単位（audio_setのsubQuestions群）に集約する。
 *
 * サブ設問ID規約（`<親>-q<n>`）は audio_set（Part3/4）と text_passage（Part6/7）で共通
 * （docs/03 3.6節・docs/24 3.1節）で正規表現だけでは区別できないため、親を引いて
 * `format === 'audio_set'` を確認する（readingPace.ts の isReadingSubQuestionId と同じ手法）。
 * これが無いと読解の解答がsetAccuracy判定（P2→P3・L3→L4）に混入する（T-185）
 *
 * T-308（K-37）: 途中放棄したセット（例: 3問中2問で中断）は total=2・correct=2 のように
 * 見え、`correct/total>=2/3`の比率判定では「完全正解セット」と誤認されうる。
 * 親の `subQuestions.length` と `total` が一致するセット（全設問に解答済み）のみを
 * 採用し、放棄セットを移行判定から除外する
 */
function aggregateSets(
  attempts: readonly CriterionAttempt[],
  questionLookup: ReadonlyMap<string, Question>,
): Map<string, SetAggregate> {
  const sets = new Map<string, SetAggregate>()
  for (const a of attempts) {
    if (!isCountableAttempt(a.questionId)) continue
    const setId = setIdOf(a.questionId)
    if (setId === null) continue
    if (questionLookup.get(setId)?.format !== 'audio_set') continue
    const current = sets.get(setId) ?? { lastAnsweredAt: 0, total: 0, correct: 0 }
    current.total += 1
    if (a.isCorrect) current.correct += 1
    current.lastAnsweredAt = Math.max(current.lastAnsweredAt, a.answeredAt)
    sets.set(setId, current)
  }
  for (const [setId, aggregate] of sets) {
    const expectedTotal = questionLookup.get(setId)?.subQuestions?.length ?? 0
    if (aggregate.total !== expectedTotal) sets.delete(setId)
  }
  return sets
}

/** setAccuracy条件の評価（1セット2/3問以上正解=セット正解。13の3.6節） */
export function evaluateSetAccuracy(
  criterion: SetAccuracyCriterion,
  ctx: CriterionContext,
): CriterionEvaluation {
  const sets = [...aggregateSets(ctx.attempts, ctx.questionLookup).values()].sort(
    (a, b) => b.lastAnsweredAt - a.lastAnsweredAt,
  )
  const windowed = sets.slice(0, criterion.windowSets)
  if (windowed.length < criterion.windowSets * INSUFFICIENT_SAMPLE_RATIO) {
    return { criterion, insufficientData: true, met: false }
  }
  const setCorrectCount = windowed.filter((s) => s.correct / s.total >= 2 / 3).length
  const rate = setCorrectCount / windowed.length
  return { criterion, insufficientData: false, met: rate >= criterion.min }
}

/** examScore条件の評価（登録の有無のみ。分母不足の概念はない） */
export function evaluateExamScore(
  criterion: ExamScoreCriterion,
  ctx: CriterionContext,
): CriterionEvaluation {
  const met = ctx.examScores.some((e) => e.total >= criterion.minTotal)
  return { criterion, insufficientData: false, met }
}

/** 条件タイプに応じた評価器へディスパッチする */
export function evaluateCriterion(
  criterion: PhaseCriterion,
  ctx: CriterionContext,
): CriterionEvaluation {
  switch (criterion.type) {
    case 'srsRetention':
      return evaluateSrsRetention(criterion, ctx)
    case 'accuracy':
      return evaluateAccuracy(criterion, ctx)
    case 'setAccuracy':
      return evaluateSetAccuracy(criterion, ctx)
    case 'examScore':
      return evaluateExamScore(criterion, ctx)
  }
}

/** 全条件AND評価（13の3.1節: `all`のみ。1つでも未達・判定不能なら不成立） */
export function evaluatePhaseCriteria(
  criteria: PhaseCriteria,
  ctx: CriterionContext,
): PhaseTransitionResult {
  const evaluations = criteria.all.map((c) => evaluateCriterion(c, ctx))
  const transitioned = evaluations.every((e) => e.met && !e.insufficientData)
  return { evaluations, transitioned }
}

// ---------------------------------------------------------------------------
// フェーズ・L段階の移行条件定義（13の3.2節。暫定値・ドッグフード実測で調整する）
// ---------------------------------------------------------------------------

/** P1→P2・P2→P3 の達成条件（03の1.2節・13の3.2節） */
export const PHASE_TRANSITION_CRITERIA: Record<'P1' | 'P2', PhaseCriteria> = {
  P1: {
    all: [
      { type: 'srsRetention', minRank: 'S', min: 0.85 },
      { type: 'accuracy', scope: { part: 2 }, min: 0.7, window: 100 },
    ],
  },
  P2: {
    all: [
      { type: 'srsRetention', minRank: 'A', min: 0.75 },
      { type: 'setAccuracy', min: 0.6, windowSets: 20 },
      { type: 'accuracy', scope: { part: 5 }, min: 0.7, window: 100 },
    ],
  },
}

/** P3の「シーズンクリア」条件（自動卒業ではなく実試験スコア登録による達成表示。J-16） */
export const SEASON_CLEAR_CRITERIA: PhaseCriteria = {
  all: [{ type: 'examScore', minTotal: 760 }],
}

/** L1→L2・L2→L3・L3→L4 の達成条件（03の8節・13の3.2節） */
export const LISTENING_TRANSITION_CRITERIA: Record<1 | 2 | 3, PhaseCriteria> = {
  1: { all: [{ type: 'accuracy', scope: { tag: '弱形・連結' }, min: 0.75, window: 100 }] },
  2: { all: [{ type: 'accuracy', scope: { part: 2 }, min: 0.7, window: 100 }] },
  3: { all: [{ type: 'setAccuracy', min: 0.6, windowSets: 20 }] },
}

/**
 * 全criteria定義（P1/P2/シーズンクリア/L1-L3）中のwindow・windowSetsの最大値。
 * T-74: attempts読み取り上限（services/phase.tsのATTEMPTS_READ_LIMIT）の算出に使う
 */
export function maxKnownCriterionWindow(): number {
  const all: PhaseCriterion[] = [
    ...PHASE_TRANSITION_CRITERIA.P1.all,
    ...PHASE_TRANSITION_CRITERIA.P2.all,
    ...SEASON_CLEAR_CRITERIA.all,
    ...LISTENING_TRANSITION_CRITERIA[1].all,
    ...LISTENING_TRANSITION_CRITERIA[2].all,
    ...LISTENING_TRANSITION_CRITERIA[3].all,
  ]
  return all.reduce((max, c) => {
    if (c.type === 'accuracy') return Math.max(max, c.window)
    if (c.type === 'setAccuracy') return Math.max(max, c.windowSets)
    return max
  }, 0)
}

/** シーズンの表示名（03の1.2節。ホーム画面のシーズン表示に使う=T-54） */
export const SEASON_LABELS: Record<PhaseSeason, string> = {
  P1: 'シーズン1「土台」',
  P2: 'シーズン2「型」',
  P3: 'シーズン3「実戦」',
}

/** 現フェーズの「次へ進むための条件」を返す（表示・進捗バー用。P3はシーズンクリア条件） */
export function criteriaForSeason(season: PhaseSeason): PhaseCriteria {
  if (season === 'P1') return PHASE_TRANSITION_CRITERIA.P1
  if (season === 'P2') return PHASE_TRANSITION_CRITERIA.P2
  return SEASON_CLEAR_CRITERIA
}

/** 初期フェーズ割当（P0診断結果=総合レートから。13の3.2節 J-18） */
export function initialSeasonForRating(totalRating: number): PhaseSeason {
  if (totalRating < 550) return 'P1'
  if (totalRating < 650) return 'P2'
  return 'P3'
}

export interface PhaseTransitionOutcome {
  season: PhaseSeason
  listeningStage: ListeningStage
  seasonTransitioned: boolean
  listeningTransitioned: boolean
  /** P3で実試験スコア登録によりシーズンクリアが成立したか */
  seasonCleared: boolean
}

/**
 * 現在のフェーズ・L段階から移行判定を行う。移行は1段階ずつ
 * （P1→P3の飛び級はさせない。13の3.2節）。呼び出しは1セッション完了ごと想定
 */
export function evaluatePhaseTransition(
  currentSeason: PhaseSeason,
  currentListeningStage: ListeningStage,
  ctx: CriterionContext,
): PhaseTransitionOutcome {
  let season = currentSeason
  let seasonTransitioned = false
  let seasonCleared = false

  if (currentSeason === 'P1' || currentSeason === 'P2') {
    const result = evaluatePhaseCriteria(PHASE_TRANSITION_CRITERIA[currentSeason], ctx)
    if (result.transitioned) {
      season = currentSeason === 'P1' ? 'P2' : 'P3'
      seasonTransitioned = true
    }
  } else {
    seasonCleared = evaluatePhaseCriteria(SEASON_CLEAR_CRITERIA, ctx).transitioned
  }

  let listeningStage = currentListeningStage
  let listeningTransitioned = false
  if (currentListeningStage !== 4) {
    const result = evaluatePhaseCriteria(LISTENING_TRANSITION_CRITERIA[currentListeningStage], ctx)
    if (result.transitioned) {
      listeningStage = (currentListeningStage + 1) as ListeningStage
      listeningTransitioned = true
    }
  }

  return { season, listeningStage, seasonTransitioned, listeningTransitioned, seasonCleared }
}

// ---------------------------------------------------------------------------
// フェーズ配分テンプレ（curriculumConfig.json。13の3.2節。quickPackConfig.jsonと対）
// ---------------------------------------------------------------------------

/**
 * curriculumConfig.json の整合性検証（quickPackConfig.jsonのvalidateQuickPackConfigと
 * 同じ前例）。allocation・listeningBreakdown各段階の合計が1±0.01からずれると、
 * 不正な設定でパックが黙って目減りするため読み込み時に即座に検出する
 */
export function validateCurriculumTemplate(template: CurriculumTemplate): void {
  const allocSum = Object.values(template.allocation).reduce((a, v) => a + v, 0)
  if (Math.abs(allocSum - 1) > 0.01) {
    throw new Error(
      `curriculumConfig[${template.season}].allocation 合計が不正（1±0.01 から外れている。実際: ${allocSum}）`,
    )
  }
  for (const [stage, breakdown] of Object.entries(template.listeningBreakdown)) {
    const sum = Object.values(breakdown).reduce((a: number, v) => a + (v ?? 0), 0)
    if (Math.abs(sum - 1) > 0.01) {
      throw new Error(
        `curriculumConfig[${template.season}].listeningBreakdown[${stage}] 合計が不正（1±0.01。実際: ${sum}）`,
      )
    }
  }
}

interface CurriculumConfigFile {
  templates: CurriculumTemplate[]
}

export const CURRICULUM_TEMPLATES: CurriculumTemplate[] = (
  rawCurriculumConfig as unknown as CurriculumConfigFile
).templates
for (const template of CURRICULUM_TEMPLATES) validateCurriculumTemplate(template)

/** シーズンに対応するフェーズテンプレを返す（見つからなければ例外＝設定ファイルの不備） */
export function templateForSeason(season: PhaseSeason): CurriculumTemplate {
  const found = CURRICULUM_TEMPLATES.find((t) => t.season === season)
  if (!found) throw new Error(`curriculumConfig にテンプレが無い: ${season}`)
  return found
}
