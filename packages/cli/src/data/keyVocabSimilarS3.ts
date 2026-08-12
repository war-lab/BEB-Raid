// key単語類題追加分その2のデータ本体（T-83。正本: docs/15 T-83行、docs/14 3.3節、J-44）。
//
// 対象語の選定（J-44の優先順）: keyVocab 271語のうち「q1」（類題ゼロ＝全corpus中で
// その語を含む問題が1件しか存在しない語）189語から120語を、①Sランクkeyvocab
// （freqListWordsS.tsに含まれる語）→②Part2/Part5に出現するq1語（Sランク以外）→
// ③その他、の優先順で機械的に選定した（2026-07-16時点の実測。docs/14執筆時点の184語から
// 実数値が動いているのは、T-61/T-62等その後のコンテンツ増産でkeyVocab語彙の母集団自体が
// 増減したため）。既存のkeyVocabSimilarS/S2が「1語につき3問」だったのに対し、本ファイルは
// 「120語×1問」でカバー語数を最大化する方針（J-44）。
//
// ディストラクタ方針（14の3.5「同ドメイン・同品詞」ガイド）: 正解と同じ品詞
// （名詞なら名詞、動詞なら動詞）かつ同じ意味領域（ビジネス/HR/IT/法務等）の語を選び、
// 文法的には全選択肢が文に当てはまるが意味的には正解以外すべて不自然、という状態を作る。
// 無関係な領域の語（例: 動詞の穴に食べ物の名詞を入れる等）は識別が容易すぎるため避ける。
//
// 正答位置はindex（配列内の通し番号）%4でA/B/C/Dへ機械的にローテーションする
// （M1レビュー⑦と同方式。著者は正答を書く位置を気にしない）。
//
// 【後日修正】初稿ビルド時、contentLintのcheckTextBlankLength（difficulty3以上のtext_blankは
// 本文12語以上を目安）で87件が警告対象だったため、本文を自然な修飾句・従属節で12語以上に
// 拡張し、translationも拡張後の内容に合わせて書き直した（正答語・ディストラクタ・explanationは
// 変更していない）。

export interface KeyVocabSimilarS3RawEntry {
  word: string
  tags: string[]
  question: string
  /** 正解の選択肢テキスト（rotateでA〜Dのいずれかに配置される） */
  correctText: string
  /** 誤答3件（同ドメイン・同品詞） */
  distractors: readonly [string, string, string]
  explanation: string
  translation: string
  difficulty: number
}

export const KEY_VOCAB_SIMILAR_S3_RAW: KeyVocabSimilarS3RawEntry[] = [
  {
    word: 'delivery',
    tags: ['ビジネス名詞'],
    question: 'The ___ of the new equipment was delayed by a week.',
    correctText: 'delivery',
    distractors: ['renewal', 'warranty', 'inspection'],
    explanation:
      '機材が届く行為はdelivery（配達）。renewal（更新）・warranty（保証）・inspection（検査）はいずれも「届くこと」自体を指さない。',
    translation: '新しい機材の配達は1週間遅れた。',
    difficulty: 2,
  },
  {
    word: 'venue',
    tags: ['ビジネス名詞'],
    question: "They booked a larger ___ for this year's conference.",
    correctText: 'venue',
    distractors: ['itinerary', 'agenda', 'brochure'],
    explanation:
      '会議を開く「会場」はvenue。itinerary（旅程表）・agenda（議題）・brochure（パンフレット）はいずれも場所を表さない。',
    translation: '彼らは今年の会議のためにより大きな会場を予約した。',
    difficulty: 2,
  },
  {
    word: 'training',
    tags: ['ビジネス名詞'],
    question: 'All new hires must complete safety ___ before starting work.',
    correctText: 'training',
    distractors: ['qualification', 'certification', 'orientation'],
    explanation:
      '業務前に受ける安全「研修」はtraining。qualification（資格）・certification（認定）・orientation（オリエンテーション）は研修そのものではない。',
    translation: '新入社員は全員、業務開始前に安全研修を修了しなければならない。',
    difficulty: 2,
  },
  {
    word: 'headquarters',
    tags: ['ビジネス名詞'],
    question: 'The company moved its ___ to a bigger building downtown.',
    correctText: 'headquarters',
    distractors: ['branch', 'warehouse', 'premises'],
    explanation:
      '「本社」はheadquarters。branch（支店）・warehouse（倉庫）・premises（構内、一般名詞）は本社機能そのものを指さない。',
    translation: 'その会社は本社を中心街のより大きなビルに移転した。',
    difficulty: 2,
  },
  {
    word: 'reception',
    tags: ['ビジネス名詞'],
    question:
      'Please leave your bag at the ___ desk when you arrive at our office for the interview.',
    correctText: 'reception',
    distractors: ['checkpoint', 'gateway', 'concierge'],
    explanation:
      '来客対応の「受付」はreception。checkpoint（検問所）・gateway（玄関口）は受付デスクの名称として不自然。concierge（コンシェルジュ）はホテル等の接客係を指す語で、一般的な会社の受付には使わない（2026-08-07訂正・T-342・K-80: 旧設問は場面が曖昧で"concierge desk"というホテル用語とも解釈でき二重正答の疑いがあったため、面接で訪れる一般オフィスという場面を明示した）。',
    translation: '面接のため当社オフィスにいらっしゃる際は、かばんを受付のデスクに預けてください。',
    difficulty: 2,
  },
  {
    word: 'audit',
    tags: ['ビジネス名詞'],
    question: 'The finance team is preparing for the annual ___ that begins next Monday.',
    correctText: 'audit',
    distractors: ['reconciliation', 'appraisal', 'inspection'],
    explanation:
      '財務の「監査」はaudit。reconciliation（照合）・appraisal（人事評価）・inspection（検査）は監査という制度そのものを指す語ではない。',
    translation: '経理チームは来週月曜日に始まる年次監査の準備をしている。',
    difficulty: 3,
  },
  {
    word: 'estate',
    tags: ['ビジネス名詞'],
    question: 'The company hired a local ___ agent to help find office space downtown.',
    correctText: 'estate',
    distractors: ['venue', 'facility', 'premises'],
    explanation:
      '不動産業者を表す"estate agent"（不動産仲介業者）は定番表現。venue（会場）・facility（施設）・premises（構内）はagentと結びつく業種を表さない（2026-08-07訂正・T-342・K-80: 旧設問"a large real ___"は空所前のrealに固定され、estate以外を入れると非文になる欠陥があった）。',
    translation:
      'その会社は、中心街でオフィススペースを見つけるのを手伝ってもらうため、地元の不動産仲介業者を雇った。',
    difficulty: 3,
  },
  {
    word: 'utility',
    tags: ['ビジネス名詞'],
    question: 'The rent includes water, but tenants must pay their own ___ bills separately.',
    correctText: 'utility',
    distractors: ['mortgage', 'warranty', 'subscription'],
    explanation:
      '電気・ガス等の「公共料金」はutility。mortgage（住宅ローン）・warranty（保証）・subscription（定期購読）は請求書の種類として文脈に合わない。',
    translation: '家賃には水道代が含まれるが、入居者は自分で公共料金を別途支払わなければならない。',
    difficulty: 3,
  },
  {
    word: 'catering',
    tags: ['ビジネス名詞'],
    question: 'We hired a local ___ company for the retirement party.',
    correctText: 'catering',
    distractors: ['hospitality', 'concierge', 'courier'],
    explanation:
      '料理を提供する「ケータリング」業はcatering company。hospitality（もてなし、業界全般）・concierge（コンシェルジュ）・courier（宅配業者）は業種として合わない。',
    translation: '私たちは退職パーティーのために地元のケータリング会社を雇った。',
    difficulty: 2,
  },
  {
    word: 'occupant',
    tags: ['ビジネス名詞'],
    question: 'Every ___ of the building must sign the new safety policy by Friday.',
    correctText: 'occupant',
    distractors: ['applicant', 'candidate', 'shareholder'],
    explanation:
      '建物に「入居している人」はoccupant。applicant（応募者）・candidate（候補者）・shareholder（株主）はその建物にいる人を指すとは限らない。',
    translation: 'その建物の入居者は全員、金曜日までに新しい安全方針に署名しなければならない。',
    difficulty: 3,
  },
  {
    word: 'freight',
    tags: ['ビジネス名詞'],
    question: 'The ___ was delayed at the port due to a customs issue.',
    correctText: 'freight',
    distractors: ['merchandise', 'inventory', 'consignment'],
    explanation:
      '船舶・航空で運ばれる「貨物」はfreight。merchandise（商品）・inventory（在庫）・consignment（委託荷物）は輸送中の貨物そのものを指す一般語としては不自然。',
    translation: 'その貨物は通関の問題で港に足止めされた。',
    difficulty: 3,
  },
  {
    word: 'outsource',
    tags: ['頻出動詞'],
    question: 'The firm decided to ___ its customer support to another company last year.',
    correctText: 'outsource',
    distractors: ['allocate', 'delegate', 'authorize'],
    explanation:
      '業務を外部の会社に「委託する」はoutsource。allocate（割り当てる）・delegate（社内の人に委任する）・authorize（承認する）は「外部委託」という意味を持たない。',
    translation: 'その会社は昨年、顧客サポートを他社に外部委託することにした。',
    difficulty: 3,
  },
  {
    word: 'stakeholder',
    tags: ['ビジネス名詞'],
    question: 'Every ___ was invited to review the new proposal before the board meeting.',
    correctText: 'stakeholder',
    distractors: ['applicant', 'competitor', 'occupant'],
    explanation:
      '事業に利害を持つ「利害関係者」はstakeholder。applicant（応募者）・competitor（競合他社）・occupant（入居者）は提案を確認する立場として文脈に合わない。',
    translation: 'すべての利害関係者が、取締役会の前に新しい提案を確認するよう招待された。',
    difficulty: 3,
  },
  {
    word: 'facility',
    tags: ['ビジネス名詞'],
    question: 'The new manufacturing ___ will open next spring.',
    correctText: 'facility',
    distractors: ['estate', 'premises', 'venue'],
    explanation:
      '生産のための「施設」はfacility。estate（地所）・premises（構内、単体では工場全体を指さない）・venue（会場）は製造拠点を表す語として不自然。',
    translation: '新しい製造施設は来春オープンする。',
    difficulty: 2,
  },
  {
    word: 'lease',
    tags: ['ビジネス名詞'],
    question: 'The company signed a five-year ___ for the office space downtown last month.',
    correctText: 'lease',
    distractors: ['warranty', 'mortgage', 'voucher'],
    explanation:
      '不動産の「賃貸借契約」はlease。warranty（保証）・mortgage（住宅ローン）・voucher（引換券）は賃貸契約の種類として合わない。',
    translation: 'その会社は先月、中心街のオフィススペースについて5年間の賃貸契約を結んだ。',
    difficulty: 3,
  },
  {
    word: 'defect',
    tags: ['ビジネス名詞'],
    question: 'The inspector found a small ___ in the packaging during the final review.',
    correctText: 'defect',
    distractors: ['malfunction', 'shortage', 'dispute'],
    explanation:
      '製品の「欠陥」はdefect。malfunction（機械の不具合。梱包には使いにくい）・shortage（不足）・dispute（紛争）は梱包の状態を表す語として合わない。',
    translation: '検査官は最終確認の際、梱包に小さな欠陥を見つけた。',
    difficulty: 3,
  },
  {
    word: 'branch',
    tags: ['ビジネス名詞'],
    question: 'The bank opened a new ___ in the shopping district.',
    correctText: 'branch',
    distractors: ['headquarters', 'facility', 'premises'],
    explanation:
      '本社に対する「支店」はbranch。headquarters（本社）・facility（施設）・premises（構内）は「支店」という意味を持たない。',
    translation: 'その銀行は商業地区に新しい支店を開いた。',
    difficulty: 2,
  },
  {
    word: 'reimbursement',
    tags: ['ビジネス名詞'],
    question:
      'Employees can request ___ for approved travel expenses within thirty days of the trip.',
    correctText: 'reimbursement',
    distractors: ['subscription', 'voucher', 'mortgage'],
    explanation:
      '立て替えた経費の「払い戻し」はreimbursement。subscription（定期購読）・voucher（引換券）・mortgage（住宅ローン）は経費精算の種類として合わない。',
    translation:
      '従業員は出張から30日以内であれば、承認された出張経費について払い戻しを請求できる。',
    difficulty: 3,
  },
  {
    word: 'troubleshoot',
    tags: ['頻出動詞'],
    question: 'The technician was called in to ___ the network issue late last night.',
    correctText: 'troubleshoot',
    distractors: ['authorize', 'delegate', 'allocate'],
    explanation:
      '不具合の原因を調べて「解決する」はtroubleshoot。authorize（承認する）・delegate（委任する）・allocate（割り当てる）は問題解決の行為を意味しない。',
    translation: 'その技術者は昨夜遅く、ネットワークの問題を解決するために呼ばれた。',
    difficulty: 3,
  },
  {
    word: 'password',
    tags: ['ビジネス名詞'],
    question: 'You must change your ___ every ninety days.',
    correctText: 'password',
    distractors: ['firewall', 'protocol', 'encryption'],
    explanation:
      '個人が設定する「パスワード」はpassword。firewall（ファイアウォール）・protocol（通信規約）・encryption（暗号化）はいずれもユーザーが定期的に変更するものではない。',
    translation: 'パスワードは90日ごとに変更しなければならない。',
    difficulty: 2,
  },
  {
    word: 'allocate',
    tags: ['頻出動詞'],
    question:
      'The manager will ___ the budget across three departments before the fiscal year ends.',
    correctText: 'allocate',
    distractors: ['authorize', 'comply', 'ratify'],
    explanation:
      '予算などを「割り当てる」はallocate。authorize（承認する）・comply（従う）・ratify（批准する）は配分の意味を持たない。',
    translation: '部長は会計年度が終わる前に、3つの部署に予算を割り当てる予定だ。',
    difficulty: 3,
  },
  {
    word: 'newsletter',
    tags: ['ビジネス名詞'],
    question: 'The HR department sends a monthly ___ to all staff.',
    correctText: 'newsletter',
    distractors: ['brochure', 'itinerary', 'correspondence'],
    explanation:
      '定期的に配布する「社内報」はnewsletter。brochure（パンフレット）・itinerary（旅程表）・correspondence（文書のやり取り全般）は月刊の社内向け通信を指さない。',
    translation: '人事部は毎月、全社員に社内報を送っている。',
    difficulty: 2,
  },
  {
    word: 'attend',
    tags: ['頻出動詞'],
    question: 'All managers are required to ___ the quarterly meeting.',
    correctText: 'attend',
    distractors: ['authorize', 'comply', 'delegate'],
    explanation:
      '会議に「出席する」はattend。authorize（承認する）・comply（従う）・delegate（委任する）は出席するという意味を持たない。',
    translation: '管理職は全員、四半期会議に出席することが求められている。',
    difficulty: 2,
  },
  {
    word: 'approve',
    tags: ['頻出動詞'],
    question: 'The director must ___ all expense reports over $500.',
    correctText: 'approve',
    distractors: ['comply', 'delegate', 'notify'],
    explanation:
      '申請などを「承認する」はapprove。comply（従う）・delegate（委任する）・notify（通知する）は承認そのものの意味を持たない。',
    translation: '部長は500ドルを超える経費報告書をすべて承認しなければならない。',
    difficulty: 2,
  },
  {
    word: 'authorize',
    tags: ['頻出動詞'],
    question:
      'Only the finance manager can ___ payments above $10,000 without additional approval.',
    correctText: 'authorize',
    distractors: ['comply', 'delegate', 'notify'],
    explanation:
      '権限を持って「承認する」はauthorize。comply（従う）・delegate（委任する）・notify（通知する）は承認権限を行使する意味を持たない。',
    translation: '経理部長だけが、追加の承認なしに1万ドルを超える支払いを承認できる。',
    difficulty: 3,
  },
  {
    word: 'implement',
    tags: ['頻出動詞'],
    question: 'The company plans to ___ a new safety policy at all its factories next month.',
    correctText: 'implement',
    distractors: ['comply', 'ratify', 'allocate'],
    explanation:
      '方針などを「実施する」はimplement。comply（従う）・ratify（批准する）・allocate（割り当てる）は制度を導入する意味を持たない。',
    translation: 'その会社は来月、すべての工場で新しい安全方針を実施する予定だ。',
    difficulty: 3,
  },
  {
    word: 'comply',
    tags: ['頻出動詞'],
    question: 'All vendors must ___ with the new packaging regulation starting next quarter.',
    correctText: 'comply',
    distractors: ['authorize', 'delegate', 'ratify'],
    explanation:
      '規則に「従う」はcomply（with）。authorize（承認する）・delegate（委任する）・ratify（批准する）は規則遵守の意味を持たない。',
    translation: 'すべての業者は来四半期から、新しい梱包規制に従わなければならない。',
    difficulty: 3,
  },
  {
    word: 'delegate',
    tags: ['頻出動詞'],
    question: 'The CEO decided to ___ daily operations to the vice president last week.',
    correctText: 'delegate',
    distractors: ['authorize', 'comply', 'notify'],
    explanation:
      '業務を部下に「委任する」はdelegate。authorize（承認する）・comply（従う）・notify（通知する）は権限移譲の意味を持たない。',
    translation: 'CEOは先週、日常業務を副社長に委任することにした。',
    difficulty: 3,
  },
  {
    word: 'prioritize',
    tags: ['頻出動詞'],
    question: 'The team was asked to ___ customer complaints over routine tasks this week.',
    correctText: 'prioritize',
    distractors: ['allocate', 'delegate', 'coordinate'],
    explanation:
      '物事に「優先順位をつける」はprioritize。allocate（割り当てる）・delegate（委任する）・coordinate（調整する）は優先順位づけの意味を持たない。',
    translation: 'チームは今週、定型業務よりも顧客の苦情対応を優先するよう求められた。',
    difficulty: 3,
  },
  {
    word: 'coordinate',
    tags: ['頻出動詞'],
    question: 'She will ___ the schedules of all department heads for the annual retreat.',
    correctText: 'coordinate',
    distractors: ['supervise', 'oversee', 'delegate'],
    explanation:
      '複数の予定を「調整する」はcoordinate。supervise（監督する）・oversee（統括する）・delegate（委任する）はスケジュール同士をすり合わせる意味を持たない。',
    translation: '彼女は年次合宿のため、全部門長のスケジュールを調整する予定だ。',
    difficulty: 3,
  },
  {
    word: 'supervise',
    tags: ['頻出動詞'],
    question: 'A senior technician will ___ the new interns throughout their first three months.',
    correctText: 'supervise',
    distractors: ['oversee', 'coordinate', 'recruit'],
    explanation:
      '人を直接「監督する」はsupervise。oversee（より広い範囲を統括する）・coordinate（調整する）・recruit（採用する）はこの文脈では直接的な監督を表さない。',
    translation: 'ベテランの技術者が、新しいインターンを最初の3か月間監督する。',
    difficulty: 3,
  },
  {
    word: 'oversee',
    tags: ['頻出動詞'],
    question: 'The regional director will ___ all three branch offices starting next month.',
    correctText: 'oversee',
    distractors: ['supervise', 'coordinate', 'recruit'],
    explanation:
      '複数の組織を広く「統括する」はoversee。supervise（個々の人を直接監督する）・coordinate（調整する）・recruit（採用する）は複数拠点の統括を表す語として弱い。',
    translation: '地域統括責任者は来月から、3つの支店すべてを統括する。',
    difficulty: 3,
  },
  {
    word: 'recruit',
    tags: ['頻出動詞'],
    question:
      'The company plans to ___ ten new engineers for its growing research division this year.',
    correctText: 'recruit',
    distractors: ['hire', 'terminate', 'delegate'],
    explanation:
      '人材を「募集し採用する」はrecruit。hire（雇う。意味は近いがrecruitほど募集活動を含意しない）・terminate（解雇する）・delegate（委任する）はこの文脈にふさわしくない。',
    translation: 'その会社は今年、拡大中の研究部門のために新しいエンジニアを10人採用する予定だ。',
    difficulty: 3,
  },
  {
    word: 'hire',
    tags: ['頻出動詞'],
    question: 'We need to ___ additional staff for the holiday season.',
    correctText: 'hire',
    distractors: ['recruit', 'terminate', 'delegate'],
    explanation:
      '人を「雇う」はhire。recruit（募集する。より広い採用活動を指す）・terminate（解雇する）・delegate（委任する）はこの文脈に合わない。',
    translation: '私たちは休暇シーズンのために追加のスタッフを雇う必要がある。',
    difficulty: 2,
  },
  {
    word: 'notify',
    tags: ['頻出動詞'],
    question: 'Please ___ the shipping department of any address changes.',
    correctText: 'notify',
    distractors: ['authorize', 'comply', 'delegate'],
    explanation:
      '相手に「通知する」はnotify。authorize（承認する）・comply（従う）・delegate（委任する）は情報を伝える意味を持たない。',
    translation: '住所変更があれば配送部門に通知してください。',
    difficulty: 2,
  },
  {
    word: 'inform',
    tags: ['頻出動詞'],
    question: 'The manager will ___ the team about the schedule change.',
    correctText: 'inform',
    distractors: ['authorize', 'delegate', 'comply'],
    explanation:
      '情報を「知らせる」はinform。authorize（承認する）・delegate（委任する）・comply（従う）は知らせるという意味を持たない。',
    translation: '部長がチームにスケジュール変更を知らせる予定だ。',
    difficulty: 2,
  },
  {
    word: 'request',
    tags: ['頻出動詞'],
    question: 'Customers may ___ a refund within thirty days.',
    correctText: 'request',
    distractors: ['authorize', 'comply', 'delegate'],
    explanation:
      '何かを「依頼・要求する」はrequest。authorize（承認する）・comply（従う）・delegate（委任する）は依頼する側の行為を表さない。',
    translation: '顧客は30日以内であれば返金を依頼できる。',
    difficulty: 2,
  },
  {
    word: 'clarify',
    tags: ['頻出動詞'],
    question: 'Could you ___ the deadline for this project?',
    correctText: 'clarify',
    distractors: ['authorize', 'delegate', 'comply'],
    explanation:
      '曖昧な点を「明確にする」はclarify。authorize（承認する）・delegate（委任する）・comply（従う）は説明を明確にする意味を持たない。',
    translation: 'このプロジェクトの締切を明確にしていただけますか。',
    difficulty: 2,
  },
  {
    word: 'terminate',
    tags: ['頻出動詞'],
    question: 'The company decided to ___ the contract early due to repeated delivery delays.',
    correctText: 'terminate',
    distractors: ['implement', 'comply', 'authorize'],
    explanation:
      '契約などを「終了させる」はterminate。implement（実施する）・comply（従う）・authorize（承認する）は契約を打ち切る意味を持たない。',
    translation: 'その会社は度重なる納品の遅れのため、契約を早期に終了させることにした。',
    difficulty: 3,
  },
  {
    word: 'retirement',
    tags: ['ビジネス名詞'],
    question: 'She is planning her ___ after twenty-five years of service with the firm.',
    correctText: 'retirement',
    distractors: ['appraisal', 'retention', 'attrition'],
    explanation:
      '勤続後の「退職」はretirement。appraisal（人事評価）・retention（人材の定着）・attrition（自然減）は退職という個人の行為そのものを指さない。',
    translation: '彼女はその会社での25年間の勤続の後、退職を計画している。',
    difficulty: 3,
  },
  {
    word: 'evaluation',
    tags: ['ビジネス名詞'],
    question:
      'Each employee receives an annual performance ___ from their direct supervisor in March.',
    correctText: 'evaluation',
    distractors: ['newsletter', 'correspondence', 'expenditure'],
    explanation:
      '業績の「評価」はevaluation。newsletter（社内報）・correspondence（文書のやり取り）・expenditure（支出）は評価という行為・文書を表さない。',
    translation: '各従業員は3月に、直属の上司から年次業績評価を受ける。',
    difficulty: 3,
  },
  {
    word: 'performance',
    tags: ['ビジネス名詞'],
    question: 'The report highlights strong sales ___ this quarter despite the weak economy.',
    correctText: 'performance',
    distractors: ['expenditure', 'correspondence', 'occupancy'],
    explanation:
      '業績・成績を表すのはperformance。expenditure（支出）・correspondence（文書のやり取り）・occupancy（入居）は売上の良し悪しを表す語ではない。',
    translation: 'その報告書は、不況にもかかわらず今四半期の好調な販売実績を強調している。',
    difficulty: 3,
  },
  {
    word: 'registration',
    tags: ['ビジネス名詞'],
    question: '___ for the seminar closes on Friday.',
    correctText: 'registration',
    distractors: ['correspondence', 'evaluation', 'appraisal'],
    explanation:
      'セミナー等への「登録」はregistration。correspondence（文書のやり取り）・evaluation（評価）・appraisal（人事評価）は申込・登録行為を表さない。',
    translation: 'セミナーの登録受付は金曜日に締め切られる。',
    difficulty: 2,
  },
  {
    word: 'correspondence',
    tags: ['ビジネス名詞'],
    question: 'All business ___ should be saved for at least five years by law.',
    correctText: 'correspondence',
    distractors: ['registration', 'evaluation', 'newsletter'],
    explanation:
      '手紙・メール等の「やり取り」全般はcorrespondence。registration（登録）・evaluation（評価）・newsletter（社内報という特定の刊行物）はこの意味を持たない。',
    translation: 'すべての業務上のやり取りは、法律により少なくとも5年間保管すべきだ。',
    difficulty: 3,
  },
  {
    word: 'participate',
    tags: ['頻出動詞'],
    question: 'Employees are encouraged to ___ in the wellness program.',
    correctText: 'participate',
    distractors: ['authorize', 'comply', 'delegate'],
    explanation:
      '活動に「参加する」はparticipate（in）。authorize（承認する）・comply（従う）・delegate（委任する）は参加する意味を持たない。',
    translation: '従業員は健康増進プログラムへの参加を奨励されている。',
    difficulty: 2,
  },
  {
    word: 'expenditure',
    tags: ['ビジネス名詞'],
    question: 'The department must reduce ___ by ten percent before the next audit.',
    correctText: 'expenditure',
    distractors: ['revenue', 'performance', 'registration'],
    explanation:
      '「支出」はexpenditure。revenue（収益。逆の意味）・performance（業績）・registration（登録）は支出額を表す語ではない。',
    translation: 'その部署は次の監査までに、支出を10パーセント削減しなければならない。',
    difficulty: 3,
  },
  {
    word: 'competitor',
    tags: ['ビジネス名詞'],
    question: 'Our biggest ___ just launched a similar product.',
    correctText: 'competitor',
    distractors: ['stakeholder', 'supplier', 'affiliate'],
    explanation:
      '「競合他社」はcompetitor。stakeholder（利害関係者）・supplier（仕入れ先）・affiliate（提携先）は競争相手を意味しない。',
    translation: '私たちの最大の競合他社が似た製品を発売したばかりだ。',
    difficulty: 2,
  },
  {
    word: 'client',
    tags: ['ビジネス名詞'],
    question: 'The lawyer met with her ___ to discuss the case.',
    correctText: 'client',
    distractors: ['competitor', 'affiliate', 'stakeholder'],
    explanation:
      '専門家に依頼する側の「顧客・依頼人」はclient。competitor（競合他社）・affiliate（提携先）・stakeholder（利害関係者）は依頼人を意味しない。',
    translation: 'その弁護士は依頼人と会って案件について話し合った。',
    difficulty: 2,
  },
  {
    word: 'shareholder',
    tags: ['ビジネス名詞'],
    question: 'The ___ meeting will be held next Tuesday at the downtown headquarters.',
    correctText: 'shareholder',
    distractors: ['occupant', 'applicant', 'competitor'],
    explanation:
      '会社の「株主」はshareholder。occupant（入居者）・applicant（応募者）・competitor（競合他社）は株主総会の主体として合わない。',
    translation: '株主総会は、来週火曜日に中心街の本社で開催される。',
    difficulty: 3,
  },
  {
    word: 'landlord',
    tags: ['ビジネス名詞'],
    question: 'Tenants should contact the ___ about any repairs needed in the building.',
    correctText: 'landlord',
    distractors: ['occupant', 'supplier', 'concierge'],
    explanation:
      '物件を貸す「大家」はlandlord。occupant（入居者。借りる側）・supplier（仕入れ先）・concierge（コンシェルジュ）は大家を意味しない。',
    translation: '入居者は、建物内で必要な修理について大家に連絡すべきだ。',
    difficulty: 3,
  },
  {
    word: 'employee',
    tags: ['ビジネス名詞'],
    question: 'Every ___ received a bonus this year.',
    correctText: 'employee',
    distractors: ['applicant', 'shareholder', 'competitor'],
    explanation:
      '雇われて働く「従業員」はemployee。applicant（応募者）・shareholder（株主）・competitor（競合他社）は従業員を意味しない。',
    translation: '今年は従業員全員がボーナスを受け取った。',
    difficulty: 2,
  },
  {
    word: 'presentation',
    tags: ['ビジネス名詞'],
    question: 'She gave a ___ on the new marketing strategy.',
    correctText: 'presentation',
    distractors: ['briefing', 'ceremony', 'testimonial'],
    explanation:
      '資料を使って行う「プレゼンテーション」はpresentation。briefing（短い説明会）・ceremony（式典）・testimonial（推薦の声）は発表そのものを指さない。',
    translation: '彼女は新しいマーケティング戦略についてプレゼンテーションを行った。',
    difficulty: 2,
  },
  {
    word: 'deadline',
    tags: ['ビジネス名詞'],
    question: 'The ___ for the proposal is next Monday.',
    correctText: 'deadline',
    distractors: ['itinerary', 'registration', 'appraisal'],
    explanation:
      '提出などの「締切」はdeadline。itinerary（旅程表）・registration（登録）・appraisal（人事評価）は締切日を意味しない。',
    translation: '提案書の締切は来週の月曜日だ。',
    difficulty: 2,
  },
  {
    word: 'voucher',
    tags: ['ビジネス名詞'],
    question: 'Customers receive a ___ for a free coffee.',
    correctText: 'voucher',
    distractors: ['receipt', 'lease', 'mortgage'],
    explanation:
      '無料引き換えなどに使う「引換券」はvoucher。receipt（領収書）・lease（賃貸借契約）・mortgage（住宅ローン）は引換券を意味しない。',
    translation: '顧客は無料コーヒーの引換券を受け取る。',
    difficulty: 2,
  },
  {
    word: 'premises',
    tags: ['ビジネス名詞'],
    question:
      'Visitors must sign in at the front gate before entering the ___, which includes the parking area and every building on site.',
    correctText: 'premises',
    distractors: ['facility', 'estate', 'venue'],
    explanation:
      '建物・敷地全体（駐車場や複数棟を含む一区画）を指す「構内」はpremises。facility（単一の施設・建物を指す語で、駐車場や複数棟をまとめては指さない）・estate（地所）・venue（会場）はこの文脈では代わりにくい（2026-08-07訂正・T-342・K-80: 旧設問は"敷地全体"という限定が無くfacilityでも二重正答になり得たため、駐車場・複数棟を含む区画であることを明示した）。',
    translation:
      '訪問者は、駐車場と敷地内のすべての建物を含む構内に入る前に、正門で署名しなければならない。',
    difficulty: 3,
  },
  {
    word: 'supplier',
    tags: ['ビジネス名詞'],
    question: 'We switched to a new ___ for office supplies.',
    correctText: 'supplier',
    distractors: ['competitor', 'affiliate', 'client'],
    explanation:
      '商品を供給する「仕入れ先」はsupplier。competitor（競合他社）・affiliate（提携先）・client（顧客）は仕入れ先を意味しない。',
    translation: '私たちは事務用品の仕入れ先を新しいところに変えた。',
    difficulty: 2,
  },
  {
    word: 'receipt',
    tags: ['ビジネス名詞'],
    question: 'Keep your ___ in case you need a refund.',
    correctText: 'receipt',
    distractors: ['voucher', 'warranty', 'lease'],
    explanation:
      '購入証明の「領収書」はreceipt。voucher（引換券）・warranty（保証）・lease（賃貸借契約）は返金の際に必要な購入証明にはならない。',
    translation: '返金が必要になった場合に備えて領収書を保管しておいてください。',
    difficulty: 2,
  },
  {
    word: 'merchandise',
    tags: ['ビジネス名詞'],
    question: 'The store received a large shipment of new ___.',
    correctText: 'merchandise',
    distractors: ['freight', 'revenue', 'footfall'],
    explanation:
      '店で売る「商品」はmerchandise。freight（輸送中の貨物一般）・revenue（収益）・footfall（来店客数）は商品そのものを意味しない。',
    translation: 'その店は新商品の大きな入荷を受け取った。',
    difficulty: 2,
  },
  {
    word: 'boarding',
    tags: ['ビジネス名詞'],
    question: '___ for flight 204 begins at gate twelve.',
    correctText: 'boarding',
    distractors: ['immigration', 'stopover', 'checkpoint'],
    explanation:
      '飛行機への「搭乗」はboarding。immigration（出入国審査）・stopover（短期滞在）・checkpoint（検問所）は搭乗開始を意味しない。',
    translation: '204便の搭乗は12番ゲートで始まる。',
    difficulty: 2,
  },
  {
    word: 'revenue',
    tags: ['ビジネス名詞'],
    question: "The company's ___ increased by fifteen percent last year despite the recession.",
    correctText: 'revenue',
    distractors: ['expenditure', 'performance', 'liquidity'],
    explanation:
      '「収益」はrevenue。expenditure（支出。逆の意味）・performance（業績全般）・liquidity（流動性）は売上高そのものを指さない。',
    translation: 'その会社の収益は、不況にもかかわらず昨年15パーセント増加した。',
    difficulty: 3,
  },
  {
    word: 'retail',
    tags: ['ビジネス名詞'],
    question:
      'The clothing brand plans to expand into the ___ market by opening standalone stores across several new countries.',
    correctText: 'retail',
    distractors: ['freight', 'catering', 'hospitality'],
    explanation:
      '「小売」市場はretail market。freight（貨物輸送）・catering（ケータリング）・hospitality（もてなし業。ホテルやレストラン業を指し、衣料品の店舗展開には当てはまらない）は市場の種類として合わない（2026-08-07訂正・T-342・K-80: 旧設問はブランドの業種が不明でhospitality marketとも読め二重正答の疑いがあったため、衣料品ブランドが実店舗を展開する場面と明示した）。',
    translation:
      'その衣料品ブランドは、いくつかの新しい国々で単独店舗を展開することにより、小売市場への進出を計画している。',
    difficulty: 3,
  },
  {
    word: 'mortgage',
    tags: ['ビジネス名詞'],
    question: 'They applied for a ___ to buy their first house near the coast.',
    correctText: 'mortgage',
    distractors: ['lease', 'voucher', 'subscription'],
    explanation:
      '住宅購入のための「住宅ローン」はmortgage。lease（賃貸借契約）・voucher（引換券）・subscription（定期購読）はローンを意味しない。',
    translation: '彼らは、海辺近くの初めての持ち家を買うために住宅ローンを申し込んだ。',
    difficulty: 3,
  },
  {
    word: 'inquiry',
    tags: ['ビジネス名詞'],
    question: 'The hotel received an ___ about group discounts.',
    correctText: 'inquiry',
    distractors: ['dispute', 'testimonial', 'briefing'],
    explanation:
      '情報を求める「問い合わせ」はinquiry。dispute（紛争）・testimonial（推薦の声）・briefing（説明会）は問い合わせという行為を表さない。',
    translation: 'そのホテルは団体割引についての問い合わせを受けた。',
    difficulty: 2,
  },
  {
    word: 'summarize',
    tags: ['頻出動詞'],
    question: 'Please ___ the report in one page.',
    correctText: 'summarize',
    distractors: ['authorize', 'ratify', 'disclose'],
    explanation:
      '内容を「要約する」はsummarize。authorize（承認する）・ratify（批准する）・disclose（開示する）は要約する意味を持たない。',
    translation: 'その報告書を1ページに要約してください。',
    difficulty: 2,
  },
  {
    word: 'qualification',
    tags: ['ビジネス名詞'],
    question: 'A first-aid ___ is required for this position at the new warehouse.',
    correctText: 'qualification',
    distractors: ['registration', 'appraisal', 'correspondence'],
    explanation:
      '職に必要な「資格」はqualification。registration（登録）・appraisal（人事評価）・correspondence（文書のやり取り）は資格を意味しない。',
    translation: 'この新しい倉庫の職には応急処置の資格が必要だ。',
    difficulty: 3,
  },
  {
    word: 'depreciation',
    tags: ['ビジネス名詞'],
    question: "The accountant calculated the equipment's annual ___ for the upcoming tax filing.",
    correctText: 'depreciation',
    distractors: ['reconciliation', 'liquidity', 'variance'],
    explanation:
      '資産価値の目減りを表す「減価償却」はdepreciation。reconciliation（照合）・liquidity（流動性）・variance（例外許可）は資産価値の減少を意味しない。',
    translation: 'その会計士は、今度の納税申告のために設備の年間減価償却額を計算した。',
    difficulty: 4,
  },
  {
    word: 'prototype',
    tags: ['ビジネス名詞'],
    question: 'Engineers tested the new ___ in the lab for several weeks straight.',
    correctText: 'prototype',
    distractors: ['blueprint', 'benchmark', 'merchandise'],
    explanation:
      '完成前の「試作品」はprototype。blueprint（設計図）・benchmark（基準）・merchandise（商品）は試作品そのものを指さない。',
    translation: '技術者たちは何週間も続けて、研究室で新しい試作品をテストした。',
    difficulty: 3,
  },
  {
    word: 'demographic',
    tags: ['言い換え語彙'],
    question: 'The campaign targets a younger ___ group that shops almost entirely online.',
    correctText: 'demographic',
    distractors: ['nonrefundable', 'punctual', 'chartered'],
    explanation:
      '「人口統計上の」を表す形容詞はdemographic。nonrefundable（払い戻し不可の）・punctual（時間に正確な）・chartered（貸し切りの）は人口層を修飾する語ではない。',
    translation:
      'そのキャンペーンは、ほぼすべての買い物をオンラインで行うより若い人口層を対象にしている。',
    difficulty: 3,
  },
  {
    word: 'outreach',
    tags: ['ビジネス名詞'],
    question: 'The nonprofit organized a community ___ event in the local park last weekend.',
    correctText: 'outreach',
    distractors: ['briefing', 'ceremony', 'testimonial'],
    explanation:
      '地域社会への「働きかけ」はoutreach。briefing（説明会）・ceremony（式典）・testimonial（推薦の声）は地域への働きかけを意味しない。',
    translation: 'その非営利団体は先週末、地元の公園で地域への働きかけイベントを企画した。',
    difficulty: 3,
  },
  {
    word: 'dispute',
    tags: ['ビジネス名詞'],
    question: 'The two companies settled their ___ out of court after months of negotiation.',
    correctText: 'dispute',
    distractors: ['inquiry', 'variance', 'infringement'],
    explanation:
      '当事者間の「紛争」はdispute。inquiry（問い合わせ）・variance（例外許可）・infringement（侵害。紛争の原因になり得るが紛争自体ではない）はこの文脈に合わない。',
    translation: 'その2社は数か月の交渉の後、法廷外で紛争を解決した。',
    difficulty: 3,
  },
  {
    word: 'checkpoint',
    tags: ['ビジネス名詞'],
    question:
      'Passengers must pass through a security ___ before boarding the international flight.',
    correctText: 'checkpoint',
    distractors: ['gateway', 'boarding', 'reception'],
    explanation:
      '通過を確認する「検問所」はcheckpoint。gateway（玄関口）・boarding（搭乗）・reception（受付）は検問という機能を表さない。',
    translation: '乗客は国際線に搭乗する前に、保安検査場を通過しなければならない。',
    difficulty: 3,
  },
  {
    word: 'firewall',
    tags: ['ビジネス名詞'],
    question: "The IT team installed a new ___ to block intrusions after last month's breach.",
    correctText: 'firewall',
    distractors: ['password', 'protocol', 'middleware'],
    explanation:
      '不正アクセスを防ぐ「ファイアウォール」はfirewall。password（パスワード）・protocol（通信規約）・middleware（ミドルウェア）は侵入を遮断する装置そのものを指さない。',
    translation: 'IT部門は先月の侵入事件を受けて、侵入を遮断する新しいファイアウォールを導入した。',
    difficulty: 4,
  },
  {
    word: 'encryption',
    tags: ['ビジネス名詞'],
    question: 'All customer data is protected with strong ___ under the new privacy policy.',
    correctText: 'encryption',
    distractors: ['authentication', 'protocol', 'firewall'],
    explanation:
      'データを読めない形に変える「暗号化」はencryption。authentication（本人確認の認証）・protocol（通信規約）・firewall（ファイアウォール）は暗号化そのものを意味しない。',
    translation:
      'すべての顧客データは、新しいプライバシー方針のもと強力な暗号化によって保護されている。',
    difficulty: 4,
  },
  {
    word: 'blueprint',
    tags: ['ビジネス名詞'],
    question: 'The architect reviewed the ___ carefully before construction began on the new wing.',
    correctText: 'blueprint',
    distractors: ['prototype', 'benchmark', 'itinerary'],
    explanation:
      '建築の「設計図」はblueprint。prototype（試作品）・benchmark（基準）・itinerary（旅程表）は図面そのものを指さない。',
    translation: '建築家は、新しい棟の工事開始前に設計図を注意深く確認した。',
    difficulty: 3,
  },
  {
    word: 'ceremony',
    tags: ['ビジネス名詞'],
    question: 'The opening ___ will take place in the main hall.',
    correctText: 'ceremony',
    distractors: ['briefing', 'outreach', 'testimonial'],
    explanation:
      '公式な「式典」はceremony。briefing（説明会）・outreach（働きかけ）・testimonial（推薦の声）は式典そのものを意味しない。',
    translation: '開会式はメインホールで行われる。',
    difficulty: 2,
  },
  {
    word: 'regulation',
    tags: ['ビジネス名詞'],
    question: 'The factory must follow strict safety ___ set by the state government.',
    correctText: 'regulation',
    distractors: ['variance', 'protocol', 'condemnation'],
    explanation:
      '法令上の「規制」はregulation。variance（例外許可。むしろ規制からの逸脱を指す）・protocol（通信規約）・condemnation（使用不可宣告）は規制そのものを意味しない。',
    translation: 'その工場は、州政府が定めた厳格な安全規制に従わなければならない。',
    difficulty: 3,
  },
  {
    word: 'briefing',
    tags: ['ビジネス名詞'],
    question: 'The manager held a ___ before the client visit to review the agenda.',
    correctText: 'briefing',
    distractors: ['ceremony', 'outreach', 'testimonial'],
    explanation:
      '短時間の「説明会」はbriefing。ceremony（式典）・outreach（働きかけ）・testimonial（推薦の声）は事前説明の意味を持たない。',
    translation: '部長は、議題を確認するため顧客訪問の前に説明会を開いた。',
    difficulty: 3,
  },
  {
    word: 'throughput',
    tags: ['ビジネス名詞'],
    question: "The new system doubled the factory's ___ within the first six months.",
    correctText: 'throughput',
    distractors: ['occupancy', 'footfall', 'liquidity'],
    explanation:
      '単位時間あたりの「処理能力」はthroughput。occupancy（入居率）・footfall（来店客数）・liquidity（流動性）は生産処理量を意味しない。',
    translation: 'その新しいシステムは、最初の6か月でその工場の処理能力を倍にした。',
    difficulty: 4,
  },
  {
    word: 'occupancy',
    tags: ['ビジネス名詞'],
    question: 'Hotel ___ rates rise sharply during the holidays in most coastal towns.',
    correctText: 'occupancy',
    distractors: ['throughput', 'footfall', 'retention'],
    explanation:
      '部屋等が埋まっている割合「入居（率）」はoccupancy。throughput（処理能力）・footfall（来店客数）・retention（人材の定着）はホテルの稼働率を意味しない。',
    translation: 'ほとんどの沿岸の町で、ホテルの稼働率は休暇シーズンに急上昇する。',
    difficulty: 4,
  },
  {
    word: 'liquidity',
    tags: ['ビジネス名詞'],
    question: 'The company improved its ___ by collecting payments faster than in previous years.',
    correctText: 'liquidity',
    distractors: ['revenue', 'expenditure', 'depreciation'],
    explanation:
      '資金をすぐ使える状態にできるかを表す「流動性」はliquidity。revenue（収益）・expenditure（支出）・depreciation（減価償却）は資金繰りの良さそのものを意味しない。',
    translation: 'その会社は、以前の年より早く支払いを回収することで流動性を改善した。',
    difficulty: 4,
  },
  {
    word: 'footfall',
    tags: ['ビジネス名詞'],
    question: '___ at the mall dropped sharply after the new highway opened last spring.',
    correctText: 'footfall',
    distractors: ['occupancy', 'throughput', 'retention'],
    explanation:
      '店舗等への「来店客数」はfootfall。occupancy（入居率）・throughput（処理能力）・retention（人材の定着）は来店客数を意味しない。',
    translation: '昨春、新しい高速道路が開通した後、モールへの来店客数は大きく減少した。',
    difficulty: 4,
  },
  {
    word: 'attrition',
    tags: ['ビジネス名詞'],
    question: "The company's employee ___ rate fell last year for the third year in a row.",
    correctText: 'attrition',
    distractors: ['retention', 'redundancy', 'downsizing'],
    explanation:
      '自然に人員が減っていく「自然減」はattrition。retention（定着。むしろ逆の概念）・redundancy（人員整理）・downsizing（人員削減）はいずれも意図的な削減を指し、自然減とは異なる。',
    translation: 'その会社の従業員自然減率は、3年連続で昨年低下した。',
    difficulty: 4,
  },
  {
    word: 'proofread',
    tags: ['頻出動詞'],
    question: 'Please ___ the document twice before sending it to the client this afternoon.',
    correctText: 'proofread',
    distractors: ['summarize', 'disclose', 'ratify'],
    explanation:
      '誤りがないか「校正する」はproofread。summarize（要約する）・disclose（開示する）・ratify（批准する）は文章の誤りを確認する意味を持たない。',
    translation: '今日の午後、その文書を顧客に送る前に2回校正してください。',
    difficulty: 3,
  },
  {
    word: 'onboarding',
    tags: ['ビジネス名詞'],
    question: 'The ___ process now takes only two days thanks to the new online system.',
    correctText: 'onboarding',
    distractors: ['retirement', 'appraisal', 'retention'],
    explanation:
      '新入社員の「新人研修」プロセスはonboarding。retirement（退職）・appraisal（人事評価）・retention（人材の定着）は入社直後の研修過程を意味しない。',
    translation:
      '新しいオンラインシステムのおかげで、新人研修のプロセスは今では2日しかかからない。',
    difficulty: 3,
  },
  {
    word: 'reconciliation',
    tags: ['ビジネス名詞'],
    question: 'The accountant finished the monthly ___ of the accounts ahead of the deadline.',
    correctText: 'reconciliation',
    distractors: ['audit', 'depreciation', 'variance'],
    explanation:
      '帳簿と実際の数字を合わせる「照合」はreconciliation。audit（監査という制度全体）・depreciation（減価償却）・variance（例外許可）は照合作業そのものを意味しない。',
    translation: 'その会計士は、締切に先立って月次の口座照合を終えた。',
    difficulty: 4,
  },
  {
    word: 'appraisal',
    tags: ['ビジネス名詞'],
    question: 'Each staff member has an annual performance ___ conducted by their supervisor.',
    correctText: 'appraisal',
    distractors: ['retention', 'attrition', 'onboarding'],
    explanation:
      '個人の業績を評価する「人事評価」はappraisal。retention（定着）・attrition（自然減）・onboarding（新人研修）は評価という行為を意味しない。',
    translation: '各スタッフは、上司によって行われる年次の人事評価を受ける。',
    difficulty: 4,
  },
  {
    word: 'retention',
    tags: ['ビジネス名詞'],
    question: 'The HR team launched a new employee ___ program to reduce turnover this year.',
    correctText: 'retention',
    distractors: ['attrition', 'downsizing', 'onboarding'],
    explanation:
      '人材をつなぎとめる「定着」はretention。attrition（自然減。逆方向の概念）・downsizing（人員削減）・onboarding（新人研修）は定着施策そのものを意味しない。',
    translation: '人事チームは、今年の離職率を下げるために新しい従業員定着プログラムを開始した。',
    difficulty: 4,
  },
  {
    word: 'amenity',
    tags: ['ビジネス名詞'],
    question: 'The hotel offers many ___ including a rooftop pool and a modern gym.',
    correctText: 'amenity',
    distractors: ['utility', 'throughput', 'concierge'],
    explanation:
      '快適に過ごすための「設備」はamenity。utility（公共料金）・throughput（処理能力）・concierge（コンシェルジュ、人を指す）は設備を意味しない。',
    translation: 'そのホテルは、屋上プールや最新のジムを含む多くの設備を提供している。',
    difficulty: 3,
  },
  {
    word: 'concierge',
    tags: ['ビジネス名詞'],
    question: 'The ___ arranged a dinner reservation for the guests at a nearby restaurant.',
    correctText: 'concierge',
    distractors: ['landlord', 'occupant', 'gateway'],
    explanation:
      '宿泊客の世話をする「コンシェルジュ」はconcierge。landlord（大家）・occupant（入居者）・gateway（玄関口）は人ではない、または該当する職種を指さない。',
    translation: 'コンシェルジュが、近くのレストランで宿泊客のためにディナーの予約を手配した。',
    difficulty: 3,
  },
  {
    word: 'chartered',
    tags: ['言い換え語彙'],
    question: 'They traveled on a ___ bus to the conference held downtown last week.',
    correctText: 'chartered',
    distractors: ['nonrefundable', 'punctual', 'obsolete'],
    explanation:
      '団体のために「貸し切りの」はchartered。nonrefundable（払い戻し不可の）・punctual（時間に正確な）・obsolete（旧式の）はバスの種類を修飾する語として合わない。',
    translation: '彼らは、先週中心街で開かれた会議へ貸し切りバスで移動した。',
    difficulty: 3,
  },
  {
    word: 'punctual',
    tags: ['言い換え語彙'],
    question: 'Being ___ is essential for this customer-facing role at the front desk.',
    correctText: 'punctual',
    distractors: ['chartered', 'obsolete', 'nonrefundable'],
    explanation:
      '「時間に正確な」はpunctual。chartered（貸し切りの）・obsolete（旧式の）・nonrefundable（払い戻し不可の）は人の性質を表す語として合わない。',
    translation: 'フロントデスクでのこの顧客対応の役職には、時間を守ることが不可欠だ。',
    difficulty: 3,
  },
  {
    word: 'gateway',
    tags: ['ビジネス名詞'],
    question: 'The airport serves as a major ___ to the region for international travelers.',
    correctText: 'gateway',
    distractors: ['checkpoint', 'boarding', 'stopover'],
    explanation:
      '地域への「玄関口」はgateway。checkpoint（検問所）・boarding（搭乗）・stopover（短期滞在）は地域への入り口という意味を持たない。',
    translation: 'その空港は、海外からの旅行者にとってその地域への主要な玄関口となっている。',
    difficulty: 3,
  },
  {
    word: 'hospitality',
    tags: ['ビジネス名詞'],
    question: 'The staff is known for excellent ___ toward every guest who checks in.',
    correctText: 'hospitality',
    distractors: ['catering', 'concierge', 'retail'],
    explanation:
      '客をもてなす「もてなし」はhospitality。catering（ケータリング）・concierge（コンシェルジュ、人）・retail（小売）はもてなしという性質を意味しない。',
    translation:
      'そのスタッフは、チェックインするすべての宿泊客への素晴らしいもてなしで知られている。',
    difficulty: 3,
  },
  {
    word: 'immigration',
    tags: ['ビジネス名詞'],
    question: 'Passengers must clear ___ before collecting luggage at the arrival hall downstairs.',
    correctText: 'immigration',
    distractors: ['boarding', 'checkpoint', 'stopover'],
    explanation:
      '空港の「出入国審査」はimmigration。boarding（搭乗）・checkpoint（検問所）・stopover（短期滞在）は出入国審査という手続きそのものを意味しない。',
    translation:
      '乗客は、下の階の到着ロビーで荷物を受け取る前に出入国審査を通過しなければならない。',
    difficulty: 3,
  },
  {
    word: 'stopover',
    tags: ['ビジネス名詞'],
    question: 'Our flight includes a two-hour ___ in Tokyo before continuing on to Seoul.',
    correctText: 'stopover',
    distractors: ['boarding', 'immigration', 'gateway'],
    explanation:
      '目的地までの「短期滞在」はstopover。boarding（搭乗）・immigration（出入国審査）・gateway（玄関口）は途中滞在を意味しない。',
    translation: '私たちの便は、ソウルへ向かう前に東京での2時間の短期滞在を含んでいる。',
    difficulty: 3,
  },
  {
    word: 'ratify',
    tags: ['頻出動詞'],
    question:
      "The board voted to ___ the new trade agreement during yesterday's emergency session.",
    correctText: 'ratify',
    distractors: ['implement', 'comply', 'disclose'],
    explanation:
      '正式に「批准する」はratify。implement（実施する）・comply（従う）・disclose（開示する）は正式な承認・締結の意味を持たない。',
    translation: '取締役会は、昨日の緊急会合で新しい貿易協定を批准することを議決した。',
    difficulty: 4,
  },
  {
    word: 'disclose',
    tags: ['頻出動詞'],
    question: 'Companies must ___ any major financial risks in their annual public report.',
    correctText: 'disclose',
    distractors: ['ratify', 'comply', 'summarize'],
    explanation:
      '情報を「開示する」はdisclose。ratify（批准する）・comply（従う）・summarize（要約する）は情報を公開する意味を持たない。',
    translation: '企業は、年次の公開報告書で重大な財務リスクを開示しなければならない。',
    difficulty: 4,
  },
  {
    word: 'overbook',
    tags: ['頻出動詞'],
    question: 'The airline apologized after it decided to ___ the flight during the holiday rush.',
    correctText: 'overbook',
    distractors: ['terminate', 'allocate', 'authorize'],
    explanation:
      '定員を超えて予約を取る「オーバーブッキングする」はoverbook。terminate（終了させる）・allocate（割り当てる）・authorize（承認する）はこの意味を持たない。',
    translation:
      'その航空会社は、休暇シーズンの混雑中に便をオーバーブッキングしたことについて謝罪した。',
    difficulty: 4,
  },
  {
    word: 'obsolete',
    tags: ['言い換え語彙'],
    question: 'The old software became ___ after the update was rolled out company-wide.',
    correctText: 'obsolete',
    distractors: ['punctual', 'chartered', 'nonrefundable'],
    explanation:
      '時代遅れで使われなくなった「旧式の」はobsolete。punctual（時間に正確な）・chartered（貸し切りの）・nonrefundable（払い戻し不可の）はこの文脈に合わない。',
    translation: '古いソフトウェアは、全社的にアップデートが展開された後、旧式のものとなった。',
    difficulty: 3,
  },
  {
    word: 'relocation',
    tags: ['ビジネス名詞'],
    question: 'The board approved the ___ of the regional office to a larger building downtown.',
    correctText: 'relocation',
    distractors: ['acquisition', 'renovation', 'expansion'],
    explanation:
      '事業拠点の「移転」はrelocation。acquisition（買収）・renovation（改装）・expansion（拡大）はこの文脈に合わない。',
    translation: '取締役会は、地域オフィスを中心街のより大きなビルへ移転することを承認した。',
    difficulty: 4,
  },
  {
    word: 'accommodation',
    tags: ['ビジネス名詞'],
    question: 'The travel agency arranged ___ near the conference venue for all attendees.',
    correctText: 'accommodation',
    distractors: ['infringement', 'itinerary', 'regulation'],
    explanation:
      '宿泊施設を意味する「宿泊」はaccommodation。infringement（侵害）・itinerary（旅程表）・regulation（規制）はこの文脈に合わない。',
    translation: 'その旅行代理店は、参加者全員のために会場近くの宿泊施設を手配した。',
    difficulty: 2,
  },
  {
    word: 'advertisement',
    tags: ['ビジネス名詞'],
    question: 'The company placed an ___ in the local paper to promote its weekend sale.',
    correctText: 'advertisement',
    distractors: ['accommodation', 'infringement', 'dispute'],
    explanation:
      '新聞等に載せる「広告」はadvertisement。accommodation（宿泊）・infringement（侵害）・dispute（紛争）は広告の意味を持たない。',
    translation: 'その会社は週末セールを宣伝するため、地元紙に広告を掲載した。',
    difficulty: 2,
  },
  {
    word: 'turnaround',
    tags: ['ビジネス名詞'],
    question: 'The new management team engineered a remarkable ___ within just one year.',
    correctText: 'turnaround',
    distractors: ['stagnation', 'decline', 'shortage'],
    explanation:
      '業績の「立て直し」はturnaround。stagnation（停滞）・decline（衰退）・shortage（不足）は好転を意味しない。',
    translation: '新しい経営陣は、わずか1年で見事な業績の立て直しを成し遂げた。',
    difficulty: 4,
  },
  {
    word: 'modernization',
    tags: ['ビジネス名詞'],
    question: 'The company announced a major ___ plan that will affect several factories.',
    correctText: 'modernization',
    distractors: ['consolidation', 'diversification', 'expansion'],
    explanation:
      '設備・体制を「近代化する」計画はmodernization。consolidation（統合）・diversification（多角化）・expansion（拡大）はこの文脈での言い換えとしては不正確。',
    translation: 'その会社は、複数の工場に影響する大規模な近代化計画を発表した。',
    difficulty: 4,
  },
  {
    word: 'nonrefundable',
    tags: ['言い換え語彙'],
    question: 'The ticket is ___ once purchased, even if the event is canceled.',
    correctText: 'nonrefundable',
    distractors: ['punctual', 'chartered', 'obsolete'],
    explanation:
      '「払い戻し不可の」はnonrefundable。punctual（時間に正確な）・chartered（貸し切りの）・obsolete（旧式の）はチケットの返金可否を表さない。',
    translation: 'そのチケットは、購入後は、たとえイベントが中止になっても払い戻し不可となる。',
    difficulty: 3,
  },
  {
    word: 'variance',
    tags: ['ビジネス名詞'],
    question: 'The business applied for a zoning ___ to expand parking behind the store.',
    correctText: 'variance',
    distractors: ['regulation', 'depreciation', 'reconciliation'],
    explanation:
      '規制から外れることを認める「例外許可」はvariance。regulation（規制そのもの）・depreciation（減価償却）・reconciliation（照合）は例外許可を意味しない。',
    translation: 'その事業者は、店舗裏の駐車場を拡張するために区域規制の例外許可を申請した。',
    difficulty: 4,
  },
  {
    word: 'authentication',
    tags: ['ビジネス名詞'],
    question: 'Two-factor ___ adds an extra layer of security to every login attempt.',
    correctText: 'authentication',
    distractors: ['encryption', 'protocol', 'firewall'],
    explanation:
      '本人確認を行う「認証」はauthentication。encryption（暗号化）・protocol（通信規約）・firewall（ファイアウォール）は本人確認の手続きそのものを意味しない。',
    translation: '二要素認証は、あらゆるログイン試行に追加のセキュリティ層を加える。',
    difficulty: 4,
  },
  {
    word: 'middleware',
    tags: ['ビジネス名詞'],
    question: 'The ___ connects the app to the database running on the main server.',
    correctText: 'middleware',
    distractors: ['firewall', 'protocol', 'endpoint'],
    explanation:
      'アプリとデータベースをつなぐ「ミドルウェア」はmiddleware。firewall（ファイアウォール）・protocol（通信規約）・endpoint（末端機器）は接続の仲介ソフトウェアを意味しない。',
    translation: 'そのミドルウェアは、メインサーバー上で動くデータベースとアプリをつないでいる。',
    difficulty: 4,
  },
  {
    word: 'protocol',
    tags: ['ビジネス名詞'],
    question: 'The devices communicate using a standard ___ recognized across the entire industry.',
    correctText: 'protocol',
    distractors: ['middleware', 'firewall', 'endpoint'],
    explanation:
      '通信の規約・手順を表す「通信規約」はprotocol。middleware（ミドルウェア）・firewall（ファイアウォール）・endpoint（末端機器）は通信手順そのものを意味しない。',
    translation: 'それらの機器は、業界全体で認識されている標準的な通信規約を使って通信する。',
    difficulty: 4,
  },
  {
    word: 'endpoint',
    tags: ['ビジネス名詞'],
    question: 'Each ___ must have updated security software installed before it goes online.',
    correctText: 'endpoint',
    distractors: ['middleware', 'protocol', 'gateway'],
    explanation:
      'ネットワークにつながる個々の「末端機器」はendpoint。middleware（ミドルウェア）・protocol（通信規約）・gateway（玄関口、ネットワークの出入口を指すが個々の機器ではない）は個々の端末を意味しない。',
    translation:
      '各末端機器は、オンラインになる前に最新のセキュリティソフトが導入されていなければならない。',
    difficulty: 4,
  },
  {
    word: 'provisioning',
    tags: ['ビジネス名詞'],
    question: 'The IT team automated server ___ to speed up new project launches.',
    correctText: 'provisioning',
    distractors: ['virtualization', 'integration', 'throughput'],
    explanation:
      'システム資源を用意し割り当てる「プロビジョニング」はprovisioning。virtualization（仮想化という別の技術）・integration（統合）・throughput（処理能力）はこの意味を持たない。',
    translation:
      'IT部門は、新規プロジェクトの立ち上げを早めるためにサーバーのプロビジョニングを自動化した。',
    difficulty: 4,
  },
  {
    word: 'virtualization',
    tags: ['ビジネス名詞'],
    question: '___ allowed the company to run many more servers on far less hardware.',
    correctText: 'virtualization',
    distractors: ['provisioning', 'integration', 'encryption'],
    explanation:
      '物理機器を仮想的に扱う「仮想化」はvirtualization。provisioning（プロビジョニング）・integration（統合）・encryption（暗号化）はこの技術そのものを意味しない。',
    translation:
      '仮想化により、その会社ははるかに少ないハードウェアで、より多くのサーバーを稼働できた。',
    difficulty: 4,
  },
  {
    word: 'cybersecurity',
    tags: ['ビジネス名詞'],
    question: 'The firm invested heavily in ___ after the data breach made headlines nationwide.',
    correctText: 'cybersecurity',
    distractors: ['authentication', 'encryption', 'firewall'],
    explanation:
      'デジタル環境全般を守る「サイバーセキュリティ」はcybersecurity。authentication（認証）・encryption（暗号化）・firewall（ファイアウォール）はいずれもサイバーセキュリティを構成する個別要素であり、全体を表す語ではない。',
    translation:
      'その会社は、データ漏えいが全国的なニュースになった後、サイバーセキュリティに多額の投資をした。',
    difficulty: 4,
  },
  {
    word: 'phishing',
    tags: ['ビジネス名詞'],
    question: 'Employees were warned about a new ___ email scam targeting company executives.',
    correctText: 'phishing',
    distractors: ['infringement', 'condemnation', 'dispute'],
    explanation:
      '偽メール等で情報を盗む「フィッシング詐欺」はphishing。infringement（侵害）・condemnation（使用不可宣告）・dispute（紛争）はこの種の詐欺行為を意味しない。',
    translation: '従業員は、会社の役員を狙う新しいフィッシング詐欺メールについて警告を受けた。',
    difficulty: 4,
  },
  {
    word: 'integration',
    tags: ['ビジネス名詞'],
    question:
      'The software update improved ___ between departments across the whole global organization.',
    correctText: 'integration',
    distractors: ['virtualization', 'provisioning', 'throughput'],
    explanation:
      '複数のものを一つにまとめる「統合」はintegration。virtualization（仮想化）・provisioning（プロビジョニング）・throughput（処理能力）は部門間の連携強化を意味しない。',
    translation: 'そのソフトウェア更新は、組織全体にわたって部門間の統合を改善した。',
    difficulty: 3,
  },
  {
    word: 'benchmark',
    tags: ['ビジネス名詞'],
    question: 'The team compared results against an industry ___ published earlier in the year.',
    correctText: 'benchmark',
    distractors: ['prototype', 'blueprint', 'variance'],
    explanation:
      '比較の「基準」はbenchmark。prototype（試作品）・blueprint（設計図）・variance（例外許可）は比較対象となる基準値を意味しない。',
    translation: 'そのチームは、年の初めに公表された業界の基準と結果を比較した。',
    difficulty: 3,
  },
  {
    word: 'niche',
    tags: ['ビジネス名詞'],
    question: 'The startup found a profitable ___ in eco-friendly packaging within its first year.',
    correctText: 'niche',
    distractors: ['retail', 'affiliate', 'competitor'],
    explanation:
      '特化した「隙間市場」はniche。retail（小売という広い業態）・affiliate（提携先）・competitor（競合他社）はこの語の意味を持たない。',
    translation:
      'そのスタートアップは、最初の年のうちに環境に優しい包装という利益の出る隙間市場を見つけた。',
    difficulty: 4,
  },
  {
    word: 'testimonial',
    tags: ['ビジネス名詞'],
    question: 'The website features a customer ___ on the homepage next to the pricing chart.',
    correctText: 'testimonial',
    distractors: ['briefing', 'ceremony', 'outreach'],
    explanation:
      '利用者による「推薦の声」はtestimonial。briefing（説明会）・ceremony（式典）・outreach（働きかけ）は推薦の言葉そのものを意味しない。',
    translation: 'そのウェブサイトは、料金表の隣のホームページに顧客の推薦の声を掲載している。',
    difficulty: 3,
  },
  {
    word: 'affiliate',
    tags: ['ビジネス名詞'],
    question: 'The product is sold through an online ___ program run by several bloggers.',
    correctText: 'affiliate',
    distractors: ['competitor', 'client', 'supplier'],
    explanation:
      '提携して販売等を行う「提携先」はaffiliate。competitor（競合他社）・client（顧客）・supplier（仕入れ先）は提携関係を意味しない。',
    translation:
      'その製品は、複数のブロガーが運営するオンラインの提携プログラムを通じて販売されている。',
    difficulty: 3,
  },
  {
    word: 'engagement',
    tags: ['ビジネス名詞'],
    question: 'Social media posts increased customer ___ significantly over the past six months.',
    correctText: 'engagement',
    distractors: ['retention', 'throughput', 'footfall'],
    explanation:
      '顧客が積極的に関わる「関与」はengagement。retention（定着）・throughput（処理能力）・footfall（来店客数）は顧客の能動的な関わりの度合いを意味しない。',
    translation: '過去6か月間で、SNSの投稿は顧客エンゲージメントを大きく高めた。',
    difficulty: 3,
  },
]
