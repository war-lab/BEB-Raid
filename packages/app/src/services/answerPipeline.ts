// 解答パイプライン集約（T-71。正本: docs/15 3節・J-35）。
//
// DrillScreen が持っていた4つのほぼ重複した解答確定関数
// （finalizeAnswer・finalizeSubQuestionAnswer・finalizeDictationAnswer・handleVocabGrade）と、
// VocabScreen の handleGrade を、この1関数の skip オプションの組み合わせで表現する。
// T-89でpendingSyncエンキュー（4.1節の挿入点）を追加した。
//
// 【トランザクション境界（2026-07-31にJ-35から変更。正本: ADR 0010）】
// ①attempt記録〜⑤SRS更新を**単一のDexieトランザクション**で書く。
//
// 当初（J-35）は「attempts+snapshotの原子性は answerCurrentQuestion 内で確保済み」として
// ②〜⑤の単一トランザクション化を見送り、失敗時は呼び出し側がスナップショットを再読込する
// 方針だった。しかしこれは**部分書き込みを許す設計**で、attemptだけ書かれてレート・SRSが
// 未更新のまま残る状態を再同期では修復できない。T-176で「保存の再試行」をUIに出したことで、
// この設計が実害になった（パイプライン全体の再実行は、Reading経路ではattemptを二重に作り、
// Drill経路ではsnapshotが進んでいるため StaleSnabshotError で永久に後段が補完されない）。
//
// 単一トランザクションにすると失敗時は何も書かれないので、再試行が構造的に冪等になる。
// Dexieのストア跨ぎコストという当初の懸念は残るが、①〜⑤は元々6回の個別トランザクションを
// 張っていたため、1回に束ねる方が往復は減る。
//
// ⑥pendingSync（レイドダメージ）は**意図的にトランザクションの外**に置く。共有API向けの
// 副作用であり、その失敗で学習記録を巻き戻すのは縮退設計（共有APIが全損してもソロ学習は
// 無傷。CLAUDE.mdの不変条件）に反する。⑥の失敗は警告ログのみで飲み込み、解答は成立させる。

import { buildDamageSyncPayload, type Question } from '@beb-raid/shared-schema'
import type { BebRaidDatabase } from '../db/database'
import type { AttemptMode } from '../db/schema'
import { RAID_STATE_ID } from '../db/schema'
import { computeDamage } from '../engine/damage'
import { processWrongAnswer } from '../engine/keyVocab'
import { applyRatingUpdate } from '../engine/rating'
import { reviewSrsCard } from '../engine/srs'
import { updateTagStatsForAnswer } from '../engine/tagStats'
import type { QuestionLookup, RatingUpdate, SrsGrade } from '../engine/types'
import { recordAttempt } from './attempts'
import { answerCurrentQuestion, type SessionSnapshot } from './session'
import { RAID_SYNC_ENABLED_KEY } from './settingsKeys'

export interface AnswerPipelineSkip {
  /** J-29: ディクテーションはレート更新の対象外 */
  rating?: boolean
  /** vocab_card等、tags=[]で実質no-opなことが分かっている場合の明示スキップ */
  tagStats?: boolean
  /** vocab_cardは誤答してもkey語彙の復習デッキに落とさない（自己評価が別途あるため） */
  wrongAnswer?: boolean
  /** audio_setのサブ設問はセット完了時に1回だけreviewSrsCardを呼ぶため、設問ごとはスキップする */
  srs?: boolean
}

export interface AnswerPipelineInput {
  /** セッション進行中の解答。無ければ recordAttempt で直接記録する（audio_setサブ設問・VocabScreen） */
  snapshot?: SessionSnapshot
  /** attempts記録・tagStats集計のキーとなるID（audio_setサブ設問はsubQuestion.id） */
  questionId: string
  /**
   * processWrongAnswer・applyRatingUpdate（part/difficulty）に使う問題実体。
   * audio_setサブ設問の場合はkeyVocab等を持つ親のQuestionを渡す
   */
  question: Question
  /** updateTagStatsForAnswerに渡すルックアップ表（audio_setサブ設問は疑似エントリを含むMapを渡す） */
  lookup: QuestionLookup
  isCorrect: boolean
  responseMs: number
  isTimeout?: boolean
  mode: AttemptMode
  /** SRS由来itemのみ。指定時はreviewSrsCardを呼ぶ（skip.srsで抑制可） */
  srsCardId?: string
  /** 自己評価3段階（vocab_card）。省略時は客観正誤から good/again を決める */
  srsGrade?: SrsGrade
  skip?: AnswerPipelineSkip
}

export interface AnswerPipelineResult {
  /** snapshot指定時のみ。次に出題するitemへ進んだ後のスナップショット */
  nextSnapshot?: SessionSnapshot
  /** skip.rating指定時、またはSRS復習・語彙カード等レート対象外の解答ではundefined/null */
  ratingUpdate?: RatingUpdate | null
  /**
   * M4・T-129: レイドダメージがpendingSyncへエンキューされた場合のみ設定
   * （raidSyncEnabled=OFF・未参加・期間外・ダメージ0のいずれかならundefined）。
   * DrillScreen等が解説カードの「堅い/弱点」バッジ・実ダメージ表示に使う
   */
  raidDamage?: RaidDamageResult
}

/**
 * ゴーストボスの問題別倍率を、raidStateキャッシュのdefenseJsonから解決する
 * （M4・T-129。正本: docs/22 3.4節）。倍率適用はこの関数を含むこのファイル1箇所に
 * 集約し、engine/damage.ts本体（solo/raid/srsのモード係数）は変更しない。
 * bossType!=='ghost'・defenseJson無し・該当questionId無しのいずれも倍率1.0（無変化）を返す。
 * 破損JSON（外部編集されたバックアップ等）も同様に1.0へフォールバックし、レイド機能自体を止めない
 */
function resolveGhostDefenseMultiplier(
  raidState: Pick<RaidStateRecordLike, 'bossType' | 'defenseJson'>,
  questionId: string,
): number | undefined {
  if (raidState.bossType !== 'ghost' || !raidState.defenseJson) return undefined
  try {
    const map = JSON.parse(raidState.defenseJson) as Record<string, number>
    return map[questionId]
  } catch {
    return undefined
  }
}

/** enqueueRaidSyncIfEnabledが参照するraidStateの最小形（テスト用フェイクとの結合を緩める） */
interface RaidStateRecordLike {
  bossType?: 'synthetic' | 'ghost'
  defenseJson?: string | null
}

/** enqueueRaidSyncIfEnabledの戻り値。呼び出し側（DrillScreen等）が解説カードの
 * 「今回の実ダメージ」「堅い/弱点」バッジを、倍率計算を再実装せずに表示するために使う */
export interface RaidDamageResult {
  /** 倍率適用後（pendingSyncへ積んだ）最終ダメージ */
  damage: number
  /** ghost週かつdefenseに該当questionIdがある場合のみ設定（0.5=堅い/2.0=弱点）。
   * 該当なし・synthetic週はundefined（バッジを出さない判定に使う） */
  ghostDefenseMultiplier?: number
}

/**
 * レイドダメージをpendingSyncへエンキューする（T-89。M3基盤・端末内完結ステップ。
 * M4・T-129でghostボスの倍率適用を追加）。
 * `raidSyncEnabled`設定が既定OFFのため、OFF時はこの読み取り1回のみで追加の書き込みは
 * 一切発生しない（縮退設計の常時保証）。参加中のレイドが無い・ダメージが0の場合も送らない
 */
async function enqueueRaidSyncIfEnabled(
  db: BebRaidDatabase,
  params: {
    attemptId: string
    questionId: string
    answeredAt: number
    mode: AttemptMode
    isCorrect: boolean
    basePoints: number
  },
): Promise<RaidDamageResult | null> {
  const setting = await db.settings.get(RAID_SYNC_ENABLED_KEY)
  if (setting?.value !== true) return null

  const raidState = await db.raidState.get(RAID_STATE_ID)
  if (!raidState?.joined) return null

  // 端末キャッシュのボス期間（endAt）を過ぎた解答はエンキューしない。
  // 端末は今週のボス情報を持っていない状態であり、旧bossId宛の期間外payloadを積んでも
  // サーバー（J-49: answeredAtが[startAt, endAt]区間内のみ加算=docs/16）は非加算のまま
  // acceptedIds扱いにするため、キューから消えて再送機会を失うだけになる
  if (params.answeredAt > raidState.endAt) return null

  const points = params.isCorrect ? params.basePoints : 0
  // 3.4節: 倍率適用は「モード係数（raid1.0/solo0.5）を掛けたダメージ」に対して行う（併用は乗算）。
  // defense外の問題・synthetic週・API無効時はmultiplier未定義=1.0扱いで、既存のsynthetic/API無効
  // 挙動と完全に同一になる（回帰の要）
  const baseDamage = computeDamage(points, params.mode)
  if (baseDamage <= 0) return null
  const ghostDefenseMultiplier = resolveGhostDefenseMultiplier(raidState, params.questionId)
  const damage = baseDamage * (ghostDefenseMultiplier ?? 1)

  const payload = buildDamageSyncPayload({
    attemptId: params.attemptId,
    bossId: raidState.bossId,
    damage,
    questionCount: 1,
    answeredAt: params.answeredAt,
  })
  await db.pendingSync.add({
    kind: 'raidDamage',
    payloadJson: JSON.stringify(payload),
    createdAt: Date.now(),
  })
  return { damage, ghostDefenseMultiplier }
}

/**
 * 1問の解答を確定し、attempts・srsCards（誤答復習デッキ）・tagStats・ratings・
 * SRSカード（自己評価）を必要な範囲だけ更新する。
 */
export async function recordAnswerPipeline(
  db: BebRaidDatabase,
  input: AnswerPipelineInput,
): Promise<AnswerPipelineResult> {
  const {
    snapshot,
    questionId,
    question,
    lookup,
    isCorrect,
    responseMs,
    isTimeout = false,
    mode,
    srsCardId,
    srsGrade,
    skip,
  } = input

  let nextSnapshot: SessionSnapshot | undefined
  let attemptId = ''
  let answeredAt = 0
  let ratingUpdate: RatingUpdate | null | undefined

  // ①〜⑤を1つのトランザクションで書く。途中で例外が起きれば全部ロールバックされるので、
  // 呼び出し側は同じ入力でそのまま再試行できる（部分書き込みが残らない＝冪等）。
  // 内側の各エンジンも db.transaction を張るが、Dexieの入れ子は親へ join するため
  // **ここで列挙するテーブルに内側が使う全テーブルを含める必要がある**
  // （attempts/settings=session, srsCards=keyVocab・srs, tagStats, ratings/ratingHistory=rating）
  await db.transaction(
    'rw',
    [db.attempts, db.settings, db.srsCards, db.tagStats, db.ratings, db.ratingHistory],
    async () => {
      if (snapshot) {
        nextSnapshot = await answerCurrentQuestion(db, snapshot, {
          isCorrect,
          responseMs,
          isTimeout,
        })
        attemptId = nextSnapshot.attemptIds.at(-1)!
        // answerCurrentQuestion は updatedAt に今回記録した attempt の answeredAt をそのまま入れる（session.ts参照）
        answeredAt = nextSnapshot.updatedAt
      } else {
        const attempt = await recordAttempt(db, {
          questionId,
          mode,
          isCorrect,
          responseMs,
          isTimeout,
        })
        attemptId = attempt.id
        answeredAt = attempt.answeredAt
      }

      if (!isCorrect && !skip?.wrongAnswer) {
        await processWrongAnswer(db, question)
      }

      if (!skip?.tagStats) {
        await updateTagStatsForAnswer(db, questionId, lookup)
      }

      if (!skip?.rating) {
        ratingUpdate = await applyRatingUpdate(db, {
          part: question.part,
          difficulty: question.difficulty,
          isCorrect,
          mode,
        })
      }

      if (srsCardId && !skip?.srs) {
        await reviewSrsCard(db, srsCardId, srsGrade ?? (isCorrect ? 'good' : 'again'))
      }
    },
  )

  // ⑥ レイドダメージのエンキューはトランザクションの外。共有API向けの副作用なので、
  // 失敗しても学習記録（①〜⑤）は成立させる（縮退設計）。この解答分のダメージは失われるが、
  // 送信自体が「pendingSyncキュー経由の冪等送信」で取りこぼしを許す設計になっている
  let raidDamage: RaidDamageResult | undefined
  try {
    raidDamage =
      (await enqueueRaidSyncIfEnabled(db, {
        attemptId,
        questionId,
        answeredAt,
        mode,
        isCorrect,
        basePoints: ratingUpdate?.basePoints ?? 0,
      })) ?? undefined
  } catch (err) {
    console.warn('[answerPipeline] レイドダメージのエンキューに失敗（解答は記録済み）', err)
  }

  return { nextSnapshot, ratingUpdate, raidDamage }
}
