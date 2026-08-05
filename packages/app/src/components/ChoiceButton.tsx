// 選択肢ボタン A–D（docs/07 6節）
// - --surface地＋--line枠、左端に丸囲みの選択肢記号
// - 状態: 通常 / 正解（--ok枠＋✓）/ 誤答（--ng枠＋✕）/ 減光（他選択肢）
// - 正誤表示時もレイアウトを動かさない: 枠は常に同じ太さで色だけ変え、
//   右端のアイコン枠は常時確保しておく（色＋アイコンの二重符号化。07 原則4）
import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ChoiceState = 'idle' | 'correct' | 'wrong' | 'dimmed'

/**
 * 選択肢記号A–Dと形マーカー（▲■●◆）の対応（docs/07 7節S7/S8・docs/25 4.4節）。
 * S7参加者画面（このコンポーネント）とS8ホスト画面（BattleHostScreen）が同じ表を参照するため、
 * 手元と投影で同じ形が同じ選択肢に付くことがコード上一意に決まる。
 * イベントバトル専用（JV-7=案B）で、ソロ学習の選択肢は記号A–Dのまま使う
 */
export const CHOICE_SHAPE_MARKERS: Record<string, string> = {
  A: '▲',
  B: '■',
  C: '●',
  D: '◆',
}

/** 選択肢記号に対応する形マーカー。A–D以外（想定外のキー）は形を持たない */
export function choiceShapeMarker(key: string): string | null {
  return CHOICE_SHAPE_MARKERS[key] ?? null
}

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** 選択肢記号（A/B/C/D） */
  marker: string
  /** 選択肢本文 */
  children: ReactNode
  state?: ChoiceState
  /**
   * マーカーの見せ方。既定は記号（A–D）で、ソロ学習の全ドリル画面はこれを使う
   * （TOEIC本試験の記号との一致を崩さない）。'shape' はイベントバトル専用で、
   * 記号を形マーカーに置き換えてホスト画面の投影と対応付ける（JV-7=案B）
   */
  markerVariant?: 'symbol' | 'shape'
}

const STATE_ICON: Record<ChoiceState, string> = {
  idle: '',
  correct: '✓',
  wrong: '✕',
  dimmed: '',
}

export function ChoiceButton({
  marker,
  children,
  state = 'idle',
  markerVariant = 'symbol',
  className,
  ...rest
}: Props) {
  const icon = STATE_ICON[state]
  // 形マーカーは対応表にあるキーのときだけ有効にする（未知のキーは記号表示のまま落とす）
  const shape = markerVariant === 'shape' ? choiceShapeMarker(marker) : null
  return (
    <button
      type="button"
      className={`choice-button is-${state} ${className ?? ''}`}
      data-state={state}
      // 形マーカーの色分けはこの2属性を起点にCSSで当てる（既定の記号表示には付けない）
      data-marker-variant={shape === null ? undefined : 'shape'}
      data-choice-key={shape === null ? undefined : marker}
      {...rest}
    >
      <span
        className={`choice-button__marker${shape === null ? '' : ' is-shape'}`}
        aria-hidden="true"
      >
        {shape ?? marker}
      </span>
      {/* 形は装飾（aria-hidden）なので、支援技術には選択肢記号を文字で伝える。
          記号表示のときはマーカーの文字がそのまま見えているため補わない */}
      {shape !== null && <span className="visually-hidden">選択肢{marker}</span>}
      <span className="choice-button__label">{children}</span>
      {/* アイコン枠は常時確保（状態変化でレイアウトを動かさないため） */}
      <span className="choice-button__icon" aria-hidden={icon === ''}>
        {icon}
      </span>
      {/* スクリーンリーダー向けの状態読み上げ（色に依存しない）。T-231(Q-69): role="status"
          （暗黙のaria-live="polite"）を付け、解答直後にDOM挿入されたタイミングで自動読み上げ
          させる。role="status"はDrillScreenのスキップ・取り消し通知と同じ既存パターン */}
      {state === 'correct' && (
        <span className="visually-hidden" role="status">
          （正解）
        </span>
      )}
      {state === 'wrong' && (
        <span className="visually-hidden" role="status">
          （誤答）
        </span>
      )}
    </button>
  )
}
