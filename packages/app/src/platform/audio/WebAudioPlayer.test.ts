import { describe, expect, it } from 'vitest'
import { WebAudioPlayer } from './WebAudioPlayer'

// HTMLAudioElement の最小フェイク（jsdom の media 実装は play() が未実装のため）
class FakeAudio extends EventTarget {
  currentTime = 0
  paused = false
  constructor(public src: string) {
    super()
  }
  play() {
    this.paused = false
    return Promise.resolve()
  }
  pause() {
    this.paused = true
  }
  end() {
    this.dispatchEvent(new Event('ended'))
  }
}

function createPlayer() {
  const created: FakeAudio[] = []
  const player = new WebAudioPlayer((src) => {
    const audio = new FakeAudio(src)
    created.push(audio)
    return audio as unknown as HTMLAudioElement
  })
  return { player, created }
}

/** マイクロタスクを進める */
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('WebAudioPlayer（骨格）', () => {
  it('playSequence は前の音源の終了を待って順に連結再生する', async () => {
    const { player, created } = createPlayer()
    const done = player.playSequence(['a.mp3', 'b.mp3'])

    await tick()
    expect(created.map((a) => a.src)).toEqual(['a.mp3']) // b はまだ作られない
    created[0]!.end()

    await tick()
    expect(created.map((a) => a.src)).toEqual(['a.mp3', 'b.mp3'])
    created[1]!.end()

    await expect(done).resolves.toBeUndefined()
  })

  it('stop で連結再生の残りを打ち切る', async () => {
    const { player, created } = createPlayer()
    const done = player.playSequence(['a.mp3', 'b.mp3'])

    await tick()
    player.stop()
    await expect(done).resolves.toBeUndefined()
    // b.mp3 は再生されない
    expect(created.map((a) => a.src)).toEqual(['a.mp3'])
    expect(created[0]!.paused).toBe(true)
  })

  it('startMs 指定で再生開始位置が変わる（J-5 冒頭再生の基盤）', async () => {
    const { player, created } = createPlayer()
    const done = player.play('a.mp3', { startMs: 1500 })
    await tick()
    expect(created[0]!.currentTime).toBe(1.5)
    created[0]!.end()
    await done
  })

  it('replay は直前の音源をもう一度再生する', async () => {
    const { player, created } = createPlayer()
    const first = player.play('a.mp3')
    await tick()
    created[0]!.end()
    await first

    const second = player.replay()
    await tick()
    expect(created.map((a) => a.src)).toEqual(['a.mp3', 'a.mp3'])
    created[1]!.end()
    await second
  })
})
