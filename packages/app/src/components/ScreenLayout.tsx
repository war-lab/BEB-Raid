// 縦3分割レイアウトシェル（docs/07 5.1）
// - ステータス帯（表示専用）/ コンテンツ（表示専用）/ 操作ゾーン（画面下 約45%＋セーフエリア）
// - 操作要素は必ず action に置く（親指第一の原則）
import type { ReactNode } from 'react'

interface Props {
  /** 上部ステータス帯（進捗・残数・タイマー等。表示専用） */
  status?: ReactNode
  /** 中央コンテンツ（問題文・音声・カード。表示専用） */
  children: ReactNode
  /** 下部操作ゾーン（解答ボタン・主アクション） */
  action: ReactNode
}

export function ScreenLayout({ status, children, action }: Props) {
  return (
    <div className="screen-layout">
      <header className="screen-layout__status">{status}</header>
      <section className="screen-layout__content">{children}</section>
      <footer className="screen-layout__action">{action}</footer>
    </div>
  )
}
