// パックビルド（T-32。正本: docs/04 2節・2.1節、docs/10 T-32行）。
//
// 生成→（AIクロスレビュー）→TTSを経た content/drafts/*.jsonl を実配布パックJSONに
// 組み立てる最終工程。全パック定義にT-05の validatePack を実行し、1件でもエラーが
// あればビルド全体を失敗させ、何も書き出さない（部分取込なし。CLAUDE.mdの
// 「出所不明パックは取込拒否」を含む不変条件をここで機械的に強制する）。
//
// ハッシュ計算は pack.sizeBytes を含めない内容（schemaVersion+pack meta(sizeBytes抜き)+
// questions）に対して行う。sizeBytes 自身がハッシュ対象に入ると
// 「sizeBytes→シリアライズ→ハッシュ→sizeBytes確定」の循環になるため、
// sizeBytes 抜きの内容でハッシュ確定→そのサイズを sizeBytes として書き込む、の順にする。

import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

import {
  SCHEMA_VERSION,
  validatePack,
  type Manifest,
  type ManifestPackEntry,
  type PackLicense,
  type Question,
  type QuestionPack,
} from '@beb-raid/shared-schema'
import type { CorrectionsFile } from './calibrate.js'
import { validateContentLintBlocking, validateContentLintWarnings } from './contentLint.js'
import { parseJsonl, type GeneratedItemDraft } from './review.js'

/**
 * ビルド対象パックの定義（実データはドラフトJSONLから読み込む。commands.ts から参照）。
 * draftPath は contentRoot からの相対パス（例: 'drafts/vocab-card-s.jsonl'）。
 * contentRoot 自体をテストで差し替え可能にするため、'content/' 等のルート名を含めない
 */
export interface PackDefinition {
  id: string
  title: string
  license: PackLicense
  origin: string
  targetLevel: [number, number]
  draftPath: string
}

/**
 * 敵対的検証の工程記録（T-355。正本: docs/32 8.2節）。
 *
 * 敵対的検証（6観点）は21パックすべてに適用した。一方でAIクロスレビュー
 * （生成に使ったのとは別のモデルによる全問読み）は**通していないパックがある**。
 * 両者は別の工程なので、パックごとに実施の有無を持ち分ける。
 *
 * reviewMethodは機械可読な工程名、originは人が読む1行の出所表記で、
 * どちらもdocs/32 8.2節の書式に従う（`beb verify-content` が両者の整合を検査する）。
 */
export const ADVERSARIAL_DIMENSION_COUNT = 6
export const ADVERSARIAL_REVIEWER = 'claude-opus-5'
export const ADVERSARIAL_REVIEWED_AT = '2026-08-13'

/**
 * AIクロスレビュー（第1段。生成に使ったのとは別のモデルによる全問読み。J-119）を
 * 実際に通したモデル。**通したパックだけ**を載せる。
 *
 * 載っていないパックは工程名から「AIクロスレビュー（<モデル名>）」の段が落ちる。
 * 通していない工程を `origin` に書くと出所を偽ることになるため、既定は「未実施」とする。
 *
 * 2026-08-13に、クロスレビューが未実施・モデル名未記録だった9パックをFableで実施した
 * （ADR 0006・0014のAmendment。生成はClaude系のエージェントなので、同系列のモデルで
 * 読むと「別のモデルで読む」の要件を満たさないため、実施モデルをFableに固定した）
 * （`pack-p5-similar-*` は起票時に「対象外」、`pack-dict-s-002`・`pack-p34-s-002` は
 * T-84で「未実施」、`pack-vocab-s-002` はドッグフィードバック対応のまま残っていた）。
 * 残りは2026-07までに別モデルで通してある。モデル名を特定できないパックは載せない。
 */
export const CROSS_REVIEW_MODEL_BY_PACK_ID: ReadonlyMap<string, string> = new Map([
  // 2026-07にFable 5で実施
  ['pack-vocab-s-001', 'Fable 5'],
  ['pack-vocab-a-001', 'Fable 5'],
  ['pack-vocab-b-001', 'Fable 5'],
  ['pack-p2-s-001', 'Fable 5'],
  ['pack-p2-s-002', 'Fable 5'],
  ['pack-p5-s-001', 'Fable 5'],
  ['pack-p5-s-002', 'Fable 5'],
  ['pack-p34-s-001', 'Fable 5'],
  ['pack-dict-s-001', 'Fable 5'],
  ['pack-shadow-s-001', 'Fable 5'],
  // 2026-07-23にT-107で別モデル3並列＋発起人H-R1レビュー承認
  ['pack-reading-p6-s-001', '別モデル3並列'],
  ['pack-reading-p7single-s-001', '別モデル3並列'],
  // 2026-08-13に実施（それまで未実施・対象外だったもの）
  ['pack-p5-similar-s-001', 'Fable'],
  ['pack-p5-similar-s-002', 'Fable'],
  ['pack-p5-similar-s-003', 'Fable'],
  ['pack-dict-s-002', 'Fable'],
  ['pack-p34-s-002', 'Fable'],
  ['pack-vocab-s-002', 'Fable'],
  // 2026-08-13に実施（T-85で「実施済み」と記録されていたがモデル名が残っていなかった2件と、
  // T-349で新規生成し敵対的検証6観点のみ通していた pack-p2-s-003）
  ['pack-p2-s-003', 'Fable'],
  ['pack-p34-s-003', 'Fable'],
  ['pack-p5-s-003', 'Fable'],
])

/**
 * docs/32 8.2節の書式で工程名を組み立てる。
 * `crossReviewer` が無いパック（クロスレビュー未実施）は敵対的検証の段だけにする。
 *
 * 2026-08-13時点では配信中の21パックすべてにクロスレビューの実施モデルが入っている。
 * 新しいパックを追加してクロスレビューがまだなら、表に載せないこと（載せなければ
 * 工程名から自動でその段が落ちる）。
 */
export function reviewMethodFor(dimensions: number, date: string, crossReviewer?: string): string {
  const adversarial = `敵対的検証（${dimensions}観点・${date}）`
  return crossReviewer ? `AIクロスレビュー（${crossReviewer}）＋${adversarial}` : adversarial
}

/** docs/32 8.2節の書式で origin を組み立てる（生成手段はパックごとに異なるので引数で受ける） */
export function originFor(generation: string, reviewMethod: string, withTts: boolean): string {
  return `${generation}＋${reviewMethod}${withTts ? '＋TTS' : ''}`
}

/** M1で配布する4パック（04の2節の例に倣ったid命名。docs/10完了条件の「ダミー4種パック」に対応する実データ版） */
const M1_PACK_DEFINITIONS: readonly PackDefinition[] = [
  {
    id: 'pack-vocab-s-001',
    title: '語彙カード Sランク200語',
    license: 'internal-original',
    origin: 'エージェント直接執筆（2026-07。別モデル(Fable 5)による初回クロスレビュー済み）',
    targetLevel: [600, 600],
    draftPath: 'drafts/vocab-card-s.jsonl',
  },
  {
    id: 'pack-p2-s-001',
    title: 'Part2瞬発 Sランク50問',
    license: 'internal-original',
    origin: 'エージェント直接執筆（2026-07。別モデル(Fable 5)による初回クロスレビュー済み）',
    targetLevel: [600, 600],
    draftPath: 'drafts/part2-s.jsonl',
  },
  {
    id: 'pack-p5-s-001',
    title: 'Part5文法 Sランク50問',
    license: 'internal-original',
    origin: 'エージェント直接執筆（2026-07。別モデル(Fable 5)による初回クロスレビュー済み）',
    targetLevel: [600, 600],
    draftPath: 'drafts/part5-s.jsonl',
  },
  {
    id: 'pack-p5-similar-s-001',
    title: 'Part5 key単語類題57問',
    license: 'internal-original',
    origin: 'エージェント直接執筆（2026-07。key単語システムの循環問題への対処）',
    targetLevel: [600, 600],
    draftPath: 'drafts/key-vocab-similar-s.jsonl',
  },
]

/**
 * M2で追加する8パック（docs/13 3.10節のJ-22。同節は7パックを列挙しているが、
 * T-63のkey単語類題追加分（key-vocab-similar-s2）は3.10節の計画時点では想定されて
 * おらず、既存のpack-p5-similar-s-001とは正答ローテーション方式が異なる別データの
 * ため統合せず独立パックとした。結果としてM2は8パック・全体で12パックになる）
 */
const M2_PACK_DEFINITIONS: readonly PackDefinition[] = [
  {
    id: 'pack-vocab-a-001',
    title: '語彙カード Aランク200語（730帯）',
    license: 'internal-original',
    origin: 'エージェント直接執筆（2026-07。別モデル(Fable 5)による初回クロスレビュー済み）',
    targetLevel: [600, 730],
    draftPath: 'drafts/vocab-card-a.jsonl',
  },
  {
    id: 'pack-vocab-b-001',
    title: '語彙カード Bランク200語（860帯）',
    license: 'internal-original',
    origin: 'エージェント直接執筆（2026-07。別モデル(Fable 5)による初回クロスレビュー済み）',
    targetLevel: [730, 860],
    draftPath: 'drafts/vocab-card-b.jsonl',
  },
  {
    id: 'pack-p2-s-002',
    title: 'Part2瞬発 追加100問',
    license: 'internal-original',
    origin: 'エージェント直接執筆（2026-07。別モデル(Fable 5)による初回クロスレビュー済み）',
    targetLevel: [600, 600],
    draftPath: 'drafts/part2-s2.jsonl',
  },
  {
    id: 'pack-p5-s-002',
    title: 'Part5文法 追加100問',
    license: 'internal-original',
    origin: 'エージェント直接執筆（2026-07。別モデル(Fable 5)による初回クロスレビュー済み）',
    targetLevel: [600, 600],
    draftPath: 'drafts/part5-s2.jsonl',
  },
  {
    id: 'pack-p34-s-001',
    title: 'Part3/4セット（会話10・トーク10）',
    license: 'internal-original',
    origin: 'エージェント直接執筆（2026-07。別モデル(Fable 5)による初回クロスレビュー済み）',
    targetLevel: [600, 600],
    draftPath: 'drafts/part34-s.jsonl',
  },
  {
    id: 'pack-dict-s-001',
    title: 'ディクテーション短文40本',
    license: 'internal-original',
    origin: 'エージェント直接執筆（2026-07。別モデル(Fable 5)による初回クロスレビュー済み）',
    targetLevel: [600, 600],
    draftPath: 'drafts/dictation-s.jsonl',
  },
  {
    id: 'pack-shadow-s-001',
    title: 'シャドーイング素材30本',
    license: 'internal-original',
    origin:
      '既存Part3/4スクリプト・Part2応答文の流用（2026-07。別モデル(Fable 5)による初回クロスレビュー済み）',
    targetLevel: [600, 600],
    draftPath: 'drafts/shadowing-s.jsonl',
  },
  {
    id: 'pack-p5-similar-s-002',
    title: 'Part5 key単語類題 追加60問',
    license: 'internal-original',
    origin: 'エージェント直接執筆（2026-07。key単語システムの循環問題への対処）',
    targetLevel: [600, 600],
    draftPath: 'drafts/key-vocab-similar-s2.jsonl',
  },
]

/** フェーズC・T-83で追加する1パック（key単語類題 追加120問。J-44） */
const T83_PACK_DEFINITIONS: readonly PackDefinition[] = [
  {
    id: 'pack-p5-similar-s-003',
    title: 'Part5 key単語類題 追加120問（1語1問）',
    license: 'internal-original',
    origin: 'エージェント直接執筆（2026-07。q1語=類題ゼロの語彙循環解消）',
    targetLevel: [600, 600],
    draftPath: 'drafts/key-vocab-similar-s3.jsonl',
  },
]

/** フェーズC・T-84で追加する2パック（audio_set+20・dictation+40。J-33） */
const T84_PACK_DEFINITIONS: readonly PackDefinition[] = [
  {
    id: 'pack-p34-s-002',
    title: 'Part3/4セット 追加20（会話10・トーク10）',
    license: 'internal-original',
    origin: 'エージェント直接執筆（2026-07。T-84）',
    targetLevel: [600, 600],
    draftPath: 'drafts/part34-s2.jsonl',
  },
  {
    id: 'pack-dict-s-002',
    title: 'ディクテーション追加40本',
    license: 'internal-original',
    origin: 'エージェント直接執筆（2026-07。T-84）',
    targetLevel: [600, 600],
    draftPath: 'drafts/dictation-s2.jsonl',
  },
]

/** フェーズC・T-85で追加する1パック（Part5 d4帯+50問。J-33） */
const T85_PART5_PACK_DEFINITIONS: readonly PackDefinition[] = [
  {
    id: 'pack-p5-s-003',
    title: 'Part5文法 d4帯 追加50問',
    license: 'internal-original',
    origin: 'エージェント直接執筆（2026-07。T-85）',
    targetLevel: [730, 860],
    draftPath: 'drafts/part5-s3.jsonl',
  },
]

/** フェーズC・T-85で追加するもう1パック（Part3/4本試験長尺化+10セット。J-33） */
const T85_PART34_PACK_DEFINITIONS: readonly PackDefinition[] = [
  {
    id: 'pack-p34-s-003',
    title: 'Part3/4セット 本試験長尺化10（会話5・トーク5、d4帯）',
    license: 'internal-original',
    origin: 'エージェント直接執筆（2026-07。T-85）',
    targetLevel: [730, 860],
    draftPath: 'drafts/part34-s3.jsonl',
  },
]

/** ドッグフィードバック 2026-07-22「問題が難しすぎる」への対応。既存Sより基礎的な入門語彙50語 */
const DOGFOOD_BEGINNER_PACK_DEFINITIONS: readonly PackDefinition[] = [
  {
    id: 'pack-vocab-s-002',
    title: '語彙カード 初級50語（600帯・入門）',
    license: 'internal-original',
    origin: 'エージェント直接執筆（2026-07。ドッグフィードバック対応）',
    targetLevel: [600, 600],
    draftPath: 'drafts/vocab-card-s2.jsonl',
  },
]

/**
 * フェーズR-1・T-107で追加する読解2パック（Part6・Part7単一。docs/24_読解パート実装計画.md 3.6節・4節T-142行＝改番前の旧T-107）。
 * 発起人によるH-R1レビュー承認（2026-07-23。3並列AIクロスレビュー→must-fix12件修正→独立再検証で
 * 「approve可」判定という経緯に基づく）済み。origin にレビュー実施状況を正直に記録する
 * （3.6節「読解は人手レビュー必須ゲートを最初から有効化する」）。
 */
const READING_R1_PACK_DEFINITIONS: readonly PackDefinition[] = [
  {
    id: 'pack-reading-p6-s-001',
    title: 'Part6読解 30セット120問',
    license: 'internal-original',
    origin:
      'エージェント直接執筆＋別モデル3並列クロスレビュー＋発起人H-R1レビュー承認（2026-07-23。T-107）',
    targetLevel: [600, 730],
    draftPath: 'drafts/text-passage-p6-s.jsonl',
  },
  {
    id: 'pack-reading-p7single-s-001',
    title: 'Part7単一読解 40セット118問',
    license: 'internal-original',
    origin:
      'エージェント直接執筆＋別モデル3並列クロスレビュー＋発起人H-R1レビュー承認（2026-07-23。T-107）',
    targetLevel: [600, 730],
    draftPath: 'drafts/text-passage-p7-single-s.jsonl',
  },
]

/** ウェーブ8・T-349で追加する1パック（Part2 平叙文・付加疑問・選択疑問64問。docs/32 ウェーブ8 T-349行） */
const T349_PACK_DEFINITIONS: readonly PackDefinition[] = [
  {
    id: 'pack-p2-s-003',
    title: 'Part2瞬発 追加64問（平叙文・付加疑問・選択疑問）',
    license: 'internal-original',
    origin: 'エージェント直接執筆（2026-08。T-349）',
    targetLevel: [600, 600],
    draftPath: 'drafts/part2-s3.jsonl',
  },
]

/** M1（4）+ M2（8）+ T-83（1）+ T-84（2）+ T-85（2）+ 初級追加（1）+ 読解R-1（2）+ T-349（1）= 21パック（docs/13 3.10節・T-64、docs/15 T-83〜T-85行、docs/24_読解パート実装計画.md T-142行、docs/32 ウェーブ8） */
export const PACK_DEFINITIONS: readonly PackDefinition[] = [
  ...M1_PACK_DEFINITIONS,
  ...M2_PACK_DEFINITIONS,
  ...T83_PACK_DEFINITIONS,
  ...T84_PACK_DEFINITIONS,
  ...T85_PART5_PACK_DEFINITIONS,
  ...T85_PART34_PACK_DEFINITIONS,
  ...DOGFOOD_BEGINNER_PACK_DEFINITIONS,
  ...READING_R1_PACK_DEFINITIONS,
  ...T349_PACK_DEFINITIONS,
]

/** バリデーション前のパック素材（license/origin は validatePack が実行時に再検証する対象なので string のまま持つ） */
export interface PackSource {
  id: string
  title: string
  license: string
  origin: string
  targetLevel: [number, number]
  questions: Question[]
  /** 敵対的検証の工程記録（T-355。docs/32 8.2節） */
  reviewedBy: string
  reviewedAt: string
  reviewMethod: string
}

export interface BuiltPack {
  pack: QuestionPack
  /** manifest.json 用のコンテンツハッシュ（sizeBytes抜きの内容から算出） */
  hash: string
}

/**
 * `<contentRoot>/drafts/*.jsonl` から PACK_DEFINITIONS 全件分のドラフトを読み込み
 * PackSource[] を組み立てる（build/calibrate/verify-content 共用。T-32/T-34/T-234）。
 */
export async function loadPackSources(contentRoot: string): Promise<PackSource[]> {
  const sources: PackSource[] = []
  for (const def of PACK_DEFINITIONS) {
    const draftPath = join(contentRoot, def.draftPath)
    const drafts = parseJsonl<GeneratedItemDraft>(await readFile(draftPath, 'utf-8'))
    const questions = drafts.map((d) => d.payload as Question)
    // TTSを工程に含めるかは実データで決める（音声を1件も持たないパックに＋TTSと書かない）
    const withTts = questions.some((q) => Boolean(q.audio) || Boolean(q.phraseAudio))
    const reviewMethod = reviewMethodFor(
      ADVERSARIAL_DIMENSION_COUNT,
      ADVERSARIAL_REVIEWED_AT,
      CROSS_REVIEW_MODEL_BY_PACK_ID.get(def.id),
    )
    sources.push({
      id: def.id,
      title: def.title,
      license: def.license,
      origin: originFor(def.origin, reviewMethod, withTts),
      targetLevel: def.targetLevel,
      questions,
      reviewedBy: ADVERSARIAL_REVIEWER,
      reviewedAt: ADVERSARIAL_REVIEWED_AT,
      reviewMethod,
    })
  }
  return sources
}

export interface PackContentHash {
  hash: string
  sizeBytes: number
}

/**
 * computePackContentHash の入力形。PackMeta とほぼ同じだが license を string のまま許容する
 * （buildPack はバリデーション前の source.license: string を渡すため。実体のライセンス値の
 * 妥当性は validatePack が別途検証する。ここでは値の中身を問わずシリアライズするだけ）。
 */
export interface HashablePackMeta {
  id: string
  title: string
  license: string
  origin: string
  targetLevel: [number, number]
  sizeBytes?: number
}

/**
 * パック内容（sizeBytes抜き）からコンテンツハッシュとサイズを計算する（T-234で抽出。
 * 元は buildPack 内に直書きだった計算をそのまま切り出したのみで、アルゴリズムは変えていない）。
 *
 * buildPack（ビルド時の算出）と verifyContent（配信物からの再算出。build.ts:1-11のコメント参照）の
 * 両方がこの1実装を呼ぶことで、2箇所の算出ロジックが将来ずれる事故を防ぐ。
 * 入力の pack.sizeBytes は無視する（付いていれば剥がしてから計算する。循環を避けるため）。
 */
export function computePackContentHash(rawPack: {
  schemaVersion: typeof SCHEMA_VERSION
  pack: HashablePackMeta
  questions: readonly Question[]
}): PackContentHash {
  const draftPack = {
    schemaVersion: rawPack.schemaVersion,
    pack: {
      id: rawPack.pack.id,
      title: rawPack.pack.title,
      license: rawPack.pack.license,
      origin: rawPack.pack.origin,
      targetLevel: rawPack.pack.targetLevel,
    },
    questions: rawPack.questions,
  }
  const contentForHash = JSON.stringify(draftPack, null, 2) + '\n'
  const hash = createHash('sha256').update(contentForHash).digest('hex').slice(0, 16)
  const sizeBytes = Buffer.byteLength(contentForHash, 'utf-8')
  return { hash, sizeBytes }
}

/**
 * T-34（実測補正）の補正値ファイルをパック素材に適用する。純粋関数（入力を書き換えず新規配列を返す）。
 * - questionDifficulty: 問題ID一致でdifficultyを上書き
 * - wordFreqRank: keyVocabの各wordが一致すればfreqRankを上書き。vocab_card自体のfront/freqRankも対象
 * corrections が無ければ sources をそのまま返す（T-32単体では従来どおり無補正で動く）
 */
export function applyCorrections(
  sources: readonly PackSource[],
  corrections: CorrectionsFile | null,
): PackSource[] {
  if (!corrections) return sources.slice()
  return sources.map((source) => ({
    ...source,
    questions: source.questions.map((q) => {
      const difficulty = corrections.questionDifficulty[q.id] ?? q.difficulty
      const keyVocab = q.keyVocab.map((kv) => {
        const corrected = corrections.wordFreqRank[kv.word]
        return corrected ? { ...kv, freqRank: corrected } : kv
      })
      const freqRank =
        q.format === 'vocab_card' && q.front
          ? (corrections.wordFreqRank[q.front] ?? q.freqRank)
          : q.freqRank
      return { ...q, difficulty, keyVocab, freqRank }
    }),
  }))
}

/**
 * explanation品質の機械検証（M2・T-63。正本: docs/13 T-63行）。
 * vocab_card/shadowingは「正解/不正解」の概念がなくexplanationを持たないため対象外。
 * audio_set・text_passage（T-107で追加。Part6/7もsubQuestions構造）はsubQuestion単位で検証する。
 */
const MIN_EXPLANATION_LENGTH = 15
/** 「Aが正解」のように選択肢記号のみを参照し実テキストの引用が無い形式的な解説を検出する */
const BARE_LETTER_EXPLANATION_RE = /^[A-D][\s.、。）)]*が?\s*(正解|正しい|correct)[\s.。]*$/i

function checkExplanationText(id: string, explanation: string | null | undefined): string[] {
  const problems: string[] = []
  const trimmed = (explanation ?? '').trim()
  if (trimmed === '') {
    problems.push(`${id}: explanationが空または欠落している`)
    return problems
  }
  if (trimmed.length < MIN_EXPLANATION_LENGTH) {
    problems.push(
      `${id}: explanationが短すぎる（${trimmed.length}文字。最低${MIN_EXPLANATION_LENGTH}文字必要）`,
    )
  }
  if (BARE_LETTER_EXPLANATION_RE.test(trimmed)) {
    problems.push(
      `${id}: explanationが選択肢記号のみを参照しており実テキストの引用がない: "${trimmed}"`,
    )
  }
  return problems
}

/** パック内の全問（audio_set・text_passageはsubQuestions含む）のexplanation品質を検証する */
export function validateExplanationQuality(questions: readonly Question[]): string[] {
  const problems: string[] = []
  for (const q of questions) {
    if (q.format === 'vocab_card' || q.format === 'shadowing') continue
    if (q.format === 'audio_set' || q.format === 'text_passage') {
      for (const sq of q.subQuestions ?? []) {
        problems.push(...checkExplanationText(`${q.id}/${sq.id}`, sq.explanation))
      }
    } else {
      problems.push(...checkExplanationText(q.id, q.explanation))
    }
  }
  return problems
}

/** 1パック分の検証・組み立て。エラーがあれば built=null で全エラーを返す */
export function buildPack(
  source: PackSource,
  audioFiles: ReadonlySet<string>,
  /** audio_photo の image 存在チェック用（T-239・Q-82）。未指定ならこのチェックはスキップ */
  imageFiles?: ReadonlySet<string>,
): { built: BuiltPack | null; errors: string[]; warnings: string[] } {
  const draftPack = {
    schemaVersion: SCHEMA_VERSION,
    pack: {
      id: source.id,
      title: source.title,
      license: source.license,
      origin: source.origin,
      targetLevel: source.targetLevel,
      // T-355: 工程記録を機械可読な形でも残す（docs/32 8.2節。validatePackの任意フィールド）
      reviewedBy: source.reviewedBy,
      reviewedAt: source.reviewedAt,
      reviewMethod: source.reviewMethod,
    },
    questions: source.questions,
  }

  // T-80: contentLintの機械検証。既存コンテンツに現存する違反をビルド失敗に変えると
  // 配布が止まってしまうルールはwarnings（非ブロッキング）のまま据え置く
  // （修正はT-81/T-82の担当範囲。docs/STATUS.mdに一括検査結果を記録済み）。
  // 一方、違反件数が0になったルール（⑥⑧⑨。T-236/T-237の追加修正）はerrors
  // （ブロッキング）に昇格する。詳細はcontentLint.tsのvalidateContentLintBlockingを参照
  const blockingContentLint = validateContentLintBlocking(source.questions, source.id)
  const warningContentLint = validateContentLintWarnings(source.questions, source.id)

  const result = validatePack(draftPack, { audioFiles, imageFiles })
  const explanationProblems = validateExplanationQuality(source.questions)
  if (!result.ok || explanationProblems.length > 0 || blockingContentLint.length > 0) {
    return {
      built: null,
      errors: [
        ...result.errors.map((e) => `${source.id} ${e.path}: ${e.message}`),
        ...explanationProblems.map((p) => `${source.id} ${p}`),
        ...blockingContentLint.map((p) => `${source.id} ${p}`),
      ],
      warnings: warningContentLint.map((p) => `${source.id} ${p}`),
    }
  }

  const { hash, sizeBytes } = computePackContentHash(draftPack)

  const pack = {
    ...draftPack,
    pack: { ...draftPack.pack, sizeBytes },
  } as QuestionPack

  return {
    built: { pack, hash },
    errors: [],
    warnings: warningContentLint.map((p) => `${source.id} ${p}`),
  }
}

/** 全パック定義を検証・組み立てる。1件でもエラーがあれば built は空（部分取込なし） */
export function buildAllPacks(
  sources: readonly PackSource[],
  audioFiles: ReadonlySet<string>,
  /** audio_photo の image 存在チェック用（T-239・Q-82）。未指定ならこのチェックはスキップ */
  imageFiles?: ReadonlySet<string>,
): { built: BuiltPack[]; errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  const built: BuiltPack[] = []
  for (const source of sources) {
    const result = buildPack(source, audioFiles, imageFiles)
    warnings.push(...result.warnings)
    if (result.built) {
      built.push(result.built)
    } else {
      errors.push(...result.errors)
    }
  }
  return { built: errors.length === 0 ? built : [], errors, warnings }
}

/** ビルド済みパック一覧 → manifest.json の中身 */
export function buildManifest(built: readonly BuiltPack[]): Manifest {
  const packs: ManifestPackEntry[] = built.map(({ pack, hash }) => ({
    id: pack.pack.id,
    title: pack.pack.title,
    targetLevel: pack.pack.targetLevel,
    sizeBytes: pack.pack.sizeBytes ?? 0,
    hash,
  }))
  return { schemaVersion: SCHEMA_VERSION, packs }
}

/** `<contentRoot>/<subdir>` 配下の実ファイルを再帰的に列挙し、contentRoot基準の相対パス（/区切り）の集合を返す */
async function scanContentFiles(contentRoot: string, subdir: string): Promise<Set<string>> {
  const files = new Set<string>()
  const targetDir = join(contentRoot, subdir)

  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else {
        files.add(relative(contentRoot, full).split(sep).join('/'))
      }
    }
  }

  await walk(targetDir)
  return files
}

/**
 * `<contentRoot>/audio` 配下の実ファイルを再帰的に列挙し、Question.audio /
 * phraseAudio と同じ形式（例: 'audio/vocab/submit.mp3'、contentRoot基準の相対パス）
 * の集合を返す。audioディレクトリが無ければ空集合（テスト等、音声不要なパックのみの場合）
 */
export async function scanAudioFiles(contentRoot: string): Promise<Set<string>> {
  return scanContentFiles(contentRoot, 'audio')
}

/**
 * `<contentRoot>/images` 配下の実ファイルを再帰的に列挙し、Question.image（audio_photo）と
 * 同じ形式の集合を返す（T-239・Q-82）。imagesディレクトリが無ければ空集合
 * （現時点では audio_photo を使うパックが無いため常にこの経路になる）。
 */
export async function scanImageFiles(contentRoot: string): Promise<Set<string>> {
  return scanContentFiles(contentRoot, 'images')
}
