// レイドダメージ換算（T-89。M3基盤・端末内完結ステップ。正本: docs/03 6.1節、docs/16 T-89行）。
//
// ダメージ＝基礎点×モード係数。係数はdamageConfig.jsonへ外出しし、docs/16 J-47の
// 仮値（{ raid: 1.0, solo: 0.5, srs: 0 }）をそのまま初期値にした（T-87完了時点でも
// 03へのモード係数の正式反映は未承認のため、JSON差し替えだけで調整できる構造を維持する）。
// 'battle'（ゴーストレイドの防御換算=03の6.3）は別式のため対象外とし、
// 係数未定義のmodeは0（ダメージ計装なし）を返す
import type { AttemptMode } from '../db/schema'
import damageConfig from './damageConfig.json'

export type DamageModeConfig = Partial<Record<AttemptMode, number>>

/** 基礎点をレイドダメージへ換算する（03の6.1: ダメージ=基礎点×モード係数） */
export function computeDamage(
  basePoints: number,
  mode: AttemptMode,
  config: DamageModeConfig = damageConfig,
): number {
  const coefficient = config[mode] ?? 0
  return basePoints * coefficient
}
