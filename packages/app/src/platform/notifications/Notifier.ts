// 通知の抽象インターフェース（定義のみ。M1では通知機能を持たない）。
// docs/05 7節: iOS PWA はスケジュールされたローカル通知を打てないため、
// 通知の実装は Capacitor 移行時（ローカル通知プラグイン）が本命。
// ここでは差し替え点を先に固定しておく。

export interface ScheduledNotification {
  id: string
  title: string
  body: string
  /** 通知予定時刻（エポックミリ秒） */
  at: number
}

export interface Notifier {
  /** 通知許可を要求する。granted 以外なら false */
  requestPermission(): Promise<boolean>

  /** ローカル通知をスケジュールする（SRS期限・ストリーク用。M2以降） */
  schedule(notification: ScheduledNotification): Promise<void>

  /** スケジュール済み通知を取り消す */
  cancel(id: string): Promise<void>
}
