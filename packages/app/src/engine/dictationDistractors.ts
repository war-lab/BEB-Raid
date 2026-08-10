// ディクテーションのダミー語プール（M2・T-47。正本: docs/13 3.4節）。
// 弱形・混同されやすい機能語の静的リスト。他問題のblanks正解語だけでは
// ワードバンクの6語に満たない場合のフォールバックとして使う。
// 【T-341】機能語/内容語のクラス判定（isFunctionWord）にも使うため、
// 実データ（dictationS.ts・dictationS2.ts）のblanks.answerで実際に使われている
// 機能語を漏れなく含める（漏れがあると内容語の穴と誤判定され、ダミーに機能語が
// 混ざってしまう）
export const DICTATION_DISTRACTOR_POOL: readonly string[] = [
  'would',
  'should',
  'could',
  'will',
  'must',
  'can',
  'may',
  'going',
  'used',
  'was',
  'were',
  'is',
  'are',
  'be',
  'been',
  'being',
  'has',
  'have',
  'had',
  'it',
  'they',
  'them',
  'their',
  'there',
  'your',
  'her',
  'for',
  'from',
  'to',
  'too',
  'of',
  'with',
  'within',
  'against',
  'before',
  'by',
  'because',
  'if',
  'than',
  'that',
  'this',
  'these',
  'those',
  'and',
  'every',
  'a',
  'an',
  'the',
  'in',
  'on',
  'at',
]

/**
 * 内容語の穴のダミー語プール（T-341。K-79の再発防止で内容語の穴を導入する際に追加）。
 * 機能語プールと語彙的に重ならない、業務・オフィス文脈の一般的な名詞・動詞。
 * 特定のkeyVocabWordと一致してもヒントにならないよう、汎用的な語のみを選ぶ
 */
export const DICTATION_CONTENT_DISTRACTOR_POOL: readonly string[] = [
  'shipment',
  'invoice',
  'contract',
  'budget',
  'schedule',
  'meeting',
  'report',
  'delivery',
  'payment',
  'account',
  'document',
  'proposal',
  'inventory',
  'vendor',
  'client',
  'warehouse',
]
