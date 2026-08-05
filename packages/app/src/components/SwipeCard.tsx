// スワイプカード（docs/07 6節: 右=知ってる／左=知らない。左右対称なので利き手設定は不要）。
// Pointer Events で左右のみ判定し、縦方向優勢のドラッグ（＝縦スクロール操作）は無視する。
import { useRef, useState, type PointerEvent, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  onSwipeRight: () => void
  onSwipeLeft: () => void
}

/** これ未満の横移動はスワイプとみなさない（誤操作防止） */
const SWIPE_THRESHOLD_PX = 80
/** |縦移動| がこの倍率を超えたら縦スクロール操作とみなし無視する */
const MAX_VERTICAL_RATIO = 0.6

export function SwipeCard({ children, onSwipeRight, onSwipeLeft }: Props) {
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const [dragX, setDragX] = useState(0)

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    startRef.current = { x: e.clientX, y: e.clientY }
    // T-209（Q-47）: キャプチャせずにいると、揺れる車内で指がカード外へ出て離した際に
    // pointerupがカードへ届かず、カードが途中位置（translateX固定）で固まる、または
    // スワイプが不成立になる。ポインタを明示的にキャプチャし、カード外で離れても
    // pointermove/pointerup/pointercancelを確実にこの要素で受け取れるようにする。
    // 未対応環境（jsdom等）でも落ちないようoptional chainingで呼ぶ
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!startRef.current) return
    setDragX(e.clientX - startRef.current.x)
  }

  function endDrag(e: PointerEvent<HTMLDivElement>) {
    const start = startRef.current
    startRef.current = null
    setDragX(0)
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return
    if (Math.abs(dy) > Math.abs(dx) * MAX_VERTICAL_RATIO) return // 縦優勢は無視
    if (dx > 0) onSwipeRight()
    else onSwipeLeft()
  }

  return (
    <div
      className="swipe-card"
      style={{ transform: dragX !== 0 ? `translateX(${dragX}px)` : undefined }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={() => {
        startRef.current = null
        setDragX(0)
      }}
    >
      {dragX > 20 && (
        <span className="swipe-card__icon swipe-card__icon--right" aria-hidden="true">
          ✓
        </span>
      )}
      {dragX < -20 && (
        <span className="swipe-card__icon swipe-card__icon--left" aria-hidden="true">
          ✕
        </span>
      )}
      {children}
    </div>
  )
}
