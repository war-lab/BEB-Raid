// 音声再生の抽象インターフェース（docs/05 7節: ネイティブ化時の差し替え点）。
// UI・エンジンコードは Web Audio / HTMLAudioElement を直接触らず、必ずこの
// インターフェース経由で再生する。Capacitor 移行時はネイティブオーディオ実装に
// 差し替える（バックグラウンド再生対応）。

/** 再生オプション */
export interface PlayOptions {
  /** 再生開始位置（ミリ秒）。J-5「冒頭だけ再生」特訓用 */
  startMs?: number
  /** 再生継続時間（ミリ秒）。指定時はこの長さで停止する */
  durationMs?: number
  /**
   * 再生速度（0.7〜1.3想定）。
   * 【予約のみ】M1では未実装（J-6: Part2は等倍が正。主用途のディクテーション/
   * シャドーイングは M2）。M1実装が値を受け取っても無視してよい。
   */
  rate?: number
}

export interface AudioPlayer {
  /**
   * モバイルブラウザの自動再生制限を解除する（docs/05 8節）。
   * セッション開始のユーザータップ内で1回呼ぶこと。
   */
  unlock(): Promise<void>

  /** 1音源を再生する。再生完了（または stop）で resolve する */
  play(src: string, options?: PlayOptions): Promise<void>

  /**
   * 複数音源の連結再生（Part2の設問→応答など）。
   * 途中で stop された場合は残りを再生せず resolve する。
   */
  playSequence(srcs: string[], options?: PlayOptions): Promise<void>

  /** 直前に再生した音源をもう一度再生する（リプレイ） */
  replay(): Promise<void>

  /** 再生を即時停止する */
  stop(): void
}
