// Part6（text_passage）URL・メールアドレスを含む題材の追加データ（T-273。正本:
// docs/30_改修計画_全量レビュー棚卸し.md 17節「T-273の位置づけ」、docs/24 3.1節・3.6節）。
//
// 【背景】既存の初期在庫（part6PassagesS.ts）を全数走査してもURL・メールアドレスを含む
// 設問が0件だった。実際のTOEIC Part6/7はWebページ・メール・広告を題材とし、URLと
// メールアドレスが頻出するため、既存コンテンツは本試験より題材が狭い。本ファイルは
// その穴を埋める追加セットで、part6PassagesS.ts本体（既存配信パックpack-reading-p6-s-001の
// ソース）は一切変更しない。
//
// 【配信しない（ADR 0006 判断5）】本ファイルは content/drafts/text-passage-p6-url-s.jsonl
// （既存の配信パックとは別の新規ドラフトパス）にのみ出力する。build.ts の PACK_DEFINITIONS
// には登録しない＝人手レビュー（H-R1）を経るまで配信対象外（T-144と同じ「生成側と在庫だけ
// 実装し、配信は保留」の扱い）。
//
// 形式・検証方式はpart6PassagesS.tsと同一（[[1]]〜[[4]]マーカー・rotateTextPassageChoicesに
// よる4択決定的ローテーション・S/A/B語彙カードからのkeyVocab解決）。

import type { PassageKind } from '@beb-raid/shared-schema'
import type { Part6RawEntry } from './part6PassagesS.js'

export const PART6_URL_ENTRIES_S: Part6RawEntry[] = [
  {
    setId: 'p6url-001',
    difficulty: 2,
    tags: ['動詞の形', '接続詞vs前置詞'],
    keyVocabWords: ['confirm', 'password'],
    passageKind: 'email' as PassageKind,
    passageText:
      'Subject: Password Reset Confirmation\n\nDear Team,\n\nAs part of our annual security update, all employees [[1]] required to reset their account passwords by Friday, May 22. To begin, visit the login page at portal.harborcrestlogistics.example.com and click "Forgot Password." A confirmation link will [[2]] to the email address on file within a few minutes. [[3]] the confirmation link does not arrive within ten minutes, please check your spam folder or contact the IT help desk at ithelp@harborcrestlogistics.example.com. [[4]]\n\nThank you for your cooperation.\n\nIT Security Team',
    subQuestions: [
      {
        kind: 'grammar',
        correctText: 'are',
        distractors: ['is', 'was', 'being'],
        explanation:
          '主語all employeesは複数であり、来月までに完了すべき義務を表すbe required to doの現在形が適切。areが正しく、単数扱いのis、過去形was、動詞の原形と組み合わせられないbeingは不適。',
        translation:
          '年次セキュリティ更新の一環として、全従業員は5月22日金曜日までにアカウントのパスワードをリセットする必要があります。',
      },
      {
        kind: 'vocab',
        correctText: 'be sent',
        distractors: ['send', 'sending', 'have sent'],
        explanation:
          '助動詞willの後は動詞の原形が続く。confirmation linkは「送られる」対象なので受動態be sentが適切。sendは能動の原形で主語との整合が取れず、sendingは進行形、have sentは現在完了でwillの直後に続けられない。',
        translation: '確認リンクは数分以内に登録済みのメールアドレスへ送信されます。',
      },
      {
        kind: 'connector',
        correctText: 'If',
        distractors: ['Despite', 'Due to', 'Instead of'],
        explanation:
          '直後に"the confirmation link does not arrive"という主語+動詞の完全な節が続くため、条件を表す接続詞Ifが適切。Despite/Due to/Instead ofはいずれも前置詞（句）で後ろに名詞句を要求し、節を続けられない。',
        translation:
          '確認リンクが10分以内に届かない場合は、迷惑メールフォルダを確認するか、ithelp@harborcrestlogistics.example.com のITヘルプデスクに連絡してください。',
      },
      {
        kind: 'insertion',
        correctText:
          'Employees who do not complete the reset by the deadline will be temporarily locked out of the system.',
        distractors: [
          'The office cafeteria will be closed for renovation next month.',
          'New employee badges will be issued starting next week.',
          'The annual holiday party has been rescheduled to December.',
        ],
        explanation:
          '直前の文で確認リンクが届かない場合の対処を述べており、続けて期限に関するペナルティ（ロックアウト）を伝える文が自然につながる。他の3文はパスワードリセットと無関係。',
        translation:
          '期限までにリセットを完了しない従業員は、一時的にシステムからロックアウトされます。',
      },
    ],
  },
]
