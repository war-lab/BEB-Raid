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
  /**
   * コンテンツ帯の縦位置（既定 'start'=従来どおり上寄せ）。
   * 'center' はコンテンツが帯より短いときだけ中央へ寄せる（溢れたら上寄せに戻る）。
   * docs/26 A-1: 中身が固定量で短い画面（語彙の仕分けカード・シャドーイングの原稿）は
   * 上寄せだと帯の下半分が空く。**操作ゾーンの中身が解答前後で変わる画面には付けない**
   * （ドリル・読解・イベントバトルは解説カードの出現でコンテンツ位置が動き、07の
   * 「正誤フィードバックでレイアウトを動かさない」に反するため）。
   */
  align?: 'start' | 'center'
}

export function ScreenLayout({ status, children, action, align = 'start' }: Props) {
  return (
    <div className="screen-layout">
      <header className="screen-layout__status">{status}</header>
      <section
        className={
          align === 'center'
            ? 'screen-layout__content screen-layout__content--center'
            : 'screen-layout__content'
        }
      >
        {align === 'center' ? <div className="screen-layout__center">{children}</div> : children}
      </section>
      <footer className="screen-layout__action">{action}</footer>
    </div>
  )
}
