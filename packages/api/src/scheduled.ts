// 週次ボス生成（正本: docs/17_M3実装計画.md 3.4節）。
// Cron Trigger（月曜0:00 UTC=JST9:00）で発火する想定。
// ①前週ボスの実績からmembersのemaDailyDamageを更新 → ②更新後の値からHPを算出 → ③当週ボスDOを初期化（冪等）

import type { GhostDefenseEntry } from '@beb-raid/shared-schema'

import { bossProfileForWeek } from './bossProfiles'
import type { Env, MemberRecord } from './env'
import { memberKey } from './env'
import { selectGhostRecord } from './ghostSelection'
import { GHOST_USED_BOSS_HISTORY_LIMIT, updateGhostRecordIfPresent } from './ghostStore'
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
 * 掃除1回のcron実行で遡ってチェックする週数（T-337・K-72）。
 * 旧実装は境界週（cutoffEpoch）ちょうど1週だけをチェックしており、cronが数日〜数週間
 * 発火しなかった（障害・デプロイ不整合等）場合、その間に保持期間を超えた週の一部が
 * 「対象週が翌週へ移ってしまい二度とチェックされない」形で永久に残り続けた
 * （対象週は日次cronの前提で約7日間だけ同じbossIdを指す設計だったため、7日を超える
 * 空白があると取りこぼす）。境界週から遡って複数週まとめてチェックすれば、
 * 空白期間中に取りこぼした週も次回発火時に自己修復する。cleanupIfExpiredは
 * 存在しない週・保持期間内の週に対しても安全（not_found/kept）なため、
 * 毎回複数週チェックしても副作用は増えない
 */
const CLEANUP_LOOKBACK_WEEKS = 4

/**
 * 掃除済み境界の記録キー（レビュー指摘6）。
 *
 * CLEANUP_LOOKBACK_WEEKSだけでは、その週数を超えてcronが止まると取りこぼした週が
 * 二度と対象にならない（cutoff自体が先へ進むため）。最後にどこまで掃除したかを残し、
 * 次回はそこから当週のcutoffまで追いつくことで、停止期間の長さによらず回収できる
 */
const CLEANUP_WATERMARK_KEY = 'raid:cleanupWatermarkEpoch'

/** 1回のcronで掃除する上限週数。無制限にすると長期停止後の1回で外向き呼び出しが跳ねる */
const CLEANUP_MAX_WEEKS_PER_RUN = 52

/**
 * 週次データの掃除（T-247・29のQ-29。方針は docs/17_M3実装計画.md 3.4節に記録）。
 * RAID_BOSS_RETENTION_WEEKS週より前に終了した週のRaidBossDOを削除する。掃除は
 * 週次ボス生成そのものの成否に影響させない（副次処理のため失敗してもthrowしない）。
 *
 * 削除対象の週は「保持期間の境界（cutoffEpoch = 当週開始 − RETENTION週）を1ms遡った時刻が
 * 属する週」を起点に、そこからCLEANUP_LOOKBACK_WEEKS週分遡って毎回まとめてチェックする
 * （上のCLEANUP_LOOKBACK_WEEKSのコメント参照）。起点の週は必ず
 * weekStartAt + WEEK_MS（＝翌週の開始）= cutoffEpoch を満たすため、この週のendAt
 * （金曜15:00。翌週開始より必ず前）は常にcutoffEpochより前になり、cleanupIfExpired側の
 * 判定（endAt < cutoff）に確実に該当する
 */
async function cleanupExpiredRaidBoss(env: Env, current: { weekStartAt: number }): Promise<void> {
  const cutoffEpoch = current.weekStartAt - RAID_BOSS_RETENTION_WEEKS * WEEK_MS

  // 掃除は「前回どこまで終わったか」から**古い側から新しい側へ**進める（レビュー2巡目 指摘6）。
  // 新しい側から遡る形だと、停止が上限週数を超えたときに古い側が未処理のまま残るのに
  // 境界だけ現在位置へ飛び、その空白が二度と埋まらなかった。
  // 記録が無い初回は従来どおりCLEANUP_LOOKBACK_WEEKS週分だけ遡って始める
  const watermarkRaw = await env.MEMBERS.get(CLEANUP_WATERMARK_KEY)
  const parsed = watermarkRaw === null ? Number.NaN : Number(watermarkRaw)
  const startEpoch = Number.isFinite(parsed)
    ? parsed
    : cutoffEpoch - CLEANUP_LOOKBACK_WEEKS * WEEK_MS

  let processed = 0
  // 「実際に処理を完了した境界」。失敗したらそこで止め、以降は次回に持ち越す
  let completedThrough = startEpoch
  for (
    let target = startEpoch;
    target < cutoffEpoch && processed < CLEANUP_MAX_WEEKS_PER_RUN;
    target += WEEK_MS
  ) {
    try {
      const targetBossId = bossIdFor(isoWeekInfo(target))
      const stub = env.RAID_BOSS.get(env.RAID_BOSS.idFromName(targetBossId))
      const result = await stub.cleanupIfExpired(cutoffEpoch)
      if (result === 'deleted') {
        console.log(`週次RaidBossDOを掃除しました: bossId=${targetBossId}`)
      }
      completedThrough = target + WEEK_MS
    } catch (err) {
      // 失敗した週で境界を止める。進めてしまうと、その週が4週窓より古くなった時点で
      // 二度と再試行されない（旧実装はここで握り潰したまま境界を現在位置へ進めていた）
      console.error('週次RaidBossDOの掃除に失敗しました（週次ボス生成自体は継続）', err)
      break
    }
    processed += 1
  }

  // 上限で打ち切った場合も、実際に終えた境界までしか進めない（残りは次回が続きから拾う）。
  // 1週も完了しなかった場合でも startEpoch を必ず記録する（レビュー3巡目 指摘3）。
  // 記録しないと、初回に最古週で失敗したとき次回が新しいcutoffから
  // CLEANUP_LOOKBACK_WEEKS を数え直し、失敗した週が窓の外へ落ちて二度と再訪されない
  const nextWatermark = Math.min(completedThrough, cutoffEpoch)
  await env.MEMBERS.put(CLEANUP_WATERMARK_KEY, String(nextWatermark))
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
  const claimed = await stub.claimGeneration(now)
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
    // 全ページ読み切らないと、メンバーが1,000人を超えた時点で取りこぼす（1,050人規模で再現した）。
    // 【T-326・K-61】旧実装はこの全件走査を①EMA更新・②HP算出の2回（＝メンバー1人あたり
    // get2回）に分けていたため、無料枠の外向き呼び出し上限にメンバー数の増加で当たりうる
    // （週次cronがO(3N)になる）。②は①のループ内でその場で計算できる値（更新後のema、
    // または更新しなかった場合は元のmember。estimatedDailyDamageはemaDailyDamageが
    // undefinedならdailyGoalフォールバックを使うため、undefinedのまま渡しても正しい）
    // なので、走査そのものを1回に統合しget呼び出しを1人あたり1回にする
    const memberKeys = await listAllKeys(env.MEMBERS, { prefix: MEMBER_KEY_PREFIX })

    let totalDailyDamage = 0
    for (const key of memberKeys) {
      const raw = await env.MEMBERS.get(key.name)
      if (!raw) continue
      const deviceToken = key.name.slice(MEMBER_KEY_PREFIX.length)
      const member = JSON.parse(raw) as MemberRecord
      // 前週実績もEMAも無いメンバー（登録直後で一度も週を跨いでいない）はemaを書き込まない。
      // ここで0を確定させると、以後estimatedDailyDamage()のdailyGoalフォールバック（J-48の
      // 「emaが無ければ申告問題数から換算」）に二度と入らなくなるため、undefinedのまま温存する
      const hasPreviousRecord = deviceToken in previousDamageByToken
      if (!hasPreviousRecord && member.emaDailyDamage === undefined) {
        totalDailyDamage += estimatedDailyDamage(member)
        continue
      }
      // 途中失敗からの再実行で二重に平滑化しない（レビュー指摘2）。
      // 生成が200人目で落ちた場合、翌日の再実行では先頭200人のEMAが既に今週分を
      // 反映しているため、マーカーが一致するメンバーは更新せずHP集計だけに使う
      if (member.emaUpdatedForBossId === bossId) {
        totalDailyDamage += estimatedDailyDamage(member)
        continue
      }
      const previousDamage = previousDamageByToken[deviceToken] ?? 0
      const previousDaily = previousDamage / RAID_DAYS
      const updatedEma =
        member.emaDailyDamage === undefined
          ? previousDaily
          : EMA_WEIGHT * previousDaily + (1 - EMA_WEIGHT) * member.emaDailyDamage
      const updatedMember = { ...member, emaDailyDamage: updatedEma, emaUpdatedForBossId: bossId }
      // KV listのmetadataにも載せる（T-326・K-61）。この関数の外でemaDailyDamageだけを
      // 参照したい将来の呼び出し元がlist()のmetadataからget()無しで読めるようにする用途
      await env.MEMBERS.put(memberKey(deviceToken), JSON.stringify(updatedMember), {
        metadata: { emaDailyDamage: updatedEma },
      })
      totalDailyDamage += estimatedDailyDamage(updatedMember)
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
        // 撤回時に全ての週の派生データを消せるよう使用履歴も残す（レビュー指摘5）
        usedBossIds: [bossId, ...(current.usedBossIds ?? []).filter((id) => id !== bossId)].slice(
          0,
          GHOST_USED_BOSS_HISTORY_LIMIT,
        ),
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
