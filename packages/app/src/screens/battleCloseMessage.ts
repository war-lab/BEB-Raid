// イベントバトルの切断理由ごとの案内文（S7 参加画面・S8 ホスト画面で共用）。
// サーバー（BattleRoomDO）はクローズ時に理由を付けて切断するが、以前はクライアントが理由を
// 捨てて「接続が切れました」の固定文しか出しておらず、レイド未登録が原因の場合に
// 「招待コードでの登録が必要」と分からなかった。理由ごとに原因と次の行動を示す。
// 文言は敬体・非技術者向け（内部用語は出さない）で、原因を利用者のせいにしない
// （心理的安全性の方針＝docs/02）。
import { isBattleCloseReason } from '@beb-raid/shared-schema'

/** 参加者（S7）とホスト（S8）で次にとる行動が違うため、案内文を役割で切り替える */
export type BattleRole = 'participant' | 'host'

export interface BattleCloseMessage {
  /** ScreenLayoutのstatusに出す見出し */
  title: string
  /** 本文（原因と次にとる行動） */
  body: string
}

/**
 * イベントバトルはレイド登録済みの端末だけが使えるという制約の案内。
 * 登録導線はホーム画面の「レイド」→招待コード入力（RaidScreenの未登録時フォーム）
 */
function unauthorizedMessage(role: BattleRole): BattleCloseMessage {
  const action = role === 'host' ? '主催できます' : '参加できます'
  return {
    title: 'イベントバトルに参加できませんでした',
    body:
      'この端末はまだレイドに登録されていません。イベントバトルは、レイドに登録済みの端末だけが利用できます。' +
      `ホーム画面の「レイド」を開き、招待コードを入力して登録すると${action}。` +
      '招待コードは主催者から受け取ってください。',
  }
}

function roomNotFoundMessage(role: BattleRole): BattleCloseMessage {
  return {
    title: 'ルームが見つかりませんでした',
    body:
      role === 'host'
        ? 'このルームは見つからないか、すでに終了しています。お手数ですが、ルームをもう一度作成してください。'
        : 'ルームコードが違っているか、このバトルがすでに終了している可能性があります。ルームコードを主催者に確認して、もう一度お試しください。',
  }
}

function roomClosedMessage(role: BattleRole): BattleCloseMessage {
  return {
    title: 'バトルが終了しました',
    body:
      role === 'host'
        ? 'バトルを終了しました。お疲れさまでした。'
        : '主催者がバトルを終了しました。お疲れさまでした。',
  }
}

function unknownMessage(role: BattleRole): BattleCloseMessage {
  return {
    title: '接続が切れました',
    body:
      role === 'host'
        ? '通信が途切れたため、接続が終了しました。電波の届く場所で、ルームをもう一度作成してください。'
        : '通信が途切れたか、主催者側の接続が終了したようです。電波の届く場所で、もう一度お試しください。',
  }
}

/**
 * クローズ理由から案内文を決める。
 * reasonが空文字・未知（通信断でサーバーが理由を付けられない場合等）なら汎用の案内文に落とす
 */
export function resolveBattleCloseMessage(reason: string, role: BattleRole): BattleCloseMessage {
  if (!isBattleCloseReason(reason)) return unknownMessage(role)
  switch (reason) {
    case 'unauthorized':
      return unauthorizedMessage(role)
    case 'room_not_found':
      return roomNotFoundMessage(role)
    case 'room_closed':
      return roomClosedMessage(role)
  }
}
