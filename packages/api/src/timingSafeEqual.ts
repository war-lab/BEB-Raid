// タイミングセーフな文字列比較（正本: docs/30_改修計画_全量レビュー棚卸し.md T-250・29のQ-32）。
//
// 招待コード（register.ts）とadminトークン（adminHandlers.ts）の照合はいずれも
// `!==` による通常比較だった。JS文字列の`!==`は先頭から不一致文字が見つかった時点で
// 比較を打ち切るため、応答時間の差から一致文字数を推測される余地がある
// （タイミング攻撃）。crypto.subtle.timingSafeEqual（Cloudflare WorkersのWeb Crypto拡張）は
// 常に全バイトを比較してから結果を返すため、この差を作らない。
//
// crypto.subtle.timingSafeEqualは長さが異なるバッファを渡すとRangeErrorを投げる
// （Node.jsのcrypto.timingSafeEqualと同じ仕様）。長さの一致・不一致を先に見て
// 短絡するのは一般的な回避策で、招待コード・adminトークンは固定長の秘密値のため、
// 桁数（バイト長）を知られること自体は総当たりの実質的な手掛かりにならない
//
// timingSafeEqualは@cloudflare/workers-typesのSubtleCrypto拡張だが、tsconfigが
// 既定でlib.dom.d.tsも読み込むため（tsconfig.base.jsonがlibを明示的に絞っていない）、
// DOM側のSubtleCrypto interface（timingSafeEqualを持たない）が優先されコンパイルエラーになる。
// 他のWorkers専用グローバルはDOMに同名メンバーが無いため顕在化していなかった、
// このファイル固有の問題。interface宣言のマージでDOM側へメンバーを補う
declare global {
  interface SubtleCrypto {
    timingSafeEqual(a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView): boolean
  }
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder()
  const aBytes = encoder.encode(a)
  const bBytes = encoder.encode(b)
  if (aBytes.byteLength !== bBytes.byteLength) return false
  return crypto.subtle.timingSafeEqual(aBytes, bBytes)
}
