// 週次ボス生成（正本: docs/17_M3実装計画.md 3.4節）。
// Cron Trigger（月曜0:00 UTC=JST9:00）で発火する想定。
// ①前週ボスの実績からmembersのemaDailyDamageを更新 → ②更新後の値からHPを算出 → ③当週ボスDOを初期化（冪等）

import type { GhostDefenseEntry } from '@beb-raid/shared-schema'

import { bossProfileForWeek } from './bossProfiles'
import type { Env, MemberRecord } from './env'
import { memberKey } from './env'
import { selectGhostRecord } from './ghostSelection'
import { updateGhostRecordIfPresent } from './ghostStore'
import { listAllKeys } from './kvList'
import type { RaidBossDO } from './raidBossDo'
import {
  BOSS_HP_FACTOR,
  DAILY_GOAL_QUESTIONS,
  DAMAGE_PER_QUESTION,
  EMA_WEIGHT,
  GHOST_HP_FACTOR,
  GHOST_MULTIPLIER_SOLID,
  GHOST_MULTIPLIER_WEAK,
  MIN_BOSS_HP,
  RAID_BOSS_RETENTION_WEEKS,
  RAID_DAYS,
} from './raidConfig'
import { bossIdFor, isoWeekInfo, previousWeekInfo, weekEndAt } from './raidWeek'
import { raidSummaryKey } from './raidSummaryStore'

const MEMBER_KEY_PREFIX = 'member:'
const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

/**
 * 前週ボスのゴーストクローズ処理（正本: docs/22 3.3節）。
 * 前週がghost週かつ討伐成立していれば、該当ghostレコードのdefeatedCountを+1する
 * （レコードが撤回済み＝KVから無ければ何もしない）。cronの再実行に備え、処理後は
 * 前週DO側のghostSourceTokenをクリアして二重加算されないようにする（DO側で冪等化）
 *
 * 【T-248・29のQ-30】defeatedCountの加算は updateGhostRecordIfPresent 経由で行う。
 * 以前は「読取→加算→書込」を素朴に行っており、読取後・書込前に `DELETE /ghosts/own`
 * （撤回）が割り込むと、撤回済みレコードが古い内容のまま復活しえた
 */
async function closeOutPreviousGhost(
  env: Env,
  previousStub: DurableObjectStub<RaidBossDO>,
): Promise<void> {
  const info = await previousStub.getGhostCloseInfo()
  if (!info) return

  if (info.defeated) {
    await updateGhostRecordIfPresent(env, info.ghostSourceToken, (record) => ({
      ...record,
      defeatedCount: record.defeatedCount + 1,
    }))
  }
  await previousStub.markGhostCloseoutHandled()
}

/**
 * 週次データの掃除（T-247・29のQ-29。方針は docs/17_M3実装計画.md 3.4節に記録）。
 * RAID_BOSS_RETENTION_WEEKS週より前に終了した週のRaidBossDOを削除する。掃除は
 * 週次ボス生成そのものの成否に影響させない（副次処理のため失敗してもthrowしない）。
 *
 * 削除対象の週は「保持期間の境界（cutoffEpoch = 当週開始 − RETENTION週）を1ms遡った時刻が
 * 属する週」とする。この週は必ず weekStartAt + WEEK_MS（＝翌週の開始）= cutoffEpoch を
 * 満たすため、この週のendAt（金曜15:00。翌週開始より必ず前）は常にcutoffEpochより前になり、
 * cleanupIfExpired側の判定（endAt < cutoff）に確実に該当する。cronは日次発火のため、
 * 対象週は約7日間かけて同じbossIdを指し続け、最初の1回で削除された後は
 * cleanupIfExpired が not_found を返すだけになる（冪等）
 */
async function cleanupExpiredRaidBoss(env: Env, current: { weekStartAt: number }): Promise<void> {
  try {
    const cutoffEpoch = current.weekStartAt - RAID_BOSS_RETENTION_WEEKS * WEEK_MS
    const targetBossId = bossIdFor(isoWeekInfo(cutoffEpoch - 1))
    const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(targetBossId))
    const result = await stub.cleanupIfExpired(cutoffEpoch)
    if (result === 'deleted') {
      console.log(`週次RaidBossDOを掃除しました: bossId=${targetBossId}`)
    }
  } catch (err) {
    console.error('週次RaidBossDOの掃除に失敗しました（週次ボス生成自体は継続）', err)
  }
}

/**
 * 前週ボスの週次サマリをKVへ書き込む（正本: docs/22 3.8節）。
 * 個人別データ（貢献者一覧・表示名等）は含めない集計のみを保存する。
 * 前週ボスが未初期化（サービス開始直後で前週分が存在しない）の場合は何もしない
 */
async function writeRaidSummary(
  env: Env,
  previousBossId: string,
  previousStub: DurableObjectStub<RaidBossDO>,
): Promise<void> {
  const summary = await previousStub.getSummary()
  if (!summary) return
  await env.MEMBERS.put(raidSummaryKey(previousBossId), JSON.stringify(summary))
}

function estimatedDailyDamage(member: MemberRecord): number {
  return member.emaDailyDamage ?? DAILY_GOAL_QUESTIONS[member.dailyGoal] * DAMAGE_PER_QUESTION
}

/**
 * @returns 実際に生成処理を行ったか（週の生成権を取得できたか）。
 * falseは「他の呼び出し（cronと手動生成の競合、または並行リクエスト）が既に処理済み」を意味し、
 * 呼び出し元は何もする必要が無い
 */
export async function generateWeeklyBoss(env: Env, now: number): Promise<boolean> {
  const current = isoWeekInfo(now)
  const bossId = bossIdFor(current)
  const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(bossId))

  // 週の生成権の主張（冪等化。docs/30 J-101・T-179）。①EMA更新が非冪等なため、
  // ここで取得できなければ即returnする。取得できなければ他の呼び出しが既に処理中/済みである
  const claimed = await stub.claimGeneration()
  if (!claimed) {
    console.log(`週次ボス生成: 生成権を取得できず終了しました bossId=${bossId}`)
    return false
  }

  try {
    // startAtはcron発火時刻ではなくISO週の開始時刻とする。発火が遅延・再実行された場合でも
    // 「月曜0:00 UTC〜発火時刻」のansweredAtを持つattemptが期間外として無言で捨てられないようにする
    const startAt = current.weekStartAt
    const endAt = weekEndAt(current.weekStartAt)

    const previous = previousWeekInfo(current)
    const previousBossId = bossIdFor(previous)
    const previousStub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(previousBossId))
    const previousDamageByToken = await previousStub.totalDamageByDeviceToken()

    // ゴースト週クローズ処理（docs/22 3.3節）: 前週がghost週かつ討伐成立していればdefeatedCountを+1
    await closeOutPreviousGhost(env, previousStub)

    // 週次サマリ書込（docs/22 3.8節）: 前週ボスの集計（個人別データ非含有）をKVへ保存する
    await writeRaidSummary(env, previousBossId, previousStub)

    // 【T-244・29のQ-23】KV.list()は1ページ最大1,000件までしか返さない。cursorが尽きるまで
    // 全ページ読み切らないと、メンバーが1,000人を超えた時点でEMA更新・HP算出の両方が
    // 無言で一部のメンバーを取りこぼす（実際に1,050人規模で検証し再現した）
    const memberKeys = await listAllKeys(env.MEMBERS, { prefix: MEMBER_KEY_PREFIX })

    // ①前週実績からemaDailyDamageを更新する
    for (const key of memberKeys) {
      const raw = await env.MEMBERS.get(key.name)
      if (!raw) continue
      const deviceToken = key.name.slice(MEMBER_KEY_PREFIX.length)
      const member = JSON.parse(raw) as MemberRecord
      // 前週実績もEMAも無いメンバー（登録直後で一度も週を跨いでいない）はemaを書き込まない。
      // ここで0を確定させると、以後estimatedDailyDamage()のdailyGoalフォールバック（J-48の
      // 「emaが無ければ申告問題数から換算」）に二度と入らなくなるため、undefinedのまま温存する
      const hasPreviousRecord = deviceToken in previousDamageByToken
      if (!hasPreviousRecord && member.emaDailyDamage === undefined) continue
      const previousDamage = previousDamageByToken[deviceToken] ?? 0
      const previousDaily = previousDamage / RAID_DAYS
      const updatedEma =
        member.emaDailyDamage === undefined
          ? previousDaily
          : EMA_WEIGHT * previousDaily + (1 - EMA_WEIGHT) * member.emaDailyDamage
      await env.MEMBERS.put(
        memberKey(deviceToken),
        JSON.stringify({ ...member, emaDailyDamage: updatedEma }),
      )
    }

    // ②更新後の値からHPを算出する（①と同じ理由でcursorを最後まで読む）
    const refreshed = await listAllKeys(env.MEMBERS, { prefix: MEMBER_KEY_PREFIX })
    let totalDailyDamage = 0
    for (const key of refreshed) {
      const raw = await env.MEMBERS.get(key.name)
      if (!raw) continue
      totalDailyDamage += estimatedDailyDamage(JSON.parse(raw) as MemberRecord)
    }
    const maxHp = Math.max(MIN_BOSS_HP, Math.round(totalDailyDamage * RAID_DAYS * BOSS_HP_FACTOR))

    // ③当週ボスDOを初期化する（既に存在すれば何もしない）。
    // 承認済みのゴースト記録があればghost週として生成し（docs/22 3.3節）、無ければ従来どおりsynthetic
    const recentBossIds = [bossId, previousBossId]
    const selectedGhost = await selectGhostRecord(env, recentBossIds)

    if (selectedGhost) {
      const defense: GhostDefenseEntry[] = selectedGhost.record.records.map((r) => ({
        questionId: r.questionId,
        multiplier: r.correct ? GHOST_MULTIPLIER_SOLID : GHOST_MULTIPLIER_WEAK,
      }))
      const ghostMaxHp = Math.round(maxHp * GHOST_HP_FACTOR)
      await stub.init({
        bossId,
        profile: {
          name: `ゴースト・${selectedGhost.record.displayName}`,
          flavor:
            'かつてボス役を務めた挑戦者の記録から生まれたゴースト。堅い/弱点の跡が今週の防御になる。',
        },
        maxHp: ghostMaxHp,
        startAt,
        endAt,
        bossType: 'ghost',
        defense,
        ghost: {
          displayName: selectedGhost.record.displayName,
          defeatedCount: selectedGhost.record.defeatedCount,
        },
        ghostSourceToken: selectedGhost.deviceToken,
      })
      // 選定した記録のlastUsedBossIdを今回のbossIdへ更新する（次回以降のクールダウン判定に使う）。
      // 【T-248・29のQ-30】selectedGhost.recordはselectGhostRecord内で読み取った古い
      // スナップショット（この後の全メンバーEMA更新ループを経ているため実運用では
      // 数百ms〜秒オーダーの遅延がある）。ここで素朴に書き戻すと、その間に
      // `DELETE /ghosts/own`（撤回）が完了していても古い内容のまま復活しうる。
      // updateGhostRecordIfPresentは書込直前に再取得し、既に削除されていれば書込を取りやめる
      await updateGhostRecordIfPresent(env, selectedGhost.deviceToken, (current) => ({
        ...current,
        lastUsedBossId: bossId,
      }))
    } else {
      await stub.init({
        bossId,
        profile: bossProfileForWeek(current.isoWeek),
        maxHp,
        startAt,
        endAt,
      })
    }

    // 週1回しか走らないジョブのため、成功時も生成結果を必ずログに残す（失敗時の切り分け材料）
    console.log(`週次ボス生成完了: bossId=${bossId} maxHp=${maxHp} members=${memberKeys.length}`)

    // 週次データの掃除（T-247・29のQ-29）。生成本体の後段・独立した副次処理として実行する
    await cleanupExpiredRaidBoss(env, current)

    return true
  } catch (err) {
    // 生成権を解放しないと、ボスが存在しないまま週が「生成済み」に固定され、
    // 手動生成（POST /admin/raid/generate）でも復旧できなくなる
    await stub.releaseGenerationClaim()
    throw err
  }
}
