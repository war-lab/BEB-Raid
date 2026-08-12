// Part3/4・ディクテーション追加40本のデータ本体（T-84。正本: docs/15 T-84行・14の3.4節）。
// dictationS.tsと同じ規約: 全問tags[0]='弱形・連結'固定・1文8〜14語・blanks 1〜3穴
// （弱形になりやすい機能語を穴にする）。tags[1]は穴の内容に応じたサブタグ（T-82・J-41）:
// 助動詞弱形（モーダル・助動詞の弱形化）・冠詞・前置詞（a/an/the/to/for/from/at/in/with/
// within/on/before等の弱形化）・音の連結（and/than/if/your/this/her+母音等の連結）の3種。
// keyVocabWordはS/A/B語彙カード（600語）から選び、scriptに文字列として実在する語のみを使う
// （dictationS.tsの既存40語とは重複しない新規40語を選定した）。

export interface DictationRawEntry {
  keyVocabWord: string
  tags: string[]
  script: string
  blanks: { index: number; answer: string }[]
  explanation: string
  translation: string
  difficulty: number
}

export const DICTATION_ENTRIES_S2: DictationRawEntry[] = [
  {
    keyVocabWord: 'agenda',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'The agenda for the meeting was sent to everyone this morning.',
    blanks: [
      { index: 5, answer: 'was' },
      { index: 7, answer: 'to' },
    ],
    explanation: '弱形になりやすいwas/toを穴にしている。',
    translation: '会議の議題は今朝、全員に送られた。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'logistics',
    tags: ['弱形・連結', '音の連結'],
    script: 'The logistics team and the warehouse staff met this afternoon.',
    blanks: [
      { index: 3, answer: 'and' },
      { index: 8, answer: 'this' },
    ],
    explanation: '弱形になりやすいand/thisを穴にしている。',
    translation: '物流チームと倉庫のスタッフは今日の午後に会った。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'turnover',
    tags: ['弱形・連結', '冠詞・前置詞'],
    script: 'The company reported a rise in staff turnover this year.',
    blanks: [
      { index: 3, answer: 'a' },
      { index: 5, answer: 'in' },
    ],
    explanation: '弱形になりやすいa/inを穴にしている。',
    translation: 'その会社は今年、離職率の上昇を報告した。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'workforce',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'The workforce is expected to grow by ten percent next year.',
    blanks: [
      { index: 2, answer: 'is' },
      { index: 4, answer: 'to' },
    ],
    explanation: '弱形になりやすいis/toを穴にしている。',
    translation: '従業員数は来年10パーセント増える見込みだ。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'headcount',
    tags: ['弱形・連結', '音の連結'],
    script: 'The department froze its headcount and postponed the hiring plan.',
    blanks: [
      { index: 5, answer: 'and' },
      { index: 7, answer: 'the' },
    ],
    explanation: '弱形になりやすいand/theを穴にしている。',
    translation: 'その部署は人員数を凍結し、採用計画を延期した。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'proposal',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'The client should review the proposal before Friday afternoon.',
    blanks: [
      { index: 2, answer: 'should' },
      { index: 6, answer: 'before' },
    ],
    explanation: '弱形になりやすいshould/beforeを穴にしている。',
    translation: '顧客は金曜日の午後までにその提案書を確認すべきだ。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'attachment',
    tags: ['弱形・連結', '冠詞・前置詞'],
    script: 'Please open the attachment for the updated schedule.',
    blanks: [
      { index: 2, answer: 'the' },
      { index: 4, answer: 'for' },
    ],
    explanation: '弱形になりやすいthe/forを穴にしている。',
    translation: '更新されたスケジュールについては添付ファイルを開いてください。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'inventory',
    tags: ['弱形・連結', '音の連結'],
    script: 'We counted the inventory and updated the records last night.',
    blanks: [
      { index: 2, answer: 'the' },
      { index: 4, answer: 'and' },
    ],
    explanation: '弱形になりやすいthe/andを穴にしている。',
    translation: '私たちは昨夜、在庫を数えて記録を更新した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'procurement',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'The procurement team is responsible for all vendor contracts.',
    blanks: [
      { index: 3, answer: 'is' },
      { index: 5, answer: 'for' },
    ],
    explanation: '弱形になりやすいis/forを穴にしている。',
    translation: '調達チームはすべての業者契約に責任を持つ。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'conference',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'She has already registered for the annual conference.',
    blanks: [
      { index: 1, answer: 'has' },
      { index: 4, answer: 'for' },
    ],
    explanation: '弱形になりやすいhas/forを穴にしている。',
    translation: '彼女はすでに年次会議に登録済みだ。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'complaint',
    tags: ['弱形・連結', '冠詞・前置詞'],
    script: 'The manager handled the complaint within a few minutes.',
    blanks: [
      { index: 3, answer: 'the' },
      { index: 5, answer: 'within' },
    ],
    explanation: '弱形になりやすいthe/withinを穴にしている。',
    translation: '部長はその苦情に数分以内に対応した。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'endorsement',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'The product will need an endorsement from a well-known athlete.',
    blanks: [
      { index: 2, answer: 'will' },
      { index: 6, answer: 'from' },
    ],
    explanation: '弱形になりやすいwill/fromを穴にしている。',
    translation: 'その製品には有名なアスリートによる推薦が必要になるだろう。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'subsidy',
    tags: ['弱形・連結', '助動詞弱形'],
    // クロスレビュー: may は弱形を持たない助動詞のため、弱形 /kən/ を持つ can へ差し替え（要音声再生成）
    script: 'Small businesses can qualify for a government subsidy.',
    blanks: [
      { index: 2, answer: 'can' },
      { index: 4, answer: 'for' },
    ],
    explanation: '弱形になりやすいcan/forを穴にしている。',
    translation: '中小企業は政府の補助金を受ける資格があるかもしれない。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'testimonial',
    tags: ['弱形・連結', '音の連結'],
    script: 'A happy customer wrote a testimonial and shared it online.',
    blanks: [
      { index: 6, answer: 'and' },
      { index: 8, answer: 'it' },
    ],
    explanation: '弱形になりやすいand/itを穴にしている。',
    translation: '満足した顧客が推薦の声を書き、それをネット上で共有した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'benchmark',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'The results were measured against an industry benchmark.',
    blanks: [
      { index: 2, answer: 'were' },
      { index: 4, answer: 'against' },
    ],
    explanation: '弱形になりやすいwere/againstを穴にしている。',
    translation: 'その結果は業界の基準と照らして測定された。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'liability',
    tags: ['弱形・連結', '助動詞弱形'],
    // クロスレビュー: might は弱形を持たない助動詞のため、弱形 /kəd/ を持つ could へ差し替え（要音声再生成）
    script: 'The company could face liability if the claim is proven.',
    blanks: [
      { index: 2, answer: 'could' },
      { index: 8, answer: 'is' },
    ],
    explanation: '弱形になりやすいcould/isを穴にしている。',
    translation: 'その申し立てが立証されれば、その会社は法的責任を負うかもしれない。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'retirement',
    tags: ['弱形・連結', '音の連結'],
    script: 'Staff choosing early retirement will receive a pension and extended health coverage.',
    blanks: [
      { index: 4, answer: 'will' },
      { index: 8, answer: 'and' },
    ],
    explanation: '弱形になりやすいwill/andを穴にしている。',
    translation: '早期退職を選ぶ従業員は年金と延長された健康保険を受け取る。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'utility',
    tags: ['弱形・連結', '冠詞・前置詞'],
    script: 'Tenants pay their own utility bills at the end of the month.',
    blanks: [
      { index: 2, answer: 'their' },
      { index: 6, answer: 'at' },
    ],
    explanation: '弱形になりやすいtheir/atを穴にしている。',
    translation: '入居者は月末に自分で公共料金を支払う。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'deposit',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'Guests must leave a deposit before checking into the room.',
    blanks: [
      { index: 1, answer: 'must' },
      { index: 5, answer: 'before' },
    ],
    explanation: '弱形になりやすいmust/beforeを穴にしている。',
    translation: '宿泊客は部屋にチェックインする前に保証金を預けなければならない。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'permit',
    tags: ['弱形・連結', '冠詞・前置詞'],
    script: 'The contractor needs a permit for the rooftop construction work.',
    blanks: [
      { index: 3, answer: 'a' },
      { index: 5, answer: 'for' },
    ],
    explanation: '弱形になりやすいa/forを穴にしている。',
    translation: 'その請負業者は屋上の建設作業のために許可証を必要としている。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'printer',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'The printer is broken and should be replaced soon.',
    blanks: [
      { index: 2, answer: 'is' },
      { index: 5, answer: 'should' },
    ],
    explanation: '弱形になりやすいis/shouldを穴にしている。',
    translation: 'そのプリンターは故障しており、近く交換されるべきだ。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'survey',
    tags: ['弱形・連結', '冠詞・前置詞'],
    script: 'Customers can complete the survey in under five minutes.',
    blanks: [
      { index: 3, answer: 'the' },
      { index: 5, answer: 'in' },
    ],
    explanation: '弱形になりやすいthe/inを穴にしている。',
    translation: '顧客は5分もかからずにその調査を完了できる。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'overhead',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'The new office will reduce overhead and improve efficiency.',
    blanks: [
      { index: 3, answer: 'will' },
      { index: 6, answer: 'and' },
    ],
    explanation: '弱形になりやすいwill/andを穴にしている。',
    translation: '新しいオフィスは諸経費を削減し、効率を改善するだろう。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'wage',
    tags: ['弱形・連結', '冠詞・前置詞'],
    script: 'The state raised the minimum wage for all workers.',
    blanks: [
      { index: 3, answer: 'the' },
      { index: 6, answer: 'for' },
    ],
    explanation: '弱形になりやすいthe/forを穴にしている。',
    translation: '州はすべての労働者の最低賃金を引き上げた。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'pension',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'Retired staff can access their pension after they turn sixty.',
    // クロスレビュー: they は弱形を持たないため、弱形 /ðər/ を持つ their(index 4) へ穴を付け替える
    // （script自体は不変＝音声再生成は不要）
    blanks: [
      { index: 2, answer: 'can' },
      { index: 4, answer: 'their' },
    ],
    explanation: '弱形になりやすいcan/theirを穴にしている。',
    translation: '退職した職員は60歳になった後、年金を受け取れる。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'probation',
    tags: ['弱形・連結', '冠詞・前置詞'],
    script: 'New hires remain on probation for the first ninety days.',
    blanks: [
      { index: 3, answer: 'on' },
      { index: 5, answer: 'for' },
    ],
    explanation: '弱形になりやすいon/forを穴にしている。',
    translation: '新入社員は最初の90日間は試用期間にある。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'resume',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'She has updated her resume and sent it to the recruiter.',
    blanks: [
      { index: 1, answer: 'has' },
      { index: 5, answer: 'and' },
    ],
    explanation: '弱形になりやすいhas/andを穴にしている。',
    translation: '彼女は履歴書を更新し、採用担当者に送った。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'transcript',
    tags: ['弱形・連結', '冠詞・前置詞'],
    script: 'The university will mail an official transcript to the employer.',
    blanks: [
      { index: 4, answer: 'an' },
      { index: 7, answer: 'to' },
    ],
    explanation: '弱形になりやすいan/toを穴にしている。',
    translation: '大学は公式の成績証明書を雇用主に郵送する予定だ。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'photocopier',
    tags: ['弱形・連結', '音の連結'],
    script: 'The photocopier and the scanner are on the third floor.',
    blanks: [
      { index: 2, answer: 'and' },
      { index: 5, answer: 'are' },
    ],
    explanation: '弱形になりやすいand/areを穴にしている。',
    translation: 'コピー機とスキャナーは3階にある。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'stationery',
    tags: ['弱形・連結', '冠詞・前置詞'],
    script: 'The office ordered new stationery for the coming quarter.',
    blanks: [
      { index: 5, answer: 'for' },
      { index: 6, answer: 'the' },
    ],
    explanation: '弱形になりやすいfor/theを穴にしている。',
    translation: 'オフィスは来る四半期のために新しい文房具を注文した。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'courier',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'A courier will deliver the documents before noon tomorrow.',
    blanks: [
      { index: 2, answer: 'will' },
      { index: 6, answer: 'before' },
    ],
    explanation: '弱形になりやすいwill/beforeを穴にしている。',
    translation: '配送業者が明日の正午前にその書類を届ける予定だ。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'dispatch',
    tags: ['弱形・連結', '音の連結'],
    script: 'The warehouse will dispatch the order and confirm it by email.',
    blanks: [
      { index: 2, answer: 'will' },
      { index: 8, answer: 'it' },
    ],
    explanation: '弱形になりやすいwill/itを穴にしている。',
    translation: '倉庫はその注文を発送し、メールで確認する予定だ。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'discount',
    tags: ['弱形・連結', '冠詞・前置詞'],
    script: 'Members receive a discount on every purchase over fifty dollars.',
    blanks: [
      { index: 2, answer: 'a' },
      { index: 4, answer: 'on' },
    ],
    explanation: '弱形になりやすいa/onを穴にしている。',
    translation: '会員は50ドルを超えるすべての購入に割引を受ける。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'markup',
    tags: ['弱形・連結', '助動詞弱形'],
    // クロスレビュー: 「主語+must+…+before」型の反復（40本中before穴6件）を緩和するため
    // 第2穴を before→to（別前置詞）へ。scriptを書き換えるため要音声再生成
    script: 'The retailer must reveal its markup to the customer.',
    blanks: [
      { index: 2, answer: 'must' },
      { index: 6, answer: 'to' },
    ],
    explanation: '弱形になりやすいmust/toを穴にしている。',
    translation: 'その小売業者は顧客に利幅を明かさなければならない。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'vacancy',
    tags: ['弱形・連結', '冠詞・前置詞'],
    script: 'The hotel advertised a vacancy for a front desk position.',
    blanks: [
      { index: 3, answer: 'a' },
      { index: 5, answer: 'for' },
    ],
    explanation: '弱形になりやすいa/forを穴にしている。',
    translation: 'そのホテルはフロント係の欠員の求人を出した。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'tenant',
    tags: ['弱形・連結', '助動詞弱形'],
    // クロスレビュー: must+before 反復の緩和のため第2穴を before→at（別前置詞）へ。要音声再生成
    script: 'Each tenant must sign the lease at the office.',
    blanks: [
      { index: 2, answer: 'must' },
      { index: 6, answer: 'at' },
    ],
    explanation: '弱形になりやすいmust/atを穴にしている。',
    translation: '各入居者は事務所で賃貸契約書に署名しなければならない。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'lease',
    tags: ['弱形・連結', '冠詞・前置詞'],
    script: 'The company renewed the lease for another three years.',
    blanks: [
      { index: 3, answer: 'the' },
      { index: 5, answer: 'for' },
    ],
    explanation: '弱形になりやすいthe/forを穴にしている。',
    translation: 'その会社は賃貸契約をさらに3年間更新した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'zoning',
    tags: ['弱形・連結', '助動詞弱形'],
    script: 'The developer will need a zoning permit before construction starts.',
    blanks: [
      { index: 2, answer: 'will' },
      { index: 7, answer: 'before' },
    ],
    explanation: '弱形になりやすいwill/beforeを穴にしている。',
    translation: 'その開発業者は着工前に用途地域の許可証が必要になるだろう。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'sponsor',
    tags: ['弱形・連結', '冠詞・前置詞'],
    script: 'A local bank agreed to sponsor the charity marathon this year.',
    blanks: [
      { index: 4, answer: 'to' },
      { index: 9, answer: 'this' },
    ],
    explanation: '弱形になりやすいto/thisを穴にしている。',
    translation: '地元の銀行が今年のチャリティーマラソンを後援することに同意した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'reimbursement',
    tags: ['弱形・連結', '音の連結'],
    script: 'Employees can request reimbursement and attach the original receipt.',
    blanks: [
      { index: 1, answer: 'can' },
      { index: 4, answer: 'and' },
    ],
    explanation: '弱形になりやすいcan/andを穴にしている。',
    translation: '従業員は払い戻しを請求し、原本の領収書を添付できる。',
    difficulty: 3,
  },
]
