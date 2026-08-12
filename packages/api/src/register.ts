// POST /register（正本: docs/17_M3実装計画.md 3.2節、docs/30_改修計画_全量レビュー棚卸し.md
// T-242・29のQ-21・J-103）。
// 招待コード検証→deviceTokenをKVへ登録（新規発行はしない。端末が既に発行済みのprofile.deviceTokenを受け取る）。
// 再登録（同一deviceTokenでの再POST）はdisplayName/dailyGoalの上書き手段を兼ねる（専用の更新APIを作らない）。
// registeredAt・emaDailyDamageは既存レコードがあればそのまま引き継ぐ
// （表示名変更のたびにHP算出用のEMAが消えるのは意図しない副作用のため）
//
// 【T-242・J-103】このエンドポイントは以前、無認証・無レート制限・deviceToken形式無検証だった。
// publicリポジトリのためURLが既知で、招待コードの総当たりを妨げるものが無く、招待コードを
// 知る者は任意個の偽deviceTokenを登録できた（登録者全員がHP算出の母数になるため、
// ボスHPを恣意的に吊り上げる荒らしが成立する＝scheduled.tsのtotalDailyDamage）。
// J-103の正文どおり次の3点に限って防御する：
//   ① deviceTokenの形式強制（UUID v4。新規登録・表示名更新=このエンドポイントのみに適用し、
//      既存メンバーの認証=auth.tsのauthenticateRequestには適用しない。本番KVの既存トークン
//      形式を事前確認できないため、非UUIDトークンを持つ既存端末の認証を壊さない安全側に倒す）
//   ② 登録総数の上限
//   ③ 招待コード誤りの回数計測とレート制限（IPごと）
// サーバー側でのdeviceToken発行（形式強制の別解）は契約変更になるため採らない（J-103）

import type { DailyGoal, RegisterRequest } from '@beb-raid/shared-schema'

import type { Env, MemberRecord } from './env.js'
import { memberKey } from './env.js'
import { listAllKeys } from './kvList.js'
import { timingSafeStringEqual } from './timingSafeEqual.js'

const MEMBER_KEY_PREFIX = 'member:'

/**
 * 表示名→deviceTokenの逆引き索引キー（T-331・K-66）。
 * 全件スキャンで一意性を確認する代わりにO(1)で既存の持ち主を引けるようにする。
 * displayNameOwnerKeyの値には保持者のdeviceTokenをそのまま入れる（他情報は持たない）
 */
function displayNameOwnerKey(displayName: string): string {
  return `displayNameOwner:${displayName}`
}

function isDailyGoal(value: unknown): value is DailyGoal {
  return value === 'light' || value === 'normal' || value === 'heavy'
}

/**
 * 表示名の上限。displayNameは貢献一覧として全メンバーへ配信される値のため、
 * 無制限だとKV肥大と他メンバーの画面崩れの両方に波及する
 */
export const MAX_DISPLAY_NAME_LENGTH = 32

/**
 * deviceTokenの形式（UUID v4。`crypto.randomUUID()`が生成する形式。大文字小文字は問わない）。
 * 【①deviceTokenの形式強制】アプリは`crypto.randomUUID()`を使うため新規登録には影響しない
 * （packages/app/src/services/profile.ts参照）
 */
const DEVICE_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * 【②登録総数の上限】実運用は数十人規模（docs/STATUS.md参照）。500は招待コード漏洩時の
 * 際限ない登録（KVレコードの乱造・ボスHP吊り上げ）を防ぎつつ、正当な成長に十分な余裕を
 * 持たせた暫定値（MAX_SYNC_PAYLOADSと同じ考え方）。上限判定は新規登録のみに適用し、
 * 既存メンバーの再登録（表示名更新）は上限到達後も許可する
 */
export const MAX_REGISTERED_MEMBERS = 500

/**
 * 【③招待コード誤りのレート制限】IPごとにウィンドウ内の失敗回数を数える。
 * 正しいコードでの登録成功時にカウンタをクリアするため、正規ユーザーの誤入力の
 * 誤爆で長時間ロックされることはない。
 *
 * 【T-329・K-64】カウンタ本体はKVではなくInviteRateLimitDo（IPごとに1インスタンス）に
 * 置く。旧実装はKVへの素朴なread-modify-writeで、並列リクエストだと複数のgetが
 * 同じ古いcountを読んでから書き込むため加算が失われ（lost update）、閾値超の並列アクセスでも
 * 一切429にならないことを実測で確認した。DOは単一スレッドで動くため、同一インスタンスへの
 * メソッド呼び出しは自動的に直列化され、この種の競合が起きない
 */
function clientIp(request: Request): string {
  // CF-Connecting-IPはCloudflareのエッジが設定する実接続元IPで、クライアントからは
  // 偽装できない。ローカル開発・テスト環境等でヘッダが無い場合は共有バケットへ落ちる
  // （本番運用では常に付与されるため、実運用上のレート制限を弱める副作用は無い）
  return request.headers.get('CF-Connecting-IP') ?? 'unknown'
}

function inviteRateLimitStub(env: Env, ip: string) {
  return env.INVITE_RATE_LIMIT.get(env.INVITE_RATE_LIMIT.idFromName(ip))
}

function isRegisterRequest(body: unknown): body is RegisterRequest {
  if (typeof body !== 'object' || body === null) return false
  const b = body as Record<string, unknown>
  return (
    typeof b.inviteCode === 'string' &&
    typeof b.deviceToken === 'string' &&
    DEVICE_TOKEN_PATTERN.test(b.deviceToken) &&
    typeof b.displayName === 'string' &&
    b.displayName.trim().length > 0 &&
    b.displayName.trim().length <= MAX_DISPLAY_NAME_LENGTH &&
    isDailyGoal(b.dailyGoal)
  )
}

function errorResponse(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function handleRegister(
  request: Request,
  env: Env,
  now: number = Date.now(),
): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorResponse(400, 'invalid_body', 'JSONの解析に失敗しました')
  }

  if (!isRegisterRequest(body)) {
    return errorResponse(400, 'invalid_body', 'リクエストボディの形式が不正です')
  }

  const ip = clientIp(request)

  // タイミングセーフな比較（T-250・29のQ-32）。`!==`は不一致文字までの応答時間差から
  // 招待コードを推測されうる。レート制限判定の前に比較すること自体はタイミングからの
  // 推測可能性に影響しない（比較自体は常に一定時間で終わり、結果はDOへ渡すだけ）
  const isValidCode = timingSafeStringEqual(body.inviteCode, env.INVITE_CODE)

  // ③レート制限（T-329・K-64）: 判定・記録・クリアを1回のDO呼び出し（evaluate）に
  // まとめる。既に閾値を超えている場合は招待コードの正誤に関わらず一律429にする
  // （正誤を見てから拒否すると、閾値ちょうどで待っては試すパターンに対して
  // 「このリクエストの正誤」を漏らしてしまうため）
  const outcome = await inviteRateLimitStub(env, ip).evaluate(now, isValidCode)
  if (outcome === 'rate_limited') {
    return errorResponse(
      429,
      'rate_limited',
      '招待コードの試行回数が多すぎます。しばらく待ってから再試行してください',
    )
  }
  if (outcome === 'invalid_code') {
    return errorResponse(401, 'invalid_invite_code', '招待コードが一致しません')
  }

  const existingRaw = await env.MEMBERS.get(memberKey(body.deviceToken))
  const existing = existingRaw ? (JSON.parse(existingRaw) as MemberRecord) : undefined

  // ②登録総数の上限: 新規登録（＝既存レコードが無い）のときのみ判定する。
  // 既存メンバーの再登録（表示名更新）は上限到達後も維持できないと詰むため対象外
  if (!existing) {
    const memberCount = (await listAllKeys(env.MEMBERS, { prefix: MEMBER_KEY_PREFIX })).length
    if (memberCount >= MAX_REGISTERED_MEMBERS) {
      return errorResponse(
        403,
        'registration_limit_reached',
        '登録可能なメンバー数の上限に達しています',
      )
    }
  }

  const displayName = body.displayName.trim()

  // T-331（K-66）: 表示名の一意性を検証する。検証しないと、参加者がイベントバトルの
  // joinメッセージで他メンバー（ホスト含む）の登録済み表示名をそのまま名乗れてしまい、
  // なりすまし対策（battleRoomDo.tsが採用する登録済み表示名）が無意味になる。
  // 表示名を変えていない再登録（既存メンバーの表示名更新以外の項目変更）は
  // 自分自身が持ち主なので対象外にする
  if (displayName !== existing?.displayName) {
    const ownerRaw = await env.MEMBERS.get(displayNameOwnerKey(displayName))
    if (ownerRaw !== null && ownerRaw !== body.deviceToken) {
      return errorResponse(409, 'display_name_taken', 'その表示名は既に使用されています')
    }
  }

  const record: MemberRecord = {
    displayName,
    dailyGoal: body.dailyGoal,
    registeredAt: existing?.registeredAt ?? now,
    emaDailyDamage: existing?.emaDailyDamage,
  }

  await env.MEMBERS.put(memberKey(body.deviceToken), JSON.stringify(record))
  // 表示名を変更した場合は逆引き索引を更新する（旧名の索引は消す。放置すると別ユーザーが
  // 旧名を新規登録しようとした際に「使用中」の誤判定になる）
  if (displayName !== existing?.displayName) {
    if (existing?.displayName) {
      await env.MEMBERS.delete(displayNameOwnerKey(existing.displayName))
    }
    await env.MEMBERS.put(displayNameOwnerKey(displayName), body.deviceToken)
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
