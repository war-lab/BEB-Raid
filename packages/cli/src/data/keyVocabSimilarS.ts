// key単語類題50問+のデータ本体（T-29。正本: docs/03 3.2節・docs/04 5節）。
// 対象語はPart2(T-27)/Part5(T-28)の両方にkeyVocabとして出現した19語（最頻出）。
// 1語につき3問。文法形ではなく語彙選択（コロケーション・言い換え）を問う形式で、
// T-28（品詞/動詞の形中心）とは出題観点を分けている。

export interface KeyVocabSimilarEntry {
  /** 対象key単語（この語を含むquestion/choicesを持つことをバリデーションで強制） */
  word: string
  tags: string[]
  question: string
  choices: { key: string; text: string }[]
  answer: string
  explanation: string
  translation: string
  difficulty: number
}

export const KEY_VOCAB_SIMILAR_ENTRIES: KeyVocabSimilarEntry[] = [
  {
    word: 'account',
    tags: ['ビジネス名詞'],
    question: 'Please transfer the funds to our corporate ___.',
    choices: [
      { key: 'A', text: 'receipt' },
      { key: 'B', text: 'warranty' },
      { key: 'C', text: 'account' },
      { key: 'D', text: 'invoice' },
    ],
    answer: 'C',
    explanation:
      '「口座に送金する」はtransfer funds to an accountが定番の言い方。invoice（請求書）、receipt（領収書）、warranty（保証書）はいずれも送金先にはならない。',
    translation: '弊社の法人口座に送金してください。',
    difficulty: 2,
  },
  {
    word: 'account',
    tags: ['前置詞コロケーション'],
    question: 'Could you check the balance on this ___?',
    choices: [
      { key: 'A', text: 'strategy' },
      { key: 'B', text: 'account' },
      { key: 'C', text: 'proposal' },
      { key: 'D', text: 'certification' },
    ],
    answer: 'B',
    explanation:
      '"balance on an account"（口座の残高）は定番のコロケーション。proposal（提案書）・certification（認定）・strategy（戦略）は残高を持つ対象ではない。',
    translation: 'この口座の残高を確認していただけますか？',
    difficulty: 2,
  },
  {
    word: 'account',
    tags: ['ビジネス名詞'],
    question: 'New employees are required to open an ___ with our partner bank.',
    choices: [
      { key: 'A', text: 'account' },
      { key: 'B', text: 'inspection' },
      { key: 'C', text: 'subscription' },
      { key: 'D', text: 'merger' },
    ],
    answer: 'A',
    explanation:
      '"open an account"（口座を開設する）が正しいコロケーション。inspection（検査）・subscription（購読）・merger（合併）は「開設する」対象として不自然。',
    translation: '新入社員は提携銀行に口座を開設することが求められる。',
    difficulty: 2,
  },
  {
    word: 'acquisition',
    tags: ['ビジネス名詞'],
    question: 'The ___ of the smaller firm helped the company expand quickly.',
    choices: [
      { key: 'A', text: 'warranty' },
      { key: 'B', text: 'acquisition' },
      { key: 'C', text: 'submission' },
      { key: 'D', text: 'inspection' },
    ],
    answer: 'B',
    explanation:
      '「小規模な会社の買収」はacquisition of the firmが自然。submission（提出）・inspection（検査）・warranty（保証）はいずれも会社を「拡大させる」文脈に合わない。',
    translation: 'その小規模な会社の買収により、会社は急速に拡大した。',
    difficulty: 3,
  },
  {
    word: 'acquisition',
    tags: ['ビジネス名詞'],
    question: 'Shareholders approved the ___ at yesterday’s meeting.',
    choices: [
      { key: 'A', text: 'acquisition' },
      { key: 'B', text: 'certification' },
      { key: 'C', text: 'subscription' },
      { key: 'D', text: 'extension' },
    ],
    answer: 'A',
    explanation:
      '株主総会で承認される対象として自然なのはacquisition（買収）。certification（認定）・subscription（購読）・extension（延長）は株主総会の承認事項として不自然。',
    translation: '株主は昨日の会議でその買収を承認した。',
    difficulty: 3,
  },
  {
    word: 'acquisition',
    tags: ['ビジネス名詞'],
    question: 'The ___ gave the company access to new technology.',
    choices: [
      { key: 'A', text: 'budget' },
      { key: 'B', text: 'quality' },
      { key: 'C', text: 'candidate' },
      { key: 'D', text: 'acquisition' },
    ],
    answer: 'D',
    explanation:
      '新技術へのアクセスをもたらすのはacquisition（買収）。budget（予算）・quality（品質）・candidate（候補者）はいずれも技術取得の主体にならない。',
    translation: 'その買収により会社は新しい技術を利用できるようになった。',
    difficulty: 2,
  },
  {
    word: 'budget',
    tags: ['ビジネス名詞'],
    question: 'The marketing department stayed within its ___ this quarter.',
    choices: [
      { key: 'A', text: 'merger' },
      { key: 'B', text: 'candidate' },
      { key: 'C', text: 'budget' },
      { key: 'D', text: 'warranty' },
    ],
    answer: 'C',
    explanation:
      '"stay within a budget"（予算内に収める）は定番表現。warranty（保証書）・merger（合併）・candidate（候補者）は「収める」対象にならない。',
    translation: 'マーケティング部門は今四半期、予算内に収めた。',
    difficulty: 1,
  },
  {
    word: 'budget',
    tags: ['前置詞コロケーション'],
    question: 'We need approval before increasing the ___ for this project.',
    choices: [
      { key: 'A', text: 'certification' },
      { key: 'B', text: 'strategy' },
      { key: 'C', text: 'budget' },
      { key: 'D', text: 'account' },
    ],
    answer: 'C',
    explanation:
      '「増額する」対象として自然なのはbudget（予算）。account（口座）・certification（認定）・strategy（戦略）は増額する対象として不自然。',
    translation: 'このプロジェクトの予算を増やす前に承認が必要だ。',
    difficulty: 2,
  },
  {
    word: 'budget',
    tags: ['ビジネス名詞'],
    question: 'The finance team prepared next year’s ___ in October.',
    choices: [
      { key: 'A', text: 'inspection' },
      { key: 'B', text: 'endorsement' },
      { key: 'C', text: 'budget' },
      { key: 'D', text: 'acquisition' },
    ],
    answer: 'C',
    explanation:
      '財務チームが準備するのはbudget（予算）。acquisition（買収）・inspection（検査）・endorsement（推薦）は財務チームが毎年準備するものではない。',
    translation: '財務チームは来年度の予算を10月に準備した。',
    difficulty: 2,
  },
  {
    word: 'candidate',
    tags: ['ビジネス名詞'],
    question: 'Each ___ was asked to complete a short written test.',
    choices: [
      { key: 'A', text: 'warranty' },
      { key: 'B', text: 'merger' },
      { key: 'C', text: 'candidate' },
      { key: 'D', text: 'budget' },
    ],
    answer: 'C',
    explanation:
      '筆記試験を受けるのはcandidate（候補者）。budget（予算）・warranty（保証書）・merger（合併）は試験を受ける主体になれない。',
    translation: '各候補者は短い筆記試験を受けるよう求められた。',
    difficulty: 1,
  },
  {
    word: 'candidate',
    tags: ['ビジネス名詞'],
    question: 'The hiring committee interviewed five ___ for the position.',
    choices: [
      { key: 'A', text: 'inspections' },
      { key: 'B', text: 'proposals' },
      { key: 'C', text: 'candidates' },
      { key: 'D', text: 'subscriptions' },
    ],
    answer: 'C',
    explanation:
      '採用委員会が面接するのはcandidates（候補者）。subscriptions（購読）・inspections（検査）・proposals（提案書）は面接の対象にならない。',
    translation: '採用委員会はその職に5名の候補者を面接した。',
    difficulty: 2,
  },
  {
    word: 'candidate',
    tags: ['ビジネス名詞'],
    question: 'Only one ___ met all the required qualifications.',
    choices: [
      { key: 'A', text: 'extension' },
      { key: 'B', text: 'candidate' },
      { key: 'C', text: 'account' },
      { key: 'D', text: 'strategy' },
    ],
    answer: 'B',
    explanation:
      '必須資格を満たすのはcandidate（候補者）。account（口座）・strategy（戦略）・extension（延長）は資格を持つ主体にならない。',
    translation: '必要な資格を全て満たした候補者は1名だけだった。',
    difficulty: 2,
  },
  {
    word: 'certification',
    tags: ['ビジネス名詞'],
    question: 'She earned a professional ___ after completing the course.',
    choices: [
      { key: 'A', text: 'candidate' },
      { key: 'B', text: 'certification' },
      { key: 'C', text: 'merger' },
      { key: 'D', text: 'budget' },
    ],
    answer: 'B',
    explanation:
      '講座修了後に得るのはcertification（認定）。merger（合併）・budget（予算）・candidate（候補者）は講座修了で得られるものではない。',
    translation: '彼女は講座を修了した後、専門認定を取得した。',
    difficulty: 2,
  },
  {
    word: 'certification',
    tags: ['ビジネス名詞'],
    question: 'The factory received ___ for meeting safety standards.',
    choices: [
      { key: 'A', text: 'extension' },
      { key: 'B', text: 'warranty' },
      { key: 'C', text: 'certification' },
      { key: 'D', text: 'proposal' },
    ],
    answer: 'C',
    explanation:
      '安全基準を満たして得るのはcertification（認定）。proposal（提案書）・extension（延長）・warranty（保証書）は安全基準達成の証にならない。',
    translation: 'その工場は安全基準を満たして認定を受けた。',
    difficulty: 2,
  },
  {
    word: 'certification',
    tags: ['ビジネス名詞'],
    question: 'This ___ must be renewed every three years.',
    choices: [
      { key: 'A', text: 'acquisition' },
      { key: 'B', text: 'account' },
      { key: 'C', text: 'strategy' },
      { key: 'D', text: 'certification' },
    ],
    answer: 'D',
    explanation:
      '3年ごとに更新するのはcertification（認定）。acquisition（買収）・account（口座）・strategy（戦略）は「更新」の対象として不自然。',
    translation: 'この認定は3年ごとに更新しなければならない。',
    difficulty: 2,
  },
  {
    word: 'endorsement',
    tags: ['ビジネス名詞'],
    question: 'The company secured a celebrity ___ for its new product.',
    choices: [
      { key: 'A', text: 'inspection' },
      { key: 'B', text: 'budget' },
      { key: 'C', text: 'account' },
      { key: 'D', text: 'endorsement' },
    ],
    answer: 'D',
    explanation:
      '有名人から得るのはendorsement（宣伝起用・推薦）。inspection（検査）・budget（予算）・account（口座）は有名人が提供するものではない。',
    translation: '会社は新製品のために有名人の宣伝起用を獲得した。',
    difficulty: 3,
  },
  {
    word: 'endorsement',
    tags: ['ビジネス名詞'],
    question: 'The athlete’s ___ deal was reported in the news.',
    choices: [
      { key: 'A', text: 'certification' },
      { key: 'B', text: 'merger' },
      { key: 'C', text: 'proposal' },
      { key: 'D', text: 'endorsement' },
    ],
    answer: 'D',
    explanation:
      '複合名詞"endorsement deal"（宣伝起用契約）が正しい。certification（認定）・merger（合併）・proposal（提案書）はdealの前に置いても自然な複合語にならない。',
    translation: 'その選手の宣伝起用契約がニュースで報じられた。',
    difficulty: 3,
  },
  {
    word: 'endorsement',
    tags: ['ビジネス名詞'],
    question: 'A strong ___ from a trusted brand can boost sales.',
    choices: [
      { key: 'A', text: 'warranty' },
      { key: 'B', text: 'candidate' },
      { key: 'C', text: 'endorsement' },
      { key: 'D', text: 'extension' },
    ],
    answer: 'C',
    explanation:
      '信頼されるブランドから得て売上を伸ばすのはendorsement（推薦・宣伝）。extension（延長）・warranty（保証書）・candidate（候補者）は売上を直接押し上げる推薦にならない。',
    translation: '信頼されるブランドからの強い推薦は売上を押し上げることがある。',
    difficulty: 3,
  },
  {
    word: 'extension',
    tags: ['ビジネス名詞'],
    question: 'The bank agreed to give the client a short ___ on the loan repayment.',
    choices: [
      { key: 'A', text: 'merger' },
      { key: 'B', text: 'certification' },
      { key: 'C', text: 'account' },
      { key: 'D', text: 'extension' },
    ],
    answer: 'D',
    explanation:
      'ローン返済に対して銀行が与えるのはextension（延長）。merger（合併）・certification（認定）・account（口座）はローン返済に対して与えるものではない。',
    translation: '銀行は顧客にローン返済の短期延長を認めることに合意した。',
    difficulty: 2,
  },
  {
    word: 'extension',
    tags: ['ビジネス名詞'],
    question: 'The landlord granted a one-month ___ on the lease.',
    choices: [
      { key: 'A', text: 'extension' },
      { key: 'B', text: 'acquisition' },
      { key: 'C', text: 'budget' },
      { key: 'D', text: 'candidate' },
    ],
    answer: 'A',
    explanation:
      '賃貸契約に対して大家が認めるのはextension（延長）。acquisition（買収）・budget（予算）・candidate（候補者）は賃貸契約に対して認められるものではない。',
    translation: '大家は賃貸契約の1ヶ月延長を認めた。',
    difficulty: 2,
  },
  {
    word: 'extension',
    tags: ['ビジネス名詞'],
    question: 'Employees may apply for a short ___ of their leave.',
    choices: [
      { key: 'A', text: 'inspection' },
      { key: 'B', text: 'subscription' },
      { key: 'C', text: 'extension' },
      { key: 'D', text: 'proposal' },
    ],
    answer: 'C',
    explanation:
      '休暇に対して申請するのはextension（延長）。proposal（提案書）・inspection（検査）・subscription（購読）は休暇の延長として申請するものではない。',
    translation: '従業員は休暇の短期延長を申請できる。',
    difficulty: 2,
  },
  {
    word: 'inspection',
    tags: ['ビジネス名詞'],
    question: 'The factory passed its annual safety ___.',
    choices: [
      { key: 'A', text: 'budget' },
      { key: 'B', text: 'endorsement' },
      { key: 'C', text: 'inspection' },
      { key: 'D', text: 'merger' },
    ],
    answer: 'C',
    explanation:
      '工場が「合格する」対象はinspection（検査）。merger（合併）・budget（予算）・endorsement（推薦）は合格の対象にならない。',
    translation: 'その工場は年次安全検査に合格した。',
    difficulty: 2,
  },
  {
    word: 'inspection',
    tags: ['ビジネス名詞'],
    question: 'An ___ revealed several minor defects in the shipment.',
    choices: [
      { key: 'A', text: 'inspection' },
      { key: 'B', text: 'proposal' },
      { key: 'C', text: 'subscription' },
      { key: 'D', text: 'strategy' },
    ],
    answer: 'A',
    explanation:
      '欠陥を明らかにするのはinspection（検査）。proposal（提案書）・subscription（購読）・strategy（戦略）は欠陥を発見する行為にならない。',
    translation: '検査により出荷分にいくつかの軽微な欠陥が見つかった。',
    difficulty: 2,
  },
  {
    word: 'inspection',
    tags: ['ビジネス名詞'],
    question: 'The building requires a full ___ before the sale.',
    choices: [
      { key: 'A', text: 'extension' },
      { key: 'B', text: 'certification' },
      { key: 'C', text: 'inspection' },
      { key: 'D', text: 'acquisition' },
    ],
    answer: 'C',
    explanation:
      '売却前に建物に必要なのはinspection（検査）。acquisition（買収）・extension（延長）・certification（認定）は売却前の必須手続きとして不自然。',
    translation: 'その建物は売却前に全面的な検査が必要だ。',
    difficulty: 2,
  },
  {
    word: 'liability',
    tags: ['ビジネス名詞'],
    question: 'The contractor’s insurance covers ___ for any accidental damage on site.',
    choices: [
      { key: 'A', text: 'liability' },
      { key: 'B', text: 'warranty' },
      { key: 'C', text: 'budget' },
      { key: 'D', text: 'candidate' },
    ],
    answer: 'A',
    explanation:
      '現場での偶発的な損害に対して保険がカバーするのはliability（責任）。warranty（保証書）・budget（予算）・candidate（候補者）は保険がカバーする対象にならない。',
    translation: '請負業者の保険は現場での偶発的な損害に対する責任をカバーしている。',
    difficulty: 3,
  },
  {
    word: 'liability',
    tags: ['ビジネス名詞'],
    question: 'Signing the contract without review could create legal ___.',
    choices: [
      { key: 'A', text: 'liability' },
      { key: 'B', text: 'certification' },
      { key: 'C', text: 'merger' },
      { key: 'D', text: 'proposal' },
    ],
    answer: 'A',
    explanation:
      '確認せずに契約すると生じかねないのはliability（責任・法的責任）。certification（認定）・merger（合併）・proposal（提案書）は契約リスクとして生じるものではない。',
    translation: '確認せずに契約書に署名すると法的責任が生じる可能性がある。',
    difficulty: 3,
  },
  {
    word: 'liability',
    tags: ['ビジネス名詞'],
    question: 'The firm limited its ___ by including a clear disclaimer.',
    choices: [
      { key: 'A', text: 'extension' },
      { key: 'B', text: 'inspection' },
      { key: 'C', text: 'liability' },
      { key: 'D', text: 'subscription' },
    ],
    answer: 'C',
    explanation:
      '免責事項によって制限するのはliability（責任）。subscription（購読）・extension（延長）・inspection（検査）は免責事項で制限する対象にならない。',
    translation: 'その会社は明確な免責事項を含めることで責任を限定した。',
    difficulty: 3,
  },
  {
    word: 'merger',
    tags: ['ビジネス名詞'],
    question: 'Industry analysts had predicted the ___ months before it was confirmed.',
    choices: [
      { key: 'A', text: 'merger' },
      { key: 'B', text: 'certification' },
      { key: 'C', text: 'budget' },
      { key: 'D', text: 'candidate' },
    ],
    answer: 'A',
    explanation:
      'アナリストが事前に予測していたのはmerger（合併）。certification（認定）・budget（予算）・candidate（候補者）は業界アナリストが予測する企業間の出来事ではない。',
    translation: '業界アナリストはその合併を、確定する何ヶ月も前から予測していた。',
    difficulty: 2,
  },
  {
    word: 'merger',
    tags: ['ビジネス名詞'],
    question: 'Employees worried about job security after the ___.',
    choices: [
      { key: 'A', text: 'inspection' },
      { key: 'B', text: 'endorsement' },
      { key: 'C', text: 'merger' },
      { key: 'D', text: 'extension' },
    ],
    answer: 'C',
    explanation:
      '雇用不安の原因になり得るのはmerger（合併）。extension（延長）・inspection（検査）・endorsement（推薦）は雇用不安の典型的な原因にならない。',
    translation: '従業員は合併後の雇用の安定を心配した。',
    difficulty: 2,
  },
  {
    word: 'merger',
    tags: ['ビジネス名詞'],
    question: 'The ___ created one of the largest companies in the industry.',
    choices: [
      { key: 'A', text: 'merger' },
      { key: 'B', text: 'subscription' },
      { key: 'C', text: 'proposal' },
      { key: 'D', text: 'account' },
    ],
    answer: 'A',
    explanation:
      '業界最大級の会社を生み出したのはmerger（合併）。subscription（購読）・proposal（提案書）・account（口座）は会社を生み出す出来事にならない。',
    translation: 'その合併により業界最大級の企業の一つが誕生した。',
    difficulty: 2,
  },
  {
    word: 'negotiate',
    tags: ['頻出動詞'],
    question: 'The buyers were able to ___ a fair price for both sides.',
    choices: [
      { key: 'A', text: 'subscribe' },
      { key: 'B', text: 'certify' },
      { key: 'C', text: 'negotiate' },
      { key: 'D', text: 'inspect' },
    ],
    answer: 'C',
    explanation:
      '双方にとって公正な価格を導き出すのはnegotiate（交渉する）。inspect（検査する）・subscribe（購読する）・certify（認定する）は価格を決める行為にならない。',
    translation: 'バイヤーたちは両者にとって公正な価格を交渉することができた。',
    difficulty: 2,
  },
  {
    word: 'negotiate',
    tags: ['頻出動詞'],
    question: 'Both sides agreed to ___ rather than go to court.',
    choices: [
      { key: 'A', text: 'merge' },
      { key: 'B', text: 'endorse' },
      { key: 'C', text: 'certify' },
      { key: 'D', text: 'negotiate' },
    ],
    answer: 'D',
    explanation:
      '裁判の代わりに選ぶのはnegotiate（交渉する）。merge（合併する）・endorse（推薦する）・certify（認定する）は裁判の代替手段にならない。',
    translation: '両者は裁判に訴える代わりに交渉することに合意した。',
    difficulty: 2,
  },
  {
    word: 'negotiate',
    tags: ['頻出動詞'],
    question: 'The union will ___ better wages with management.',
    choices: [
      { key: 'A', text: 'negotiate' },
      { key: 'B', text: 'inspect' },
      { key: 'C', text: 'extend' },
      { key: 'D', text: 'endorse' },
    ],
    answer: 'A',
    explanation:
      '経営陣とより良い賃金を求めて行うのはnegotiate（交渉する）。inspect（検査する）・extend（延長する）・endorse（推薦する）は賃金交渉の行為にならない。',
    translation: '組合は経営陣とより良い賃金を交渉する予定だ。',
    difficulty: 2,
  },
  {
    word: 'projection',
    tags: ['ビジネス名詞'],
    question: 'Financial ___ for the next quarter looked promising.',
    choices: [
      { key: 'A', text: 'subscriptions' },
      { key: 'B', text: 'extensions' },
      { key: 'C', text: 'projections' },
      { key: 'D', text: 'inspections' },
    ],
    answer: 'C',
    explanation:
      '複合名詞"financial projections"（財務予測）が正しい。inspections（検査）・subscriptions（購読）・extensions（延長）はfinancialの後に続く語として不自然。',
    translation: '来四半期の財務予測は有望に見えた。',
    difficulty: 2,
  },
  {
    word: 'projection',
    tags: ['ビジネス名詞'],
    question: 'The sales ___ was based on last year’s data.',
    choices: [
      { key: 'A', text: 'merger' },
      { key: 'B', text: 'candidate' },
      { key: 'C', text: 'warranty' },
      { key: 'D', text: 'projection' },
    ],
    answer: 'D',
    explanation:
      '前年のデータを基に作るのはprojection（予測）。merger（合併）・candidate（候補者）・warranty（保証書）はデータを基に作られるものではない。',
    translation: 'その売上予測は前年のデータに基づいていた。',
    difficulty: 2,
  },
  {
    word: 'projection',
    tags: ['ビジネス名詞'],
    question: 'Analysts revised their growth ___ downward.',
    choices: [
      { key: 'A', text: 'liability' },
      { key: 'B', text: 'account' },
      { key: 'C', text: 'projection' },
      { key: 'D', text: 'certification' },
    ],
    answer: 'C',
    explanation:
      'アナリストが下方修正するのはprojection（予測）。certification（認定）・liability（責任）・account（口座）は下方修正する対象にならない。',
    translation: 'アナリストは成長予測を下方修正した。',
    difficulty: 3,
  },
  {
    word: 'promotion',
    tags: ['ビジネス名詞'],
    question: 'After five years with the firm, he was finally offered a ___.',
    choices: [
      { key: 'A', text: 'promotion' },
      { key: 'B', text: 'inspection' },
      { key: 'C', text: 'subscription' },
      { key: 'D', text: 'extension' },
    ],
    answer: 'A',
    explanation:
      '5年間の勤務の末に提示されるのはpromotion（昇進）。inspection（検査）・subscription（購読）・extension（延長）は勤続年数の末に提示されるものではない。',
    translation: 'その会社に5年間勤めた後、彼はついに昇進を打診された。',
    difficulty: 1,
  },
  {
    word: 'promotion',
    tags: ['ビジネス名詞'],
    question: 'His hard work finally led to a well-deserved ___.',
    choices: [
      { key: 'A', text: 'merger' },
      { key: 'B', text: 'budget' },
      { key: 'C', text: 'certification' },
      { key: 'D', text: 'promotion' },
    ],
    answer: 'D',
    explanation:
      '努力の結果として得るのはpromotion（昇進）。merger（合併）・budget（予算）・certification（認定）は個人の努力の直接の結果として得るものではない。',
    translation: '彼の努力はついに当然の昇進につながった。',
    difficulty: 2,
  },
  {
    word: 'promotion',
    tags: ['ビジネス名詞'],
    question: 'The company announced several ___ within the sales team.',
    choices: [
      { key: 'A', text: 'proposals' },
      { key: 'B', text: 'accounts' },
      { key: 'C', text: 'promotions' },
      { key: 'D', text: 'liabilities' },
    ],
    answer: 'C',
    explanation:
      '営業チーム内で発表されるのはpromotions（昇進）。liabilities（責任）・proposals（提案書）・accounts（口座）は人事発表として不自然。',
    translation: '会社は営業チーム内でいくつかの昇進を発表した。',
    difficulty: 2,
  },
  {
    word: 'proposal',
    tags: ['ビジネス名詞'],
    question: 'The consulting firm submitted a detailed ___.',
    choices: [
      { key: 'A', text: 'inspection' },
      { key: 'B', text: 'certification' },
      { key: 'C', text: 'merger' },
      { key: 'D', text: 'proposal' },
    ],
    answer: 'D',
    explanation:
      'コンサル会社が提出するのはproposal（提案書）。inspection（検査）・certification（認定）・merger（合併）はコンサル会社が「提出する」ものではない。',
    translation: 'コンサルティング会社は詳細な提案書を提出した。',
    difficulty: 2,
  },
  {
    word: 'proposal',
    tags: ['ビジネス名詞'],
    question: 'The board rejected the ___ due to high costs.',
    choices: [
      { key: 'A', text: 'candidate' },
      { key: 'B', text: 'subscription' },
      { key: 'C', text: 'extension' },
      { key: 'D', text: 'proposal' },
    ],
    answer: 'D',
    explanation:
      '取締役会がコスト理由で却下するのはproposal（提案書）。candidate（候補者）・subscription（購読）・extension（延長）はコスト理由で却下される文脈に合わない。',
    translation: '取締役会はコストの高さを理由にその提案を却下した。',
    difficulty: 2,
  },
  {
    word: 'proposal',
    tags: ['ビジネス名詞'],
    question: 'Please review the ___ before our meeting on Friday.',
    choices: [
      { key: 'A', text: 'account' },
      { key: 'B', text: 'proposal' },
      { key: 'C', text: 'liability' },
      { key: 'D', text: 'endorsement' },
    ],
    answer: 'B',
    explanation:
      '会議前に確認するよう依頼されるのはproposal（提案書）。liability（責任）・endorsement（推薦）・account（口座）は会議前に確認する資料として不自然。',
    translation: '金曜日の会議の前にその提案書を確認してください。',
    difficulty: 1,
  },
  {
    word: 'quality',
    tags: ['ビジネス名詞'],
    question: 'Customers praised the ___ of the new product line.',
    choices: [
      { key: 'A', text: 'budget' },
      { key: 'B', text: 'candidate' },
      { key: 'C', text: 'merger' },
      { key: 'D', text: 'quality' },
    ],
    answer: 'D',
    explanation:
      '顧客が称賛するのはquality（品質）。budget（予算）・candidate（候補者）・merger（合併）は製品ラインについて顧客が称賛するものではない。',
    translation: '顧客は新製品ラインの品質を称賛した。',
    difficulty: 1,
  },
  {
    word: 'quality',
    tags: ['ビジネス名詞'],
    question: 'The factory improved product ___ after the audit.',
    choices: [
      { key: 'A', text: 'subscription' },
      { key: 'B', text: 'proposal' },
      { key: 'C', text: 'quality' },
      { key: 'D', text: 'extension' },
    ],
    answer: 'C',
    explanation:
      '複合名詞"product quality"（製品品質）が正しい。extension（延長）・subscription（購読）・proposal（提案書）はproductの後に続く語として不自然。',
    translation: 'その工場は監査の後、製品品質を改善した。',
    difficulty: 2,
  },
  {
    word: 'quality',
    tags: ['ビジネス名詞'],
    question: 'This material is known for its high ___.',
    choices: [
      { key: 'A', text: 'acquisition' },
      { key: 'B', text: 'quality' },
      { key: 'C', text: 'liability' },
      { key: 'D', text: 'certification' },
    ],
    answer: 'B',
    explanation:
      '素材が「高いこと」で知られるのはquality（品質）。liability（責任）・certification（認定）・acquisition（買収）は素材の特性として不自然。',
    translation: 'この素材は高品質であることで知られている。',
    difficulty: 1,
  },
  {
    word: 'strategy',
    tags: ['ビジネス名詞'],
    question: 'The company adopted a new marketing ___ this year.',
    choices: [
      { key: 'A', text: 'candidate' },
      { key: 'B', text: 'strategy' },
      { key: 'C', text: 'inspection' },
      { key: 'D', text: 'warranty' },
    ],
    answer: 'B',
    explanation:
      '複合名詞"marketing strategy"（マーケティング戦略）が正しい。inspection（検査）・warranty（保証書）・candidate（候補者）はmarketingの後に続く語として不自然。',
    translation: 'その会社は今年、新しいマーケティング戦略を採用した。',
    difficulty: 2,
  },
  {
    word: 'strategy',
    tags: ['ビジネス名詞'],
    question: 'Management is reviewing its long-term business ___.',
    choices: [
      { key: 'A', text: 'endorsement' },
      { key: 'B', text: 'extension' },
      { key: 'C', text: 'strategy' },
      { key: 'D', text: 'subscription' },
    ],
    answer: 'C',
    explanation:
      '経営陣が見直すのはstrategy（戦略）。subscription（購読）・endorsement（推薦）・extension（延長）は経営陣が見直す長期方針にならない。',
    translation: '経営陣は長期的な事業戦略を見直している。',
    difficulty: 2,
  },
  {
    word: 'strategy',
    tags: ['ビジネス名詞'],
    question: 'A clear ___ helped the team meet its goals.',
    choices: [
      { key: 'A', text: 'liability' },
      { key: 'B', text: 'merger' },
      { key: 'C', text: 'certification' },
      { key: 'D', text: 'strategy' },
    ],
    answer: 'D',
    explanation:
      'チームが目標達成する助けになるのはstrategy（戦略）。liability（責任）・merger（合併）・certification（認定）はチームの目標達成を助ける計画にならない。',
    translation: '明確な戦略がチームの目標達成を助けた。',
    difficulty: 2,
  },
  {
    word: 'submit',
    tags: ['頻出動詞'],
    question: 'Please ___ your tax documents before the end of the month.',
    choices: [
      { key: 'A', text: 'endorse' },
      { key: 'B', text: 'submit' },
      { key: 'C', text: 'inspect' },
      { key: 'D', text: 'negotiate' },
    ],
    answer: 'B',
    explanation:
      '書類を月末までに行う動作はsubmit（提出する）。inspect（検査する）・negotiate（交渉する）・endorse（推薦する）は書類提出の場面に合わない。',
    translation: '月末までに税務書類を提出してください。',
    difficulty: 2,
  },
  {
    word: 'submit',
    tags: ['頻出動詞'],
    question: 'All manuscripts must be ___ electronically for review.',
    choices: [
      { key: 'A', text: 'inspected' },
      { key: 'B', text: 'negotiated' },
      { key: 'C', text: 'endorsed' },
      { key: 'D', text: 'submitted' },
    ],
    answer: 'D',
    explanation:
      '審査のために電子的に行う動作はsubmitted（提出される）。inspected（検査される）・negotiated（交渉される）・endorsed（推薦される）は原稿の審査提出の文脈に合わない。',
    translation: 'すべての原稿は審査のため電子的に提出されなければならない。',
    difficulty: 2,
  },
  {
    word: 'submit',
    tags: ['頻出動詞'],
    question: 'Employees are asked to ___ expense claims within a week of travel.',
    choices: [
      { key: 'A', text: 'subscribe' },
      { key: 'B', text: 'negotiate' },
      { key: 'C', text: 'submit' },
      { key: 'D', text: 'merge' },
    ],
    answer: 'C',
    explanation:
      '経費申請を出張後1週間以内に行う動作はsubmit（提出する）。merge（合併する）・subscribe（購読する）・negotiate（交渉する）は経費申請の場面に合わない。',
    translation: '従業員は出張後1週間以内に経費申請を提出するよう求められる。',
    difficulty: 2,
  },
  {
    word: 'subscription',
    tags: ['ビジネス名詞'],
    question: 'New members get a discounted ___ for their first year.',
    choices: [
      { key: 'A', text: 'liability' },
      { key: 'B', text: 'merger' },
      { key: 'C', text: 'subscription' },
      { key: 'D', text: 'certification' },
    ],
    answer: 'C',
    explanation:
      '初年度に割引価格で提供されるのはsubscription（購読・利用契約）。certification（認定）・liability（責任）・merger（合併）は割引価格で提供される契約にならない。',
    translation: '新規会員は初年度、割引価格の購読を利用できる。',
    difficulty: 2,
  },
  {
    word: 'subscription',
    tags: ['ビジネス名詞'],
    question: 'The company canceled its software ___ to cut costs.',
    choices: [
      { key: 'A', text: 'acquisition' },
      { key: 'B', text: 'extension' },
      { key: 'C', text: 'proposal' },
      { key: 'D', text: 'subscription' },
    ],
    answer: 'D',
    explanation:
      'コスト削減のために解約するのはsubscription（購読・利用契約）。acquisition（買収）・extension（延長）・proposal（提案書）はソフトウェアの利用契約として解約する対象ではない。',
    translation: '会社はコスト削減のためにソフトウェアの利用契約を解約した。',
    difficulty: 2,
  },
  {
    word: 'subscription',
    tags: ['ビジネス名詞'],
    question: 'Customers can renew their ___ online.',
    choices: [
      { key: 'A', text: 'inspection' },
      { key: 'B', text: 'budget' },
      { key: 'C', text: 'strategy' },
      { key: 'D', text: 'subscription' },
    ],
    answer: 'D',
    explanation:
      'オンラインで更新できるのはsubscription（購読）。inspection（検査）・budget（予算）・strategy（戦略）はオンラインで更新する契約対象ではない。',
    translation: '顧客はオンラインで購読を更新できる。',
    difficulty: 1,
  },
  {
    word: 'warranty',
    tags: ['ビジネス名詞'],
    question: 'Ask the sales representative whether an extended ___ is available.',
    choices: [
      { key: 'A', text: 'candidate' },
      { key: 'B', text: 'warranty' },
      { key: 'C', text: 'subscription' },
      { key: 'D', text: 'proposal' },
    ],
    answer: 'B',
    explanation:
      '延長できるか販売担当者に尋ねるのはwarranty（保証）。subscription（購読）・proposal（提案書）・candidate（候補者）は「延長できるか」を尋ねる対象にならない。',
    translation: '延長保証が利用できるか販売担当者に尋ねてください。',
    difficulty: 2,
  },
  {
    word: 'warranty',
    tags: ['ビジネス名詞'],
    question: 'The store honored the ___ and repaired the item for free.',
    choices: [
      { key: 'A', text: 'warranty' },
      { key: 'B', text: 'merger' },
      { key: 'C', text: 'certification' },
      { key: 'D', text: 'account' },
    ],
    answer: 'A',
    explanation:
      '店が守って無料修理するのはwarranty（保証）。merger（合併）・certification（認定）・account（口座）は店が「守る」ことで無料修理につながるものではない。',
    translation: '店は保証を守り、無料で商品を修理した。',
    difficulty: 2,
  },
  {
    word: 'warranty',
    tags: ['ビジネス名詞'],
    question: 'Please keep your receipt in case you need the ___.',
    choices: [
      { key: 'A', text: 'endorsement' },
      { key: 'B', text: 'warranty' },
      { key: 'C', text: 'liability' },
      { key: 'D', text: 'extension' },
    ],
    answer: 'B',
    explanation:
      '領収書と一緒に必要になり得るのはwarranty（保証）。liability（責任）・extension（延長）・endorsement（推薦）は領収書とセットで必要になるものではない。',
    translation: '保証が必要になる場合に備えて、領収書を保管しておいてください。',
    difficulty: 1,
  },
]
