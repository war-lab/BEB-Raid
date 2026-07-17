// 週次レイドボスの静的プロファイル（正本: docs/17_M3実装計画.md 3.4節）。
// content層（public repo）ではなくpackages/api内に置く（ボスの中身は「HP＋名前」のみで
// 個人情報を含まないため公開して問題ないが、パックビルドの対象外という区分の明確化のため）。
// 週番号mod 10で決定的にローテーションする（同じ週なら誰から見ても同じボスになる）

export interface BossProfile {
  name: string
  flavor: string
}

export const BOSS_PROFILES: readonly BossProfile[] = [
  {
    name: 'アカウンタブル・アカウンタント',
    flavor: '締め日前の経理部から現れた、数字に厳しい影。',
  },
  { name: 'サイレント・ネゴシエーター', flavor: '無言の圧力で価格交渉を有利に進める謎の交渉人。' },
  { name: 'オーバーブッキング・コンシェルジュ', flavor: '予約を詰め込みすぎたホテルの守護者。' },
  { name: 'デッドライン・レイダー', flavor: '納期直前にだけ姿を現す、締め切りの化身。' },
  { name: 'コンプライアンス・センチネル', flavor: '規約違反を絶対に見逃さない監査の番人。' },
  { name: 'マーケティング・ファントム', flavor: '広告費だけを吸い取って消える幻の担当者。' },
  { name: 'サプライチェーン・リヴァイアサン', flavor: '在庫と物流を支配する巨大な流通の主。' },
  { name: 'インボイス・ウォッチャー', flavor: '請求書の誤字を1文字も逃さない検品の目。' },
  { name: 'リロケーション・ワンダラー', flavor: '転勤の辞令とともに現れる放浪の管理職。' },
  { name: 'クォーター・エンド・タイタン', flavor: '四半期末にのみ目を覚ます巨人。' },
]

export function bossProfileForWeek(isoWeekNumber: number): BossProfile {
  const profile = BOSS_PROFILES[isoWeekNumber % BOSS_PROFILES.length]
  if (!profile) throw new Error('BOSS_PROFILESが空です')
  return profile
}
