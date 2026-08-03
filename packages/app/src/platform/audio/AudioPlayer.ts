// 音声再生の抽象インターフェース（docs/05 7節: ネイティブ化時の差し替え点）。
// UI・エンジンコードは Web Audio / HTMLAudioElement を直接触らず、必ずこの
// インターフェース経由で再生する。Capacitor 移行時はネイティブオーディオ実装に
// 差し替える（バックグラウンド再生対応）。

/**
 * 再生の終わり方（T-155。docs/28 の1.5節・3節）。
 * 従来この区別が契約に無く、`play()` が「再生完了（または stop）で resolve する」
 * だけを保証していたため、呼び出し側は完走と中断を判別できなかった。
 * シャドーイングが3秒戻し（＝中断）を完走と誤認して周回を加算していた不具合
 * （docs/27 のS-1）の原因はこの契約の曖昧さにある。
 *
 * - `'ended'`: 最後まで再生し切った（`durationMs` 指定時はその長さを再生し切った）
 * - `'interrupted'`: `stop()` または後続の再生呼び出しに打ち切られた
 */
export type PlaybackOutcome = 'ended' | 'interrupted'

/** 再生オプション */
export interface PlayOptions {
  /** 再生開始位置（ミリ秒）。J-5「冒頭だけ再生」特訓用 */
  startMs?: number
  /** 再生継続時間（ミリ秒）。指定時はこの長さで停止する */
  durationMs?: number
  /**
   * 再生速度（0.7〜1.3想定）。T-45でWebAudioPlayerに本実装済み（13の3.7節）。
   * rate!==1.0 のときのみ HTMLAudioElement 経路（playbackRate + preservesPitch）を使う
   * （AudioBufferSourceNode.playbackRate はピッチが変わるため使わない=J-27）。
   * preservesPitch 未対応環境ではピッチが変化しうる（UIに注記を出す）
   */
  rate?: number
  /**
   * 再生中の現在位置（ミリ秒）を通知するコールバック（M2・T-43で追加。
   * シャドーイングのカラオケハイライト用=13の3.7節・3.5節）。実装は100ms間隔程度で
   * 十分（requestAnimationFrame等でも可）。未指定時は呼ばれない（既存呼び出し元は無改修）
   */
  onPosition?: (positionMs: number) => void
}

export interface AudioPlayer {
  /**
   * モバイルブラウザの自動再生制限を解除する（docs/05 8節）。
   * セッション開始のユーザータップ内で1回呼ぶこと。
   */
  unlock(): Promise<void>

  /**
   * 1音源を再生する。再生完了（または stop）で resolve し、
   * どちらだったかを `PlaybackOutcome` で返す。
   * **周回・完了の判定に使う場合は必ず戻り値を見ること**（await の解決だけでは
   * 完走と中断を区別できない）。
   */
  play(src: string, options?: PlayOptions): Promise<PlaybackOutcome>

  /**
   * 複数音源の連結再生（Part2の設問→応答など）。
   * 途中で stop された場合は残りを再生せず `'interrupted'` で resolve する。
   */
  playSequence(srcs: string[], options?: PlayOptions): Promise<PlaybackOutcome>

  /**
   * 直前に再生した音源をもう一度再生する（リプレイ）。
   * 再生対象が無い場合は何も再生せず `'interrupted'` を返す（完走していないため）。
   */
  replay(): Promise<PlaybackOutcome>

  /** 再生を即時停止する */
  stop(): void
}
