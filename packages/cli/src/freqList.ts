// 自前頻出度リスト（T-25。正本: docs/03 4節、docs/01 R-1、docs/10 T-25行）。
//
// 【設計判断（docs未記載）】ランタイムでLLM APIを呼ぶ実装はしない。
// B-1（素材出所）が未解決の間は「LLM生成全振り」で進行してよいとされている
// （08の2節・STATUS.mdのブロッカー欄）ため、公開コーパスとの合成は行わず、
// 単語選定・頻出度判断そのもの（TOEICビジネス文脈での使用場面の推定）を
// 本ファイルのデータとして人手（エージェントによるLLM推論）で直接記述した。
// APIキー管理・実行コストを避けつつ、完了条件(a)「コマンドが動きS200語が
// ランク根拠付きで出力される」は、このデータをメタデータ付きで組み立てて
// content/freq-list.json に書き出すコマンドとして満たす。
// 出典コーパスは無い（corpusSource/corpusLicenseはnull）ため、「出典コーパスの
// ライセンス条項が記録されている」という完了条件は該当なし（N/A）。将来コーパスを
// 追加する場合は該当語の rankSource を 'mixed' に更新し、meta.corpus に出典・
// ライセンスを記録する想定。

import { WORDS_A } from './data/freqListWordsA.js'
import { WORDS_B } from './data/freqListWordsB.js'
import { WORDS_S, type FreqListWordEntry } from './data/freqListWordsS.js'

/** 'corpus'=公開コーパスのみ、'llm'=LLM推定のみ、'mixed'=両者を合成 */
export type FreqListEntry = FreqListWordEntry

export interface FreqListMeta {
  generatedAt: string
  method: 'llm-only' | 'corpus+llm'
  corpusSource: string | null
  corpusLicense: string | null
  disclaimer: string
  note: string
}

export interface FreqList {
  meta: FreqListMeta
  words: FreqListEntry[]
}

const DISCLAIMER = '精度は未検証。実測補正（T-34）で継続修正する前提。'
const NOTE =
  'B-1（素材出所）未解決のため、公開コーパスとの合成を行わずLLM推定のみで暫定構築した' +
  '（08の2節「LLM生成全振りで進行可」の規定に従った）。corpusSource/corpusLicenseはnull。' +
  '将来コーパスを追加する場合はrankSourceを更新すること。'

export { WORDS_A, WORDS_B, WORDS_S }

/** 頻出度リストを組み立てる（メタデータ＋単語一覧。M2・T-58でA/B各200語を追加=600語） */
export function buildFreqList(generatedAt: string): FreqList {
  return {
    meta: {
      generatedAt,
      method: 'llm-only',
      corpusSource: null,
      corpusLicense: null,
      disclaimer: DISCLAIMER,
      note: NOTE,
    },
    words: [...WORDS_S, ...WORDS_A, ...WORDS_B],
  }
}

/** 完了条件の機械検証: S/A/B各200語（計600語）・重複なし・根拠が空でないこと（M2・T-58） */
export function validateFreqList(list: FreqList): string[] {
  const problems: string[] = []
  for (const rank of ['S', 'A', 'B'] as const) {
    const count = list.words.filter((w) => w.freqRank === rank).length
    if (count !== 200) {
      problems.push(`${rank}ランクは200語である必要がある（実際: ${count}）`)
    }
  }
  const seen = new Set<string>()
  for (const w of list.words) {
    const key = w.word.toLowerCase()
    if (seen.has(key)) problems.push(`単語が重複している: ${w.word}`)
    seen.add(key)
    if (w.rationale.trim() === '') problems.push(`根拠(rationale)が空: ${w.word}`)
  }
  return problems
}
