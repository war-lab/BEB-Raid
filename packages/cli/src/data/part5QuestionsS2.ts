// Part5（text_blank）追加100問のデータ本体（M2・T-61。正本: docs/13 3.10節、docs/03 7.1節）。
// keyVocabWordはS/A/B語彙カード（600語）から選び、単語帳との循環を成立させる
// （T-28のSランク50問と重複しない語を選定）。
// tags[0]は文法系タグ必須（品詞/動詞の形/代名詞・関係詞/接続詞vs前置詞/比較）。
// 5分類を各20問ずつ均等配分し、各分類最低10問の完了条件を満たす。
// 正答キーはcorrectText/distractorsの形で書き、part5Question.tsのrotatePart5Choicesが
// index%4の決定的ローテーションでA〜Dへの機械的な分散を行う（著者は正答位置を気にしない）。
// 空所記法は"___"に統一（実装指示3。バリデータとの整合）。

export interface Part5RawEntry {
  keyVocabWord: string
  tags: string[]
  question: string
  correctText: string
  distractors: readonly [string, string, string]
  explanation: string
  translation: string
  difficulty: number
}

export const PART5_ENTRIES_S2_RAW: Part5RawEntry[] = [
  // --- 品詞（名詞 vs 動詞の各活用形。文に既に主動詞があるため空所は名詞専用） ---
  {
    keyVocabWord: 'revise',
    tags: ['品詞'],
    question: 'The client requested a full ___ of the contract terms.',
    correctText: 'revision',
    distractors: ['revise', 'revising', 'revised'],
    explanation:
      '空所はrequestedの目的語となる名詞。revisionが正しい。reviseは動詞原形、revisingは動名詞/現在分詞、revisedは過去形/過去分詞で、名詞の位置には合わない。',
    translation: '顧客は契約条件の全面的な改訂を求めた。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'differentiate',
    tags: ['品詞'],
    question: 'The team achieved clear ___ between the two product lines.',
    correctText: 'differentiation',
    distractors: ['differentiate', 'differentiating', 'differentiated'],
    explanation:
      '空所はachievedの目的語となる名詞。differentiationが正しい。他の3つは動詞の活用形で、名詞の位置には合わない。',
    translation: 'チームは2つの製品ラインの間で明確な差別化を実現した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'diversify',
    tags: ['品詞'],
    question: "Investors welcomed the fund's recent ___ into new markets.",
    correctText: 'diversification',
    distractors: ['diversify', 'diversifying', 'diversified'],
    explanation:
      "空所は所有格the fund'sと形容詞recentの後に続く名詞。diversificationが正しい。他の3つは動詞の活用形で、名詞の位置には合わない。",
    translation: '投資家たちはそのファンドの新市場への最近の多角化を歓迎した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'consolidate',
    tags: ['品詞'],
    question: 'The merger led to significant ___ within the industry.',
    correctText: 'consolidation',
    distractors: ['consolidate', 'consolidating', 'consolidated'],
    explanation:
      '空所はled toの目的語となる名詞。significant（形容詞）の後に続く。consolidationが正しく、他の3つは動詞の活用形で名詞の位置には合わない。',
    translation: 'その合併により業界内で大幅な統合が進んだ。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'automate',
    tags: ['品詞'],
    question: 'The factory invested heavily in ___ last year.',
    correctText: 'automation',
    distractors: ['automate', 'automatic', 'automated'],
    explanation:
      '空所は前置詞inの目的語となる名詞。automationが正しい。automateは動詞原形、automaticは形容詞、automatedは過去形/過去分詞で、前置詞の後の名詞位置にはいずれも合わない。',
    translation: 'その工場は昨年、自動化に多額の投資をした。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'standardize',
    tags: ['品詞'],
    question: 'The new manual ensures ___ across all branches.',
    correctText: 'standardization',
    distractors: ['standardize', 'standardizing', 'standardized'],
    explanation:
      '空所はensuresの目的語となる名詞。standardizationが正しい。他の3つは動詞の活用形で、名詞の位置には合わない。',
    translation: 'その新しいマニュアルは全支店における標準化を確実にする。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'optimize',
    tags: ['品詞'],
    question: 'The engineers focused on route ___ this quarter.',
    correctText: 'optimization',
    distractors: ['optimize', 'optimizing', 'optimized'],
    explanation:
      '空所は複合名詞route ___の後半部分。optimizationが正しい。他の3つは動詞の活用形で、複合名詞の位置には合わない。',
    translation: 'エンジニアたちは今四半期、経路の最適化に注力した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'compensate',
    tags: ['品詞'],
    question: 'The airline offered full ___ for the delay.',
    correctText: 'compensation',
    distractors: ['compensate', 'compensating', 'compensated'],
    explanation:
      '空所はofferedの目的語となる名詞。compensationが正しい。他の3つは動詞の活用形で、名詞の位置には合わない。',
    translation: '航空会社は遅延に対して全額の補償を提示した。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'escalate',
    tags: ['品詞'],
    question: 'The dispute reached a level of ___ no one expected.',
    correctText: 'escalation',
    distractors: ['escalate', 'escalating', 'escalated'],
    explanation:
      '空所は前置詞ofの目的語となる名詞。escalationが正しい。他の3つは動詞の活用形で、前置詞の後の名詞位置には合わない。',
    translation: 'その紛争は誰も予想しなかったレベルにまで激化した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'reconcile',
    tags: ['品詞'],
    question: 'The accountant completed the monthly ___ ahead of schedule.',
    correctText: 'reconciliation',
    distractors: ['reconcile', 'reconciling', 'reconciled'],
    explanation:
      '空所はcompletedの目的語となる名詞。reconciliationが正しい。他の3つは動詞の活用形で、名詞の位置には合わない。',
    translation: 'その経理担当者は月次の照合作業を予定より早く終えた。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'mediate',
    tags: ['品詞'],
    question: 'Both parties agreed to professional ___ before going to court.',
    correctText: 'mediation',
    distractors: ['mediate', 'mediating', 'mediated'],
    explanation:
      '空所はagreed toの目的語となる名詞。mediationが正しい。他の3つは動詞の活用形で、名詞の位置には合わない。',
    translation: '双方は提訴する前に専門家による調停に合意した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'calibrate',
    tags: ['品詞'],
    question: 'Technicians perform daily ___ of the equipment.',
    correctText: 'calibration',
    distractors: ['calibrate', 'calibrating', 'calibrated'],
    explanation:
      '空所はperformの目的語となる名詞。calibrationが正しい。他の3つは動詞の活用形で、名詞の位置には合わない。',
    translation: '技術者たちは毎日、設備の較正を行っている。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'integrate',
    tags: ['品詞'],
    question: "The two teams celebrated the successful system ___ at Friday's meeting.",
    correctText: 'integration',
    distractors: ['integrate', 'integrating', 'integrated'],
    explanation:
      '空所は複合名詞system ___の後半部分。integrationが正しい。他の3つは動詞の活用形で、複合名詞の位置には合わない。',
    translation: '2つのチームは金曜日の会議で、システム統合の成功を祝った。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'saturate',
    tags: ['品詞'],
    question: 'Analysts warned about market ___ in the smartphone industry.',
    correctText: 'saturation',
    distractors: ['saturate', 'saturating', 'saturated'],
    explanation:
      '空所は複合名詞market ___の後半部分。saturationが正しい。他の3つは動詞の活用形で、複合名詞の位置には合わない。',
    translation: 'アナリストたちはスマートフォン業界の市場飽和について警告した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'proliferate',
    tags: ['品詞'],
    question: 'The report discussed the ___ of online retailers.',
    correctText: 'proliferation',
    distractors: ['proliferate', 'proliferating', 'proliferated'],
    explanation:
      '空所は前置詞ofの前にある定冠詞theに続く名詞。proliferationが正しい。他の3つは動詞の活用形で、名詞の位置には合わない。',
    translation: 'その報告書はオンライン小売業者の急増について論じていた。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'codify',
    tags: ['品詞'],
    question: 'The committee proposed the ___ of informal procedures.',
    correctText: 'codification',
    distractors: ['codify', 'codifying', 'codified'],
    explanation:
      '空所は定冠詞theに続く名詞。codificationが正しい。他の3つは動詞の活用形で、名詞の位置には合わない。',
    translation: '委員会は非公式な手順を成文化することを提案した。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'substantiate',
    tags: ['品詞'],
    question: 'The claim required further ___ before approval.',
    correctText: 'substantiation',
    distractors: ['substantiate', 'substantiating', 'substantiated'],
    explanation:
      '空所は形容詞furtherに続く名詞。substantiationが正しい。他の3つは動詞の活用形で、名詞の位置には合わない。',
    translation: 'その主張は承認前にさらなる立証を必要とした。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'rectify',
    tags: ['品詞'],
    question: 'The bank promised immediate ___ of the billing error.',
    correctText: 'rectification',
    distractors: ['rectify', 'rectifying', 'rectified'],
    explanation:
      '空所は形容詞immediateに続く名詞。rectificationが正しい。他の3つは動詞の活用形で、名詞の位置には合わない。',
    translation: '銀行は請求ミスの即時是正を約束した。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'mitigate',
    tags: ['品詞'],
    question: 'The plan includes several strategies for risk ___.',
    correctText: 'mitigation',
    distractors: ['mitigate', 'mitigating', 'mitigated'],
    explanation:
      '空所は複合名詞risk ___の後半部分。mitigationが正しい。他の3つは動詞の活用形で、複合名詞の位置には合わない。',
    translation: 'その計画にはリスク軽減のためのいくつかの戦略が含まれている。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'disseminate',
    tags: ['品詞'],
    question: 'The department was responsible for the ___ of updated guidelines.',
    correctText: 'dissemination',
    distractors: ['disseminate', 'disseminating', 'disseminated'],
    explanation:
      '空所は定冠詞theに続く名詞。disseminationが正しい。他の3つは動詞の活用形で、名詞の位置には合わない。',
    translation: 'その部署は更新されたガイドラインの周知を担当していた。',
    difficulty: 4,
  },

  // --- 動詞の形（to不定詞・法助動詞・命令文の後は動詞の原形） ---
  {
    keyVocabWord: 'procure',
    tags: ['動詞の形'],
    question: 'The purchasing team is authorized to ___ new equipment without additional approval.',
    correctText: 'procure',
    distractors: ['procurement', 'procuring', 'procured'],
    explanation:
      'to不定詞の後は動詞の原形が続くため、procureが正しい。procurementは名詞、procuringは動名詞/現在分詞、procuredは過去形/過去分詞で、to不定詞の形に合わない。',
    translation: '購買チームは追加承認なしに新しい機器を調達する権限を持つ。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'expedite',
    tags: ['動詞の形'],
    question: 'Please ___ this order as soon as possible.',
    correctText: 'expedite',
    distractors: ['expedited', 'expediting', 'expeditiously'],
    explanation:
      '命令文のため動詞の原形expediteが正しい。expeditedは過去形/過去分詞、expeditingは動名詞/現在分詞、expeditiouslyは副詞で、命令文の主動詞としては使えない。',
    translation: 'この注文をできるだけ早く処理してください。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'streamline',
    tags: ['動詞の形'],
    question: 'Management decided to ___ the approval process.',
    correctText: 'streamline',
    distractors: ['streamlined', 'streamlining', 'streamlines'],
    explanation:
      'to不定詞の後は動詞の原形が続くため、streamlineが正しい。streamlinedは過去形/過去分詞、streamliningは動名詞/現在分詞、streamlinesは3人称単数現在形で、いずれもto不定詞の形に合わない。',
    translation: '経営陣は承認プロセスを合理化することを決めた。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'downsize',
    tags: ['動詞の形'],
    question: 'The company had no choice but to ___ its overseas operations.',
    correctText: 'downsize',
    distractors: ['downsized', 'downsizing', 'downsizes'],
    explanation:
      'to不定詞の後は動詞の原形が続くため、downsizeが正しい。他の3つは活用形で、to不定詞の形に合わない。',
    translation: 'その会社は海外事業を縮小せざるを得なかった。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'restructure',
    tags: ['動詞の形'],
    question: 'The board voted to ___ the sales division.',
    correctText: 'restructure',
    distractors: ['restructured', 'restructuring', 'restructures'],
    explanation:
      'to不定詞の後は動詞の原形が続くため、restructureが正しい。他の3つは活用形で、to不定詞の形に合わない。',
    translation: '取締役会は営業部門を再編することを議決した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'retrofit',
    tags: ['動詞の形'],
    question: 'The city plans to ___ older buildings with better insulation.',
    correctText: 'retrofit',
    distractors: ['retrofitted', 'retrofitting', 'retrofits'],
    explanation:
      'to不定詞の後は動詞の原形が続くため、retrofitが正しい。他の3つは活用形で、to不定詞の形に合わない。',
    translation: '市は古い建物により良い断熱材を後付けする計画だ。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'decommission',
    tags: ['動詞の形'],
    question: 'Engineers will ___ the old server next month.',
    correctText: 'decommission',
    distractors: ['decommissioned', 'decommissioning', 'decommissions'],
    explanation:
      '法助動詞willの後は動詞の原形が続くため、decommissionが正しい。他の3つは活用形で、willの後の形に合わない。',
    translation: 'エンジニアたちは来月、古いサーバーを廃止する予定だ。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'curtail',
    tags: ['動詞の形'],
    question: 'Management decided to ___ non-essential travel until the budget improved.',
    correctText: 'curtail',
    distractors: ['curtailed', 'curtailing', 'curtailment'],
    explanation:
      'to不定詞の後は動詞の原形が続くため、curtailが正しい。curtailmentは名詞、他の2つは活用形で、to不定詞の形に合わない。',
    translation: '経営陣は予算が改善するまで不要不急の出張を削減することを決めた。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'leverage',
    tags: ['動詞の形'],
    question: 'The startup plans to ___ its investor network to win new clients.',
    correctText: 'leverage',
    distractors: ['leveraged', 'leveraging', 'leverages'],
    explanation:
      'to不定詞の後は動詞の原形が続くため、leverageが正しい。他の3つは活用形で、to不定詞の形に合わない。',
    translation: 'そのスタートアップは投資家ネットワークを活用して新規顧客を獲得する計画だ。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'incentivize',
    tags: ['動詞の形'],
    question: 'The firm hopes to ___ early sign-ups with a discount.',
    correctText: 'incentivize',
    distractors: ['incentivized', 'incentivizing', 'incentive'],
    explanation:
      'to不定詞の後は動詞の原形が続くため、incentivizeが正しい。incentiveは名詞、他の2つは活用形で、to不定詞の形に合わない。',
    translation: 'その会社は割引で早期登録を促進したいと考えている。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'retain',
    tags: ['動詞の形'],
    question: 'The company must ___ its top talent to stay competitive.',
    correctText: 'retain',
    distractors: ['retained', 'retaining', 'retention'],
    explanation:
      '法助動詞mustの後は動詞の原形が続くため、retainが正しい。retentionは名詞、他の2つは活用形で、mustの後の形に合わない。',
    translation: '競争力を維持するため、その会社は優秀な人材をつなぎ止めなければならない。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'alienate',
    tags: ['動詞の形'],
    question: 'Executives were careful not to ___ long-time customers with the new pricing.',
    correctText: 'alienate',
    distractors: ['alienated', 'alienating', 'alienation'],
    explanation:
      'to不定詞の後は動詞の原形が続くため、alienateが正しい。alienationは名詞、他の2つは活用形で、to不定詞の形に合わない。',
    translation: '経営幹部たちは新しい価格設定で長年の顧客の反感を買わないよう注意した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'appease',
    tags: ['動詞の形'],
    question: 'The manager tried to ___ the upset customer with a refund.',
    correctText: 'appease',
    distractors: ['appeased', 'appeasing', 'appeasement'],
    explanation:
      'to不定詞の後は動詞の原形が続くため、appeaseが正しい。appeasementは名詞、他の2つは活用形で、to不定詞の形に合わない。',
    translation: 'マネージャーは返金によって腹を立てた顧客をなだめようとした。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'indemnify',
    tags: ['動詞の形'],
    question: 'The supplier agreed to ___ the retailer for any defects.',
    correctText: 'indemnify',
    distractors: ['indemnified', 'indemnifying', 'indemnity'],
    explanation:
      'to不定詞の後は動詞の原形が続くため、indemnifyが正しい。indemnityは名詞、他の2つは活用形で、to不定詞の形に合わない。',
    translation: '仕入先はいかなる欠陥についても小売業者に補償することに同意した。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'embark',
    tags: ['動詞の形'],
    question: 'Passengers were asked to ___ thirty minutes before departure.',
    correctText: 'embark',
    distractors: ['embarked', 'embarking', 'embarkation'],
    explanation:
      'to不定詞の後は動詞の原形が続くため、embarkが正しい。embarkationは名詞、他の2つは活用形で、to不定詞の形に合わない。',
    translation: '乗客は出発の30分前に乗船するよう求められた。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'disembark',
    tags: ['動詞の形'],
    question: 'Passengers must ___ through the rear door during this stop.',
    correctText: 'disembark',
    distractors: ['disembarked', 'disembarking', 'disembarkation'],
    explanation:
      '法助動詞mustの後は動詞の原形が続くため、disembarkが正しい。disembarkationは名詞、他の2つは活用形で、mustの後の形に合わない。',
    translation: 'この停車中、乗客は後方のドアから降りなければならない。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'repatriate',
    tags: ['動詞の形'],
    question: 'The company arranged to ___ staff during the crisis.',
    correctText: 'repatriate',
    distractors: ['repatriated', 'repatriating', 'repatriation'],
    explanation:
      'to不定詞の後は動詞の原形が続くため、repatriateが正しい。repatriationは名詞、他の2つは活用形で、to不定詞の形に合わない。',
    translation: '会社は危機の間、従業員を本国へ送還する手配をした。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'deprecate',
    tags: ['動詞の形'],
    question: "Developers plan to ___ the old API by year's end.",
    correctText: 'deprecate',
    distractors: ['deprecated', 'deprecating', 'deprecation'],
    explanation:
      'to不定詞の後は動詞の原形が続くため、deprecateが正しい。deprecationは名詞、他の2つは活用形で、to不定詞の形に合わない。',
    translation: '開発者たちは年末までに古いAPIを非推奨にする計画だ。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'synchronize',
    tags: ['動詞の形'],
    question: 'Employees can ___ their calendars across devices.',
    correctText: 'synchronize',
    distractors: ['synchronized', 'synchronizing', 'synchronization'],
    explanation:
      '法助動詞canの後は動詞の原形が続くため、synchronizeが正しい。synchronizationは名詞、他の2つは活用形で、canの後の形に合わない。',
    translation: '従業員は複数のデバイス間でカレンダーを同期させることができる。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'configure',
    tags: ['動詞の形'],
    question: 'IT staff will ___ the new laptops before distribution.',
    correctText: 'configure',
    distractors: ['configured', 'configuring', 'configuration'],
    explanation:
      '法助動詞willの後は動詞の原形が続くため、configureが正しい。configurationは名詞、他の2つは活用形で、willの後の形に合わない。',
    translation: 'IT担当者は配布前に新しいノートパソコンを設定する。',
    difficulty: 2,
  },

  // --- 代名詞・関係詞（関係代名詞who/whom/whose/whichの選択） ---
  {
    keyVocabWord: 'shareholder',
    tags: ['代名詞・関係詞'],
    question: 'The shareholder ___ raised the objection was not present at the vote.',
    correctText: 'who',
    distractors: ['whom', 'whose', 'which'],
    explanation:
      '主格の関係代名詞whoが正しい（後ろに動詞raisedが続く）。whomは目的格、whoseは所有格、whichは物を指す関係代名詞で、人物の主格には使えない。',
    translation: '異議を唱えたその株主は投票に出席していなかった。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'tenant',
    tags: ['代名詞・関係詞'],
    question: 'The tenant ___ the landlord evicted has filed a complaint.',
    correctText: 'whom',
    distractors: ['where', 'whose', 'which'],
    explanation:
      '目的格の関係代名詞whomが正しい（the landlord evictedのevictedの目的語）。whoseは所有格、whichは物を指す関係代名詞、whereは場所を指す関係副詞で、いずれも合わない。',
    translation: '大家が立ち退かせたその借家人は苦情を申し立てた。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'landlord',
    tags: ['代名詞・関係詞'],
    question: 'The landlord ___ property was damaged filed an insurance claim.',
    correctText: 'whose',
    distractors: ['who', 'whom', 'which'],
    explanation:
      '所有格の関係代名詞whoseが正しい（後ろにproperty=名詞が続き所有関係を示す）。who/whomは人物を直接指す主格/目的格、whichは物を指す関係代名詞で、所有関係を表せない。',
    translation: '所有物件が損傷したその大家は保険金を請求した。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'applicant',
    tags: ['代名詞・関係詞'],
    question: 'The applicant ___ submitted the strongest portfolio was hired immediately.',
    correctText: 'who',
    distractors: ['whom', 'whose', 'which'],
    explanation:
      '主格の関係代名詞whoが正しい（後ろに動詞submittedが続く）。whomは目的格、whoseは所有格、whichは物を指し、人物の主格には使えない。',
    translation: '最も優れたポートフォリオを提出した応募者はすぐに採用された。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'contractor',
    tags: ['代名詞・関係詞'],
    question: 'The contractor ___ we hired finished the project early.',
    correctText: 'whom',
    distractors: ['whose', 'when', 'where'],
    explanation:
      '目的格の関係代名詞whom（口語ではwhoも可）が正しい（we hiredのhiredの目的語）。whoseは所有格、when/whereはそれぞれ時・場所を指す関係副詞で、いずれも合わない。',
    translation: '我々が雇ったその請負業者はプロジェクトを早期に完了させた。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'subcontractor',
    tags: ['代名詞・関係詞'],
    question: 'The subcontractor ___ team caused the delay was replaced.',
    correctText: 'whose',
    distractors: ['who', 'whom', 'which'],
    explanation:
      '所有格の関係代名詞whoseが正しい（後ろにteam=名詞が続き所有関係を示す）。who/whomは人物を直接指す主格/目的格、whichは物を指す関係代名詞で、所有関係を表せない。',
    translation: 'チームが遅延の原因となったその下請け業者は交代させられた。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'plaintiff',
    tags: ['代名詞・関係詞'],
    question: 'The plaintiff ___ filed the lawsuit withdrew the case.',
    correctText: 'who',
    distractors: ['whom', 'whose', 'which'],
    explanation:
      '主格の関係代名詞whoが正しい（後ろに動詞filedが続く）。whomは目的格、whoseは所有格、whichは物を指し、人物の主格には使えない。',
    translation: '訴訟を起こした原告は訴えを取り下げた。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'defendant',
    tags: ['代名詞・関係詞'],
    question: 'The defendant ___ the jury acquitted left the courtroom in tears.',
    correctText: 'whom',
    distractors: ['whose', 'which', 'where'],
    explanation:
      '目的格の関係代名詞whom（口語ではwhoも可）が正しい（the jury acquittedのacquittedの目的語）。whoseは所有格、whichは物を指す、whereは関係副詞で、いずれも合わない。',
    translation: '陪審が無罪とした被告人は涙を流しながら法廷を後にした。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'dignitary',
    tags: ['代名詞・関係詞'],
    question: 'The dignitary ___ attended the ceremony gave a brief speech.',
    correctText: 'who',
    distractors: ['whom', 'whose', 'which'],
    explanation:
      '主格の関係代名詞whoが正しい（後ろに動詞attendedが続く）。whomは目的格、whoseは所有格、whichは物を指し、人物の主格には使えない。',
    translation: '式典に出席したその要人は短いスピーチを行った。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'sponsor',
    tags: ['代名詞・関係詞'],
    question: 'The sponsor ___ logo appeared on every banner funded the entire event.',
    correctText: 'whose',
    distractors: ['who', 'whom', 'which'],
    explanation:
      '所有格の関係代名詞whoseが正しい（後ろにlogo=名詞が続き所有関係を示す）。who/whomは人物を直接指す主格/目的格、whichは物を指す関係代名詞で、所有関係を表せない。',
    translation: 'ロゴが全ての横断幕に載っていたそのスポンサーがイベント全体に資金を提供した。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'exhibitor',
    tags: ['代名詞・関係詞'],
    question: 'The exhibitor ___ won the innovation award thanked the organizers.',
    correctText: 'who',
    distractors: ['whom', 'whose', 'where'],
    explanation:
      '主格の関係代名詞whoが正しい（後ろに動詞wonが続く）。whomは目的格、whoseは所有格、whereは場所を指す関係副詞で、いずれも主格の位置には使えない。',
    translation: '革新賞を受賞したその出展者は主催者に感謝した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'attendee',
    tags: ['代名詞・関係詞'],
    question: 'The attendee ___ we interviewed praised the keynote speech.',
    correctText: 'whom',
    distractors: ['whose', 'which', 'where'],
    explanation:
      '目的格の関係代名詞whom（口語ではwhoも可）が正しい（we interviewedのinterviewedの目的語）。whoseは所有格、whichは物を指す、whereは関係副詞で、いずれも合わない。',
    translation: '我々がインタビューしたその参加者は基調講演を称賛した。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'invitee',
    tags: ['代名詞・関係詞'],
    question: 'The invitee ___ RSVP arrived late was seated at the back.',
    correctText: 'whose',
    distractors: ['who', 'whom', 'which'],
    explanation:
      '所有格の関係代名詞whoseが正しい（後ろにRSVP=名詞が続き所有関係を示す）。who/whomは人物を直接指す主格/目的格、whichは物を指す関係代名詞で、所有関係を表せない。',
    translation: '出欠の返信が遅れたその招待客は後方の席に案内された。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'franchisee',
    tags: ['代名詞・関係詞'],
    question: 'The franchisee ___ opened the newest location reported strong sales.',
    correctText: 'who',
    distractors: ['whom', 'whose', 'where'],
    explanation:
      '主格の関係代名詞whoが正しい（後ろに動詞openedが続く）。whomは目的格、whoseは所有格、whereは場所を指す関係副詞で、いずれも主格の位置には使えない。',
    translation: '最新の店舗を開いた加盟店主は好調な売上を報告した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'personnel',
    tags: ['代名詞・関係詞'],
    question: 'The personnel ___ manage the new system received special training.',
    correctText: 'who',
    distractors: ['whom', 'whose', 'which'],
    explanation:
      '主格の関係代名詞whoが正しい（後ろに動詞manageが続く。personnelは人を表す集合名詞）。whomは目的格、whoseは所有格、whichは物を指し、人物の主格には使えない。',
    translation: '新しいシステムを管理する職員は特別な研修を受けた。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'headcount',
    tags: ['代名詞・関係詞'],
    question: 'The headcount increase, ___ surprised everyone, was announced last week.',
    correctText: 'which',
    distractors: ['who', 'whom', 'whose'],
    explanation:
      '先行詞headcount increase（物・事柄）を受ける主格の関係代名詞whichが正しい。who/whomは人物を指す関係代名詞、whoseは所有格で、物を先行詞にする主格には使えない。',
    translation: '皆を驚かせたその増員は先週発表された。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'subsidiary',
    tags: ['代名詞・関係詞'],
    question: 'The subsidiary ___ was acquired last year is now profitable.',
    correctText: 'which',
    distractors: ['who', 'whom', 'whose'],
    explanation:
      '先行詞subsidiary（物・組織）を受ける主格の関係代名詞whichが正しい（後ろに動詞wasが続く）。who/whomは人物を指す関係代名詞、whoseは所有格で、物を先行詞にする主格には使えない。',
    translation: '昨年買収されたその子会社は今では黒字である。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'workforce',
    tags: ['代名詞・関係詞'],
    question: 'The workforce ___ the merger affected was mostly in manufacturing.',
    correctText: 'which',
    distractors: ['who', 'where', 'whose'],
    explanation:
      '先行詞workforce（集合的に見た組織・集団）を受ける目的格の関係代名詞whichが正しい（the merger affectedのaffectedの目的語）。whoは人物を指す関係代名詞、whereは場所を指す関係副詞、whoseは所有格で、いずれも合わない。',
    translation: 'その合併の影響を受けた労働力は主に製造部門にいた。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'retailer',
    tags: ['代名詞・関係詞'],
    question: 'The retailer ___ dominates the online market keeps cutting prices.',
    correctText: 'which',
    distractors: ['where', 'whom', 'whose'],
    explanation:
      '先行詞retailer（組織・企業）を受ける主格の関係代名詞whichが正しい（後ろに動詞dominatesが続く）。whereは場所を指す関係副詞、whomは目的格、whoseは所有格で、いずれも主格の位置には使えない。',
    translation: 'オンライン市場を支配しているその小売業者は値下げを続けている。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'wholesaler',
    tags: ['代名詞・関係詞'],
    question: 'The wholesaler ___ prices are the lowest supplies most local shops.',
    correctText: 'whose',
    distractors: ['who', 'whom', 'which'],
    explanation:
      '所有格の関係代名詞whoseが正しい（後ろにprices=名詞が続き所有関係を示す。whoseは人・物どちらにも使える）。who/whomは人物を直接指す主格/目的格、whichは所有関係を単独では表せない。',
    translation: '価格が最も低いその卸売業者はほとんどの地元店舗に供給している。',
    difficulty: 4,
  },

  // --- 接続詞vs前置詞（because/because of・although/despite・since/due to等） ---
  {
    keyVocabWord: 'deficit',
    tags: ['接続詞vs前置詞'],
    question: 'The department cut costs ___ the deficit continued to grow.',
    correctText: 'because',
    distractors: ['because of', 'despite', 'due to'],
    explanation:
      '空所の後は節（the deficit continued to grow）なので接続詞becauseが正しい。because of/due toは名詞句が必要な前置詞、despiteは意味が逆（〜にもかかわらず）で合わない。',
    translation: '赤字が拡大し続けたため、その部署は経費を削減した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'surplus',
    tags: ['接続詞vs前置詞'],
    question: 'The company invested in new equipment ___ it had a budget surplus this year.',
    correctText: 'because',
    distractors: ['because of', 'despite', 'due to'],
    explanation:
      '空所の後は節（it had a budget surplus）なので接続詞becauseが正しい。because of/due toは名詞句が必要な前置詞、despiteは意味が逆で合わない。',
    translation: '今年は予算に余剰があったため、その会社は新しい設備に投資した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'backlog',
    tags: ['接続詞vs前置詞'],
    question: 'Deliveries were delayed ___ a backlog of unprocessed orders.',
    correctText: 'because of',
    distractors: ['because', 'although', 'since'],
    explanation:
      '空所の後は名詞句（a backlog...）なので前置詞because ofが正しい。because/since/althoughは後ろに節（主語＋動詞）が必要な接続詞で、名詞句には合わない。',
    translation: '未処理の注文の滞積のため、配送が遅れた。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'bottleneck',
    tags: ['接続詞vs前置詞'],
    question: 'Production slowed ___ a bottleneck in the supply chain.',
    correctText: 'due to',
    distractors: ['because', 'although', 'unless'],
    explanation:
      '空所の後は名詞句（a bottleneck...）なので前置詞due toが正しい。because/although/unlessは後ろに節が必要な接続詞で、名詞句には合わない。',
    translation: 'サプライチェーンの障害のため、生産が遅くなった。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'congestion',
    tags: ['接続詞vs前置詞'],
    question: 'The flight was delayed ___ air traffic congestion.',
    correctText: 'due to',
    distractors: ['because', 'although', 'unless'],
    explanation:
      '空所の後は名詞句（air traffic congestion）なので前置詞due toが正しい。because/although/unlessは後ろに節が必要な接続詞で、名詞句には合わない。',
    translation: '航空交通の混雑のため、その便は遅延した。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'consignment',
    tags: ['接続詞vs前置詞'],
    question: 'The shipment was held ___ the consignment lacked proper documentation.',
    correctText: 'because',
    distractors: ['because of', 'despite', 'due to'],
    explanation:
      '空所の後は節（the consignment lacked...）なので接続詞becauseが正しい。because of/due toは名詞句が必要な前置詞、despiteは意味が逆で合わない。',
    translation: 'その委託貨物には適切な書類が欠けていたため、出荷は保留された。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'shipment',
    tags: ['接続詞vs前置詞'],
    question: 'The client complained ___ the shipment arrived three days late.',
    correctText: 'because',
    distractors: ['because of', 'despite', 'due to'],
    explanation:
      '空所の後は節（the shipment arrived...）なので接続詞becauseが正しい。because of/due toは名詞句が必要な前置詞、despiteは意味が逆で合わない。',
    translation: '出荷が3日遅れて到着したため、顧客は苦情を言った。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'inventory',
    tags: ['接続詞vs前置詞'],
    question: 'The store held a clearance sale ___ excess inventory.',
    correctText: 'because of',
    distractors: ['because', 'although', 'unless'],
    explanation:
      '空所の後は名詞句（excess inventory）なので前置詞because ofが正しい。because/although/unlessは後ろに節が必要な接続詞で、名詞句には合わない。',
    translation: '過剰在庫のため、その店舗は在庫一掃セールを行った。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'overhead',
    tags: ['接続詞vs前置詞'],
    question: 'The firm relocated its office ___ high overhead costs downtown.',
    correctText: 'because of',
    distractors: ['because', 'although', 'unless'],
    explanation:
      '空所の後は名詞句（high overhead costs...）なので前置詞because ofが正しい。because/although/unlessは後ろに節が必要な接続詞で、名詞句には合わない。',
    translation: '都心部の高い諸経費のため、その会社はオフィスを移転した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'tariff',
    tags: ['接続詞vs前置詞'],
    question: 'Import costs rose sharply ___ the new tariff.',
    correctText: 'because of',
    distractors: ['because', 'although', 'unless'],
    explanation:
      '空所の後は名詞句（the new tariff）なので前置詞because ofが正しい。because/although/unlessは後ろに節が必要な接続詞で、名詞句には合わない。',
    translation: '新しい関税のため、輸入コストが急激に上昇した。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'levy',
    tags: ['接続詞vs前置詞'],
    question: 'Residents protested ___ the city introduced a new levy.',
    correctText: 'because',
    distractors: ['because of', 'despite', 'due to'],
    explanation:
      '空所の後は節（the city introduced...）なので接続詞becauseが正しい。because of/due toは名詞句が必要な前置詞、despiteは意味が逆で合わない。',
    translation: '市が新しい課税を導入したため、住民たちは抗議した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'subsidy',
    tags: ['接続詞vs前置詞'],
    question: 'The factory remained profitable ___ the government subsidy ended.',
    correctText: 'although',
    distractors: ['because of', 'despite', 'due to'],
    explanation:
      '空所の後は節（the government subsidy ended）で、文意は逆接（補助金が終わったにもかかわらず黒字を維持）なので接続詞althoughが正しい。because of/despite/due toは後ろに名詞句が必要な前置詞で、節には合わない。',
    translation: '政府の補助金が終了したにもかかわらず、その工場は黒字を維持した。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'embezzlement',
    tags: ['接続詞vs前置詞'],
    question: 'The manager was dismissed ___ evidence of embezzlement.',
    correctText: 'because of',
    distractors: ['because', 'although', 'unless'],
    explanation:
      '空所の後は名詞句（evidence of embezzlement）なので前置詞because ofが正しい。because/although/unlessは後ろに節が必要な接続詞で、名詞句には合わない。',
    translation: '横領の証拠のため、そのマネージャーは解雇された。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'litigation',
    tags: ['接続詞vs前置詞'],
    question: 'The merger was delayed ___ ongoing litigation.',
    correctText: 'due to',
    distractors: ['because', 'although', 'unless'],
    explanation:
      '空所の後は名詞句（ongoing litigation）なので前置詞due toが正しい。because/although/unlessは後ろに節が必要な接続詞で、名詞句には合わない。',
    translation: '進行中の訴訟のため、その合併は延期された。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'insolvency',
    tags: ['接続詞vs前置詞'],
    question: 'The bank froze the accounts ___ the company faced insolvency.',
    correctText: 'because',
    distractors: ['because of', 'despite', 'due to'],
    explanation:
      '空所の後は節（the company faced...）なので接続詞becauseが正しい。because of/due toは名詞句が必要な前置詞、despiteは意味が逆で合わない。',
    translation: 'その会社が支払不能に陥ったため、銀行は口座を凍結した。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'bankruptcy',
    tags: ['接続詞vs前置詞'],
    question: 'The chain closed several stores ___ it filed for bankruptcy.',
    correctText: 'because',
    distractors: ['because of', 'despite', 'due to'],
    explanation:
      '空所の後は節（it filed for bankruptcy）なので接続詞becauseが正しい。because of/due toは名詞句が必要な前置詞、despiteは意味が逆で合わない。',
    translation: '破産を申請したため、そのチェーン店はいくつかの店舗を閉鎖した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'foreclosure',
    tags: ['接続詞vs前置詞'],
    question: "The family lost their home ___ the bank's foreclosure.",
    correctText: 'because of',
    distractors: ['because', 'although', 'unless'],
    explanation:
      "空所の後は名詞句（the bank's foreclosure）なので前置詞because ofが正しい。because/although/unlessは後ろに節が必要な接続詞で、名詞句には合わない。",
    translation: '銀行の差し押さえのため、その家族は家を失った。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'negligence',
    tags: ['接続詞vs前置詞'],
    question: 'The company was sued ___ negligence.',
    correctText: 'due to',
    distractors: ['because', 'although', 'unless'],
    explanation:
      '空所の後は名詞句（negligence）なので前置詞due toが正しい。because/although/unlessは後ろに節が必要な接続詞で、名詞句には合わない。',
    translation: '過失のため、その会社は訴えられた。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'malfeasance',
    tags: ['接続詞vs前置詞'],
    question: 'The official resigned ___ allegations of malfeasance surfaced.',
    correctText: 'because',
    distractors: ['because of', 'despite', 'due to'],
    explanation:
      '空所の後は節（allegations of malfeasance surfaced）なので接続詞becauseが正しい。because of/due toは名詞句が必要な前置詞、despiteは意味が逆で合わない。',
    translation: '不正行為の疑惑が浮上したため、その職員は辞任した。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'arrears',
    tags: ['接続詞vs前置詞'],
    question: 'The tenant was evicted ___ the rent was in arrears.',
    correctText: 'because',
    distractors: ['because of', 'despite', 'due to'],
    explanation:
      '空所の後は節（the rent was in arrears）なので接続詞becauseが正しい。because of/due toは名詞句が必要な前置詞、despiteは意味が逆で合わない。',
    translation: '家賃が滞納していたため、その借家人は立ち退かされた。',
    difficulty: 3,
  },

  // --- 比較（比較級・最上級・as...as構文） ---
  {
    keyVocabWord: 'durability',
    tags: ['比較'],
    question: 'This new packaging is more ___ than the previous version.',
    correctText: 'durable',
    distractors: ['durability', 'durably', 'durableness'],
    explanation:
      '"more ___ than"の形は形容詞の比較級を作るため、形容詞durableが正しい。durabilityは名詞、durablyは副詞、durablenessは非標準的な語で、比較級の位置には合わない。',
    translation: 'この新しい梱包は以前のバージョンよりも耐久性が高い。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'scalability',
    tags: ['比較'],
    question: 'The new platform is far more ___ than our legacy system.',
    correctText: 'scalable',
    distractors: ['scalability', 'scale', 'scaling'],
    explanation:
      '"more ___ than"の形は形容詞の比較級を作るため、形容詞scalableが正しい。scalabilityは名詞、scale/scalingは動詞由来の語で、比較級の位置には合わない。',
    translation: '新しいプラットフォームは旧システムよりもはるかに拡張性が高い。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'compatibility',
    tags: ['比較'],
    question: 'This software is more ___ with older devices than the last release.',
    correctText: 'compatible',
    distractors: ['compatibility', 'compatibly', 'compatibleness'],
    explanation:
      '"more ___ than"の形は形容詞の比較級を作るため、形容詞compatibleが正しい。compatibilityは名詞、compatiblyは副詞、compatiblenessは非標準的な語で、比較級の位置には合わない。',
    translation: 'このソフトウェアは前回のリリースよりも古い機器との互換性が高い。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'punctuality',
    tags: ['比較'],
    question: 'The new courier service is more ___ than the previous one.',
    correctText: 'punctual',
    distractors: ['punctuality', 'punctually', 'punctualness'],
    explanation:
      '"more ___ than"の形は形容詞の比較級を作るため、形容詞punctualが正しい。punctualityは名詞、punctuallyは副詞、punctualnessは非標準的な語で、比較級の位置には合わない。',
    translation: '新しい配送サービスは以前のものよりも時間に正確だ。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'sustainability',
    tags: ['比較'],
    question: "The factory's new energy plan is more ___ than last year's approach.",
    correctText: 'sustainable',
    distractors: ['sustainability', 'sustainably', 'sustain'],
    explanation:
      '"more ___ than"の形は形容詞の比較級を作るため、形容詞sustainableが正しい。sustainabilityは名詞、sustainablyは副詞、sustainは動詞原形で、比較級の位置には合わない。',
    translation: 'その工場の新しいエネルギー計画は、昨年の方針よりも持続可能性が高い。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'habitable',
    tags: ['比較'],
    question: 'This apartment is far more ___ than the one we saw yesterday.',
    correctText: 'habitable',
    distractors: ['habitation', 'inhabit', 'habitably'],
    explanation:
      '"more ___ than"の形は形容詞の比較級を作るため、形容詞habitableが正しい。habitationは名詞、inhabitは動詞、habitablyは副詞で、比較級の位置にはいずれも合わない。',
    translation: 'このアパートは昨日見た部屋よりもはるかに住みやすい。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'perishable',
    tags: ['比較'],
    question: 'Fresh produce is more ___ than canned goods.',
    correctText: 'perishable',
    distractors: ['perish', 'perishing', 'perishability'],
    explanation:
      '"more ___ than"の形は形容詞の比較級を作るため、形容詞perishableが正しい。perishは動詞原形、perishingは動名詞/現在分詞、perishabilityは名詞で、比較級の位置には合わない。',
    translation: '生鮮食品は缶詰よりも傷みやすい。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'confidential',
    tags: ['比較'],
    question: 'This report is more ___ than the previous draft.',
    correctText: 'confidential',
    distractors: ['confidentiality', 'confidentially', 'confide'],
    explanation:
      '"more ___ than"の形は形容詞の比較級を作るため、形容詞confidentialが正しい。confidentialityは名詞、confidentiallyは副詞、confideは動詞で、比較級の位置には合わない。',
    translation: 'この報告書は前回の草案よりも機密性が高い。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'courteous',
    tags: ['比較'],
    question: 'The new staff member is far more ___ than the last one.',
    correctText: 'courteous',
    distractors: ['courtesy', 'courteously', 'court'],
    explanation:
      '"more ___ than"の形は形容詞の比較級を作るため、形容詞courteousが正しい。courtesyは名詞、courteouslyは副詞、courtは無関係の語で、比較級の位置には合わない。',
    translation: '新しいスタッフは前任者よりもはるかに礼儀正しい。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'complimentary',
    tags: ['品詞'],
    question: 'The hotel offers more ___ services than its competitors.',
    correctText: 'complimentary',
    distractors: ['complimented', 'complimenting', 'compliment'],
    explanation:
      '"more ___ services"の形は形容詞complimentaryが名詞servicesを修飾する。complimentedは過去形/過去分詞、complimentingは現在分詞、complimentは動詞原形/名詞で、形容詞の位置には合わない。',
    translation: 'そのホテルは競合他社よりも多くの無料サービスを提供している。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'refundable',
    tags: ['比較'],
    question: 'This ticket is more ___ than the basic economy fare.',
    correctText: 'refundable',
    distractors: ['refund', 'refunding', 'refunded'],
    explanation:
      '"more ___ than"の形は形容詞の比較級を作るため、形容詞refundableが正しい。refundは動詞原形/名詞、refundingは動名詞/現在分詞、refundedは過去形/過去分詞で、比較級の位置には合わない。',
    translation: 'このチケットは基本のエコノミー運賃よりも払い戻し可能性が高い。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'exclusive',
    tags: ['比較'],
    question: 'The new club membership is more ___ than the standard tier.',
    correctText: 'exclusive',
    distractors: ['exclusively', 'exclusion', 'exclude'],
    explanation:
      '"more ___ than"の形は形容詞の比較級を作るため、形容詞exclusiveが正しい。exclusivelyは副詞、exclusionは名詞、excludeは動詞で、比較級の位置には合わない。',
    translation: '新しいクラブ会員資格は標準ランクよりも限定性が高い。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'upscale',
    tags: ['比較'],
    question: 'This neighborhood is far more ___ than it was ten years ago.',
    correctText: 'upscale',
    distractors: ['upscaling', 'upscaled', 'upscales'],
    explanation:
      '"more ___ than"の形は形容詞の比較級を作るため、形容詞upscaleが正しい。他の3つは動詞由来の活用形で、比較級の位置には合わない。',
    translation: 'この地区は10年前よりもはるかに高級になった。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'premium',
    tags: ['品詞'],
    question: 'Customers pay a higher ___ for same-day delivery.',
    correctText: 'premium',
    distractors: ['premiums', 'premiering', 'premiered'],
    explanation:
      '"a higher ___"の空所は単数名詞。premiumが正しい。premiumsは複数形で単数冠詞aに合わず、premiering/premieredは無関係の動詞premiereの活用形で文意に合わない。',
    translation: '顧客は即日配達のためにより高い割増料金を支払う。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'franchise',
    tags: ['比較'],
    question: 'The franchise reported ___ earnings than any other branch this year.',
    correctText: 'higher',
    distractors: ['high', 'highest', 'highly'],
    explanation:
      '"___ than any other"の形は比較級が正しい。higherが正しく、highは原級、highestは最上級、highlyは副詞で、"than"と共起する比較級の位置には合わない。',
    translation: 'そのフランチャイズ店は今年、他のどの支店よりも高い収益を報告した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'clientele',
    tags: ['比較'],
    question: "The restaurant's clientele grew ___ than expected after the renovation.",
    correctText: 'faster',
    distractors: ['fast', 'fastest', 'fastly'],
    explanation:
      '"___ than expected"の形は比較級が正しい。fasterが正しく、fastは原級、fastestは最上級、fastlyは非標準的な語で、"than"と共起する比較級の位置には合わない。',
    translation: 'その改装後、レストランの顧客層は予想より速く拡大した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'assortment',
    tags: ['比較'],
    question: "This store's assortment is ___ than that of its closest competitor.",
    correctText: 'wider',
    distractors: ['wide', 'widest', 'widely'],
    explanation:
      '"___ than"の形は比較級が正しい。widerが正しく、wideは原級、widestは最上級、widelyは副詞で、"than"と共起する比較級の位置には合わない。',
    translation: 'この店の品揃えは最も近い競合店よりも幅広い。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'merchant',
    tags: ['比較'],
    question: "This merchant's prices are ___ than those of any other shop in town.",
    correctText: 'lower',
    distractors: ['low', 'lowest', 'lowly'],
    explanation:
      '"___ than any other"の形は比較級が正しい。lowerが正しく、lowは原級、lowestは最上級、lowlyは「地位が低い」という別の意味の形容詞で、いずれも合わない。',
    translation: 'この商人の価格は町の他のどの店よりも安い。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'patronage',
    tags: ['比較'],
    question: 'Patronage at the new café increased ___ than anyone predicted.',
    correctText: 'more',
    distractors: ['much', 'many', 'most'],
    explanation:
      '"increased ___ than"の形は比較級moreが正しい（"increased more than"=予想以上に増えた）。much/manyは比較級でなく、mostは最上級で、"than"と共起しない。',
    translation: '新しいカフェの来客数は誰の予想よりも増えた。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'turnover',
    tags: ['比較'],
    question: "Staff turnover this year was ___ than last year's record high.",
    correctText: 'lower',
    distractors: ['low', 'lowest', 'lowly'],
    explanation:
      '"___ than"の形は比較級が正しい。lowerが正しく、lowは原級、lowestは最上級、lowlyは別の意味の形容詞で、いずれも合わない。',
    translation: '今年の従業員の離職率は昨年の過去最高よりも低かった。',
    difficulty: 3,
  },
]
