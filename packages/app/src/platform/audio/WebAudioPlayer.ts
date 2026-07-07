// AudioPlayer の Web 実装（骨格）。
// M1の本実装（セッション開始タップでの AudioContext 解放＋Web Audio 連結再生、
// iOS Safari の自動再生制限対策）は T-15 で行う。ここでは HTMLAudioElement による
// 最小動作の骨格を置き、インターフェース境界を確定させることが目的。

import type { AudioPlayer, PlayOptions } from './AudioPlayer'

/** テスト用に Audio 要素の生成を差し替え可能にする */
export type AudioElementFactory = (src: string) => HTMLAudioElement

export class WebAudioPlayer implements AudioPlayer {
  private current: HTMLAudioElement | null = null
  private lastSrcs: string[] = []
  private lastOptions: PlayOptions | undefined
  private stopped = false

  constructor(private readonly createAudio: AudioElementFactory = (src) => new Audio(src)) {}

  async unlock(): Promise<void> {
    // T-15: ユーザータップ内で AudioContext を resume する。骨格では何もしない
  }

  async play(src: string, options?: PlayOptions): Promise<void> {
    this.lastSrcs = [src]
    this.lastOptions = options
    await this.playOne(src, options)
  }

  async playSequence(srcs: string[], options?: PlayOptions): Promise<void> {
    this.lastSrcs = [...srcs]
    this.lastOptions = options
    this.stopped = false
    for (const src of srcs) {
      if (this.stopped) return
      await this.playOne(src, options)
    }
  }

  async replay(): Promise<void> {
    if (this.lastSrcs.length === 0) return
    if (this.lastSrcs.length === 1) {
      await this.playOne(this.lastSrcs[0]!, this.lastOptions)
    } else {
      await this.playSequence(this.lastSrcs, this.lastOptions)
    }
  }

  stop(): void {
    this.stopped = true
    if (this.current) {
      this.current.pause()
      // pause では ended が発火しないため、待機中の Promise を解放する
      this.current.dispatchEvent(new Event('ended'))
      this.current = null
    }
  }

  private playOne(src: string, options?: PlayOptions): Promise<void> {
    this.stopped = false
    return new Promise((resolve, reject) => {
      const audio = this.createAudio(src)
      this.current = audio
      // options.rate は予約のみ（J-6）。M1では適用しない

      if (options?.startMs !== undefined) {
        audio.currentTime = options.startMs / 1000
      }
      let timer: ReturnType<typeof setTimeout> | undefined
      const finish = () => {
        if (timer !== undefined) clearTimeout(timer)
        audio.removeEventListener('ended', finish)
        if (this.current === audio) this.current = null
        resolve()
      }
      audio.addEventListener('ended', finish)
      audio.addEventListener('error', () => reject(new Error(`音声の再生に失敗: ${src}`)), {
        once: true,
      })
      const started = audio.play()
      // durationMs 指定時は部分再生（J-5 冒頭再生）
      if (options?.durationMs !== undefined) {
        timer = setTimeout(() => {
          audio.pause()
          finish()
        }, options.durationMs)
      }
      // 自動再生制限などで play() が拒否された場合
      if (started) started.catch(reject)
    })
  }
}
