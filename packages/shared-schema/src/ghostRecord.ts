// ゴースト記録送信ペイロードの構築（M4・T-123。正本: docs/22 3.1節・3.3節、docs/21 J-67）。
// GhostRecordPayload.consent は型レベルで既にリテラル true に固定されているが、
// 呼び出し側が同意画面の確認を経ずに `{ consent: true }` を直書きしてしまう実装ミスを
// 防ぐため、ビルダー関数側でも同意結果（boolean）を明示的な引数として要求し、
// 未同意（false）なら例外を投げる。questionStatsのdeviceToken非構造化（型のみでの強制）と
// 違い、こちらは「同意という事実」を型だけでは表現しきれないため、型＋実行時の両面で強制する

import type { GhostRecordEntry, GhostRecordPayload } from './types.js'

export interface GhostRecordPayloadInput {
  displayName: string
  records: GhostRecordEntry[]
}

/** GhostRecordPayloadのホワイトリスト（このキー以外を持たせない） */
export const GHOST_RECORD_PAYLOAD_KEYS: readonly (keyof GhostRecordPayload)[] = [
  'consent',
  'displayName',
  'records',
]

/**
 * 同意画面の確認結果（consented）を引数に取り、未同意なら例外を投げる。
 * 同意済み（true）の場合のみ consent: true のGhostRecordPayloadを構築できる
 */
export function buildGhostRecordPayload(
  consented: boolean,
  input: GhostRecordPayloadInput,
): GhostRecordPayload {
  if (!consented) {
    throw new Error('ボス役の同意なしにGhostRecordPayloadは構築できません')
  }
  return {
    consent: true,
    displayName: input.displayName,
    records: input.records,
  }
}

// ---------------------------------------------------------------------------
// 型レベルの構造的強制検証（docs/22 T-123完了条件②）。
// vitest（esbuild変換）は型検査をしないため .test.ts 内の @ts-expect-error は検証されない。
// ここでは実行時コストゼロの型のみの等価判定を書き、`npm run build`（tsc）が
// GhostRecordPayload.consent を boolean へ広げる変更を検出できるようにする
// （型が壊れたら本ファイルの型検査自体が失敗し、ビルドが落ちる）
// ---------------------------------------------------------------------------

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T

// consent は boolean ではなく true 固定リテラルでなければならない
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 型検査のみが目的で参照されない
type _ConsentIsLiteralTrueNotBoolean = Expect<Equal<GhostRecordPayload['consent'], true>>
