// Part5（text_blank）50問のデータ本体（T-28。正本: docs/04 2節・docs/03 7.1節）。
// keyVocabWordはSランク200語（freqList.ts/vocabCardsS.ts）から選び、単語帳との循環を成立させる。
// tags[0]は文法系タグ必須（03の7.1: 品詞/動詞の形/代名詞・関係詞/接続詞vs前置詞/比較）。
// questionの空所は"___"で統一する（バリデータとの整合。実装指示3）。

export interface Part5Entry {
  keyVocabWord: string
  tags: string[]
  question: string
  choices: { key: string; text: string }[]
  answer: string
  explanation: string
  translation: string
  difficulty: number
}

export const PART5_ENTRIES_S: Part5Entry[] = [
  {
    keyVocabWord: 'submit',
    tags: ['動詞の形'],
    question: 'Please ___ the expense report by Friday afternoon.',
    choices: [
      { key: 'A', text: 'submit' },
      { key: 'B', text: 'submission' },
      { key: 'C', text: 'submitted' },
      { key: 'D', text: 'submitting' },
    ],
    answer: 'A',
    explanation:
      '命令文のため動詞の原形submitが正しい。Bは名詞、Cは過去形/過去分詞、Dは動名詞/現在分詞で、命令文の主動詞としては使えない。',
    translation: '金曜日の午後までに経費報告書を提出してください。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'attend',
    tags: ['動詞の形'],
    question: 'All department heads are expected to ___ the quarterly meeting.',
    choices: [
      { key: 'A', text: 'attend' },
      { key: 'B', text: 'attendance' },
      { key: 'C', text: 'attended' },
      { key: 'D', text: 'attending' },
    ],
    answer: 'A',
    explanation:
      'to不定詞の後は動詞の原形が続くため、attendが正しい。Bは名詞、Cは過去形、Dは動名詞/現在分詞で、to不定詞の形に合わない。',
    translation: '各部門長は四半期会議に出席することが求められている。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'approve',
    tags: ['品詞'],
    question: 'The manager gave her ___ for the new marketing budget.',
    choices: [
      { key: 'A', text: 'approval' },
      { key: 'B', text: 'approve' },
      { key: 'C', text: 'approved' },
      { key: 'D', text: 'approvingly' },
    ],
    answer: 'A',
    explanation:
      '所有格herの後には名詞が続くため、approval（承認）が正しい。B/C/Dはそれぞれ動詞・過去分詞・副詞で名詞の位置には入らない。',
    translation: '部長は新しいマーケティング予算を承認した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'negotiate',
    tags: ['動詞の形'],
    question: 'The two companies plan to ___ a new pricing agreement next week.',
    choices: [
      { key: 'A', text: 'negotiate' },
      { key: 'B', text: 'negotiation' },
      { key: 'C', text: 'negotiated' },
      { key: 'D', text: 'negotiating' },
    ],
    answer: 'A',
    explanation:
      'plan to の後は動詞の原形が続くため、negotiateが正しい。Bは名詞、C/Dはそれぞれ過去形・動名詞で、to不定詞の形には合わない。',
    translation: '両社は来週、新しい価格協定について交渉する予定だ。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'confirm',
    tags: ['動詞の形'],
    question: 'We would appreciate it if you could ___ your attendance by Wednesday.',
    choices: [
      { key: 'A', text: 'confirm' },
      { key: 'B', text: 'confirmation' },
      { key: 'C', text: 'confirmed' },
      { key: 'D', text: 'confirming' },
    ],
    answer: 'A',
    explanation:
      '助動詞couldの後は動詞の原形が続くため、confirmが正しい。Bは名詞、C/Dは過去形/現在分詞で、助動詞の後には置けない。',
    translation: '水曜日までにご出席を確認していただけますと幸いです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'authorize',
    tags: ['動詞の形'],
    question: 'Only the director is ___ to approve expenses over five thousand dollars.',
    choices: [
      { key: 'A', text: 'authorize' },
      { key: 'B', text: 'authorization' },
      { key: 'C', text: 'authorized' },
      { key: 'D', text: 'authorizing' },
    ],
    answer: 'C',
    explanation:
      'be動詞isの後で受動態を作る過去分詞authorizedが正しい（「権限を与えられている」）。A/Dは能動形、Bは名詞で、この文脈には合わない。',
    translation: '5000ドルを超える経費を承認する権限があるのは部長だけだ。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'implement',
    tags: ['動詞の形'],
    question: 'The company decided to ___ the new safety policy immediately.',
    choices: [
      { key: 'A', text: 'implement' },
      { key: 'B', text: 'implementation' },
      { key: 'C', text: 'implemented' },
      { key: 'D', text: 'implementing' },
    ],
    answer: 'A',
    explanation:
      'decided to の後は動詞の原形が続くため、implementが正しい。Bは名詞、C/Dは過去形/動名詞で、to不定詞の形には合わない。',
    translation: '会社は新しい安全方針を直ちに実施することを決定した。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'comply',
    tags: ['品詞'],
    question: 'All employees must be in full ___ with the new safety regulations.',
    choices: [
      { key: 'A', text: 'comply' },
      { key: 'B', text: 'compliance' },
      { key: 'C', text: 'compliant' },
      { key: 'D', text: 'compliantly' },
    ],
    answer: 'B',
    explanation:
      '前置詞inの後で名詞complianceが正しい（"in compliance with" で「〜を遵守して」の定型表現）。A動詞、C形容詞、D副詞は前置詞の直後の名詞位置には合わない。',
    translation: '全従業員は新しい安全規則を完全に遵守しなければならない。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'finalize',
    tags: ['動詞の形'],
    question: 'We need to ___ the contract details before the end of the month.',
    choices: [
      { key: 'A', text: 'finalize' },
      { key: 'B', text: 'finalization' },
      { key: 'C', text: 'finalized' },
      { key: 'D', text: 'finalizing' },
    ],
    answer: 'A',
    explanation:
      'need to の後は動詞の原形が続くため、finalizeが正しい。Bは名詞、C/Dは過去形/動名詞で、to不定詞の形には合わない。',
    translation: '今月末までに契約の詳細を最終決定する必要がある。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'delegate',
    tags: ['動詞の形'],
    question: 'A good manager knows how to ___ tasks effectively.',
    choices: [
      { key: 'A', text: 'delegate' },
      { key: 'B', text: 'delegation' },
      { key: 'C', text: 'delegated' },
      { key: 'D', text: 'delegating' },
    ],
    answer: 'A',
    explanation:
      'how to の後は動詞の原形が続くため、delegateが正しい。Bは名詞、C/Dは過去形/動名詞で、to不定詞の形には合わない。',
    translation: '優秀な管理職は仕事を効果的に任せる方法を知っている。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'prioritize',
    tags: ['動詞の形'],
    question: 'You should ___ the most urgent tasks first thing in the morning.',
    choices: [
      { key: 'A', text: 'prioritize' },
      { key: 'B', text: 'priority' },
      { key: 'C', text: 'prioritized' },
      { key: 'D', text: 'prioritizing' },
    ],
    answer: 'A',
    explanation:
      '助動詞shouldの後は動詞の原形が続くため、prioritizeが正しい。Bは名詞、C/Dは過去形/動名詞で、助動詞の後には置けない。',
    translation: '朝一番で最も緊急な仕事を優先すべきだ。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'facilitate',
    tags: ['動詞の形'],
    question: 'The new software is designed to ___ communication between departments.',
    choices: [
      { key: 'A', text: 'facilitate' },
      { key: 'B', text: 'facilitation' },
      { key: 'C', text: 'facilitated' },
      { key: 'D', text: 'facilitating' },
    ],
    answer: 'A',
    explanation:
      'designed to の後は動詞の原形が続くため、facilitateが正しい。Bは名詞、C/Dは過去形/動名詞で、to不定詞の形には合わない。',
    translation:
      'この新しいソフトウェアは部署間のコミュニケーションを円滑にするために設計されている。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'coordinate',
    tags: ['動詞の形'],
    question: 'She will ___ the logistics for the annual conference this year.',
    choices: [
      { key: 'A', text: 'coordinate' },
      { key: 'B', text: 'coordination' },
      { key: 'C', text: 'coordinated' },
      { key: 'D', text: 'coordinating' },
    ],
    answer: 'A',
    explanation:
      '助動詞willの後は動詞の原形が続くため、coordinateが正しい。Bは名詞、C/Dは過去形/動名詞で、助動詞の後には置けない。',
    translation: '彼女が今年の年次会議の運営調整を担当する。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'supervise',
    tags: ['動詞の形'],
    question: 'He was hired specifically to ___ the new production line.',
    choices: [
      { key: 'A', text: 'supervise' },
      { key: 'B', text: 'supervision' },
      { key: 'C', text: 'supervised' },
      { key: 'D', text: 'supervising' },
    ],
    answer: 'A',
    explanation:
      'to不定詞の後は動詞の原形が続くため、superviseが正しい。Bは名詞、C/Dは過去形/動名詞で、to不定詞の形には合わない。',
    translation: '彼は新しい生産ラインを監督するために特別に採用された。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'oversee',
    tags: ['動詞の形'],
    question: 'The project manager will ___ the entire renovation process.',
    choices: [
      { key: 'A', text: 'oversee' },
      { key: 'B', text: 'oversight' },
      { key: 'C', text: 'overseen' },
      { key: 'D', text: 'overseeing' },
    ],
    answer: 'A',
    explanation:
      '助動詞willの後は動詞の原形が続くため、overseeが正しい。Bは名詞、C/Dは過去分詞/動名詞で、助動詞の後には置けない。',
    translation: 'プロジェクトマネージャーが改装工事全体を統括する。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'recruit',
    tags: ['動詞の形'],
    question: 'The firm plans to ___ ten new engineers this year.',
    choices: [
      { key: 'A', text: 'recruit' },
      { key: 'B', text: 'recruitment' },
      { key: 'C', text: 'recruited' },
      { key: 'D', text: 'recruiting' },
    ],
    answer: 'A',
    explanation:
      'plans to の後は動詞の原形が続くため、recruitが正しい。Bは名詞、C/Dは過去形/動名詞で、to不定詞の形には合わない。',
    translation: 'その会社は今年、新しいエンジニアを10人採用する予定だ。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'hire',
    tags: ['品詞'],
    question: 'The company made several new ___ last month.',
    choices: [
      { key: 'A', text: 'hires' },
      { key: 'B', text: 'hire' },
      { key: 'C', text: 'hiring' },
      { key: 'D', text: 'hired' },
    ],
    answer: 'A',
    explanation:
      '形容詞newの後で複数の名詞hires（採用者たち）が正しい。B動詞原形、C動名詞/現在分詞、D過去形/過去分詞は、severalの後の複数名詞位置には合わない。',
    translation: '会社は先月、何人かの新規採用を行った。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'notify',
    tags: ['動詞の形'],
    question: 'Employees will be ___ of the schedule change by email.',
    choices: [
      { key: 'A', text: 'notify' },
      { key: 'B', text: 'notification' },
      { key: 'C', text: 'notified' },
      { key: 'D', text: 'notifying' },
    ],
    answer: 'C',
    explanation:
      'will be の後で受動態を作る過去分詞notifiedが正しい（「知らされる」）。A原形、D現在分詞は能動的な形、Bは名詞で受動態の形には合わない。',
    translation: '従業員はメールで予定変更について通知される。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'inform',
    tags: ['動詞の形'],
    question: 'We regret to ___ you that the flight has been delayed.',
    choices: [
      { key: 'A', text: 'inform' },
      { key: 'B', text: 'information' },
      { key: 'C', text: 'informed' },
      { key: 'D', text: 'informing' },
    ],
    answer: 'A',
    explanation:
      'regret to の後は動詞の原形が続くため、informが正しい。Bは名詞、C/Dは過去形/動名詞で、to不定詞の形には合わない。',
    translation: '残念ながら、フライトが遅延したことをお知らせいたします。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'request',
    tags: ['品詞'],
    question: 'Please submit your ___ for a schedule change in writing.',
    choices: [
      { key: 'A', text: 'request' },
      { key: 'B', text: 'requesting' },
      { key: 'C', text: 'requested' },
      { key: 'D', text: 'requestable' },
    ],
    answer: 'A',
    explanation:
      '所有格yourの後には名詞requestが続く。B動名詞/現在分詞、C過去形/過去分詞、D形容詞（一般的でない語）は名詞の位置には合わない。',
    translation: '予定変更のご要望は書面でご提出ください。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'clarify',
    tags: ['動詞の形'],
    question: 'Could you ___ what is included in the service fee?',
    choices: [
      { key: 'A', text: 'clarify' },
      { key: 'B', text: 'clarification' },
      { key: 'C', text: 'clarified' },
      { key: 'D', text: 'clarifying' },
    ],
    answer: 'A',
    explanation:
      '助動詞couldの後は動詞の原形が続くため、clarifyが正しい。Bは名詞、C/Dは過去形/動名詞で、助動詞の後には置けない。',
    translation: 'サービス料に何が含まれているか明確にしていただけますか？',
    difficulty: 2,
  },
  {
    keyVocabWord: 'terminate',
    tags: ['動詞の形'],
    question: 'The company decided to ___ the agreement due to repeated delays.',
    choices: [
      { key: 'A', text: 'terminate' },
      { key: 'B', text: 'termination' },
      { key: 'C', text: 'terminated' },
      { key: 'D', text: 'terminating' },
    ],
    answer: 'A',
    explanation:
      'decided to の後は動詞の原形が続くため、terminateが正しい。Bは名詞、C/Dは過去形/動名詞で、to不定詞の形には合わない。',
    translation: '会社は度重なる遅延を理由に契約を終了することを決定した。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'renewal',
    tags: ['品詞'],
    question: 'The lease is up for ___ at the end of this month.',
    choices: [
      { key: 'A', text: 'renewal' },
      { key: 'B', text: 'renew' },
      { key: 'C', text: 'renewed' },
      { key: 'D', text: 'renewing' },
    ],
    answer: 'A',
    explanation:
      '前置詞forの後には名詞が続くため、renewal（更新）が正しい。B動詞原形、C過去形/過去分詞、D動名詞は前置詞forの直後には通常置かない。',
    translation: '賃貸契約は今月末に更新の時期を迎える。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'extension',
    tags: ['品詞'],
    question: 'We requested an ___ on the project deadline.',
    choices: [
      { key: 'A', text: 'extension' },
      { key: 'B', text: 'extend' },
      { key: 'C', text: 'extended' },
      { key: 'D', text: 'extending' },
    ],
    answer: 'A',
    explanation:
      '冠詞anの後には名詞extension（延長）が続く。B動詞原形、C過去形/過去分詞、D動名詞は冠詞anの直後の名詞位置には合わない。',
    translation: '私たちはプロジェクトの締切延長を要請した。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'promotion',
    tags: ['品詞'],
    question: 'She received a ___ to senior manager last month.',
    choices: [
      { key: 'A', text: 'promotion' },
      { key: 'B', text: 'promote' },
      { key: 'C', text: 'promoted' },
      { key: 'D', text: 'promoting' },
    ],
    answer: 'A',
    explanation:
      '冠詞aの後には名詞promotion（昇進）が続く。B動詞原形、C過去形/過去分詞、D動名詞は冠詞の直後の名詞位置には合わない。',
    translation: '彼女は先月、シニアマネージャーへの昇進を果たした。',
    difficulty: 1,
  },
  {
    keyVocabWord: 'retirement',
    tags: ['品詞'],
    question: 'He is planning his ___ for next spring.',
    choices: [
      { key: 'A', text: 'retirement' },
      { key: 'B', text: 'retire' },
      { key: 'C', text: 'retired' },
      { key: 'D', text: 'retiring' },
    ],
    answer: 'A',
    explanation:
      '所有格hisの後には名詞retirement（退職）が続く。B動詞原形、C過去形/過去分詞、D動名詞は所有格の直後の名詞位置には合わない。',
    translation: '彼は来年の春に退職することを計画している。',
    difficulty: 1,
  },
  {
    keyVocabWord: 'evaluation',
    tags: ['品詞'],
    question: 'Her annual ___ is scheduled for next Tuesday.',
    choices: [
      { key: 'A', text: 'evaluation' },
      { key: 'B', text: 'evaluate' },
      { key: 'C', text: 'evaluated' },
      { key: 'D', text: 'evaluating' },
    ],
    answer: 'A',
    explanation:
      '形容詞annualの後には名詞evaluation（評価）が続く。B動詞原形、C過去形/過去分詞、D動名詞は形容詞の後の名詞位置には合わない。',
    translation: '彼女の年次評価は来週火曜日に予定されている。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'performance',
    tags: ['品詞'],
    question: 'His ___ has improved significantly over the past year.',
    choices: [
      { key: 'A', text: 'performance' },
      { key: 'B', text: 'perform' },
      { key: 'C', text: 'performed' },
      { key: 'D', text: 'performing' },
    ],
    answer: 'A',
    explanation:
      '所有格hisの後には名詞performance（業績）が続く。B動詞原形、C過去形/過去分詞、D動名詞は所有格の直後の名詞位置には合わない。',
    translation: '彼の業績はこの一年で著しく向上した。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'inspection',
    tags: ['品詞'],
    question: 'Every vehicle undergoes a thorough ___ before delivery.',
    choices: [
      { key: 'A', text: 'inspection' },
      { key: 'B', text: 'inspect' },
      { key: 'C', text: 'inspected' },
      { key: 'D', text: 'inspecting' },
    ],
    answer: 'A',
    explanation:
      '形容詞thoroughの後には名詞inspection（検査）が続く。B動詞原形、C過去形/過去分詞、D動名詞は形容詞の後の名詞位置には合わない。',
    translation: 'すべての車両は出荷前に徹底的な検査を受ける。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'liability',
    tags: ['品詞'],
    question: 'The company carries ___ insurance for workplace accidents.',
    choices: [
      { key: 'A', text: 'liability' },
      { key: 'B', text: 'liable' },
      { key: 'C', text: 'liably' },
      { key: 'D', text: 'liabilities' },
    ],
    answer: 'A',
    explanation:
      '複合名詞"liability insurance"（賠償責任保険）として単数形liabilityが正しい。B形容詞、C副詞は名詞insuranceを修飾できず、D複数形は定型表現として不自然。',
    translation: '会社は労働災害に対する賠償責任保険に加入している。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'warranty',
    tags: ['品詞'],
    question: 'The product comes with a two-year ___.',
    choices: [
      { key: 'A', text: 'warranty' },
      { key: 'B', text: 'warrant' },
      { key: 'C', text: 'warranted' },
      { key: 'D', text: 'warranting' },
    ],
    answer: 'A',
    explanation:
      '形容詞句two-yearの後には名詞warranty（保証）が続く。B動詞原形、C過去形/過去分詞、D動名詞は名詞の位置には合わない。',
    translation: 'この製品には2年間の保証が付いている。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'certification',
    tags: ['品詞'],
    question: 'She earned a professional ___ in project management last year.',
    choices: [
      { key: 'A', text: 'certification' },
      { key: 'B', text: 'certify' },
      { key: 'C', text: 'certified' },
      { key: 'D', text: 'certifying' },
    ],
    answer: 'A',
    explanation:
      '形容詞professionalの後には名詞certification（認定）が続く。B動詞原形、C過去形/過去分詞、D動名詞は形容詞の後の名詞位置には合わない。',
    translation: '彼女は昨年、プロジェクトマネジメントの専門認定を取得した。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'registration',
    tags: ['品詞'],
    question: '___ for the conference closes next Friday.',
    choices: [
      { key: 'A', text: 'Registration' },
      { key: 'B', text: 'Register' },
      { key: 'C', text: 'Registered' },
      { key: 'D', text: 'Registering' },
    ],
    answer: 'A',
    explanation:
      '文頭の主語位置には名詞Registration（登録）が入る。B動詞原形、C過去形/過去分詞、D動名詞（主語になりうるが文脈上不自然）は主語として適さない。',
    translation: 'カンファレンスの登録受付は次の金曜日に締め切られる。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'subscription',
    tags: ['品詞'],
    question: 'Employees receive a free ___ to the industry magazine.',
    choices: [
      { key: 'A', text: 'subscription' },
      { key: 'B', text: 'subscribe' },
      { key: 'C', text: 'subscribed' },
      { key: 'D', text: 'subscribing' },
    ],
    answer: 'A',
    explanation:
      '形容詞freeの後には名詞subscription（購読）が続く。B動詞原形、C過去形/過去分詞、D動名詞は形容詞の後の名詞位置には合わない。',
    translation: '従業員は業界誌の無料購読を受けられる。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'projection',
    tags: ['品詞'],
    question: 'Sales ___ for next year look optimistic.',
    choices: [
      { key: 'A', text: 'projections' },
      { key: 'B', text: 'project' },
      { key: 'C', text: 'projected' },
      { key: 'D', text: 'projecting' },
    ],
    answer: 'A',
    explanation:
      '複合名詞"sales projections"（売上予測）の複数名詞形が正しい。B動詞原形、C過去形/過去分詞、D動名詞は文の主語位置には合わない。',
    translation: '来年の売上予測は楽観的だ。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'acquisition',
    tags: ['品詞'],
    question: 'The ___ helped the company expand into new markets.',
    choices: [
      { key: 'A', text: 'acquisition' },
      { key: 'B', text: 'acquire' },
      { key: 'C', text: 'acquired' },
      { key: 'D', text: 'acquiring' },
    ],
    answer: 'A',
    explanation:
      '冠詞Theの後で文の主語となる名詞acquisition（買収）が正しい。B動詞原形、C過去形/過去分詞、D動名詞は冠詞の直後の主語位置には合わない。',
    translation: 'その買収により会社は新しい市場に進出することができた。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'merger',
    tags: ['品詞'],
    question: 'The ___ between the two firms was announced today.',
    choices: [
      { key: 'A', text: 'merger' },
      { key: 'B', text: 'merge' },
      { key: 'C', text: 'merged' },
      { key: 'D', text: 'merging' },
    ],
    answer: 'A',
    explanation:
      '冠詞Theの後で文の主語となる名詞merger（合併）が正しい。B動詞原形、C過去形/過去分詞、D動名詞は冠詞の直後の主語位置には合わない。',
    translation: '両社の合併が本日発表された。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'endorsement',
    tags: ['品詞'],
    question: 'The athlete signed an ___ deal with a sportswear brand.',
    choices: [
      { key: 'A', text: 'endorsement' },
      { key: 'B', text: 'endorse' },
      { key: 'C', text: 'endorsed' },
      { key: 'D', text: 'endorsing' },
    ],
    answer: 'A',
    explanation:
      '冠詞anの後で複合名詞"endorsement deal"を作る名詞endorsementが正しい。B動詞原形、C過去形/過去分詞、D動名詞は名詞dealを修飾する形として不自然。',
    translation: 'その選手はスポーツウェアブランドと広告契約を結んだ。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'correspondence',
    tags: ['品詞'],
    question: 'All ___ with the client should be kept on file.',
    choices: [
      { key: 'A', text: 'correspondence' },
      { key: 'B', text: 'correspond' },
      { key: 'C', text: 'corresponded' },
      { key: 'D', text: 'corresponding' },
    ],
    answer: 'A',
    explanation:
      '数量形容詞Allの後には名詞correspondence（やり取り）が続く。B動詞原形、C過去形/過去分詞、D動名詞/現在分詞は名詞の位置には合わない。',
    translation: '取引先とのやり取りはすべて記録として保管すべきだ。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'participate',
    tags: ['動詞の形'],
    question: 'Employees are encouraged to ___ in the training program.',
    choices: [
      { key: 'A', text: 'participate' },
      { key: 'B', text: 'participation' },
      { key: 'C', text: 'participated' },
      { key: 'D', text: 'participating' },
    ],
    answer: 'A',
    explanation:
      'to不定詞の後は動詞の原形が続くため、participateが正しい。Bは名詞、C/Dは過去形/動名詞で、to不定詞の形には合わない。',
    translation: '従業員は研修プログラムへの参加を奨励されている。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'reservation',
    tags: ['品詞'],
    question: 'I would like to make a ___ for two people tonight.',
    choices: [
      { key: 'A', text: 'reservation' },
      { key: 'B', text: 'reserve' },
      { key: 'C', text: 'reserved' },
      { key: 'D', text: 'reserving' },
    ],
    answer: 'A',
    explanation:
      '冠詞aの後には名詞reservation（予約）が続く。B動詞原形、C過去形/過去分詞、D動名詞は冠詞の直後の名詞位置には合わない。',
    translation: '今夜2名で予約をお願いしたいのですが。',
    difficulty: 1,
  },
  {
    keyVocabWord: 'expenditure',
    tags: ['品詞'],
    question: 'Total ___ on marketing rose sharply this year.',
    choices: [
      { key: 'A', text: 'expenditure' },
      { key: 'B', text: 'expend' },
      { key: 'C', text: 'expended' },
      { key: 'D', text: 'expending' },
    ],
    answer: 'A',
    explanation:
      '形容詞Totalの後で文の主語となる名詞expenditure（支出）が正しい。B動詞原形、C過去形/過去分詞、D動名詞は主語位置には合わない。',
    translation: '今年のマーケティングへの総支出は急激に増加した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'account',
    tags: ['接続詞vs前置詞'],
    question: 'The transaction failed ___ of insufficient funds in the account.',
    choices: [
      { key: 'A', text: 'because' },
      { key: 'B', text: 'because of' },
      { key: 'C', text: 'although' },
      { key: 'D', text: 'despite' },
    ],
    answer: 'B',
    explanation:
      '空所の後は名詞句(insufficient funds)なので前置詞because ofが正しい。Aは後ろに節が必要な接続詞、C/Dも意味・構文が合わない。',
    translation: '口座の残高不足のためその取引は失敗した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'budget',
    tags: ['接続詞vs前置詞'],
    question: 'The project was delayed ___ the budget had not been approved yet.',
    choices: [
      { key: 'A', text: 'because' },
      { key: 'B', text: 'because of' },
      { key: 'C', text: 'due to' },
      { key: 'D', text: 'despite' },
    ],
    answer: 'A',
    explanation:
      '空所の後は節(the budget had not...)なので接続詞becauseが正しい。B/Cは後ろに名詞句が必要な前置詞、Dは意味が逆（〜にもかかわらず）で合わない。',
    translation: 'そのプロジェクトは予算がまだ承認されていなかったため遅れた。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'quality',
    tags: ['比較'],
    question: 'This year’s products are of much higher ___ than last year’s.',
    choices: [
      { key: 'A', text: 'quality' },
      { key: 'B', text: 'qualities' },
      { key: 'C', text: 'qualify' },
      { key: 'D', text: 'qualified' },
    ],
    answer: 'A',
    explanation:
      '"of ... quality"は不可算名詞として単数形qualityで使うのが正しい。Bは可算的な複数形で不自然、C動詞、D過去分詞は名詞位置に合わない。',
    translation: '今年の製品は昨年のものよりずっと品質が高い。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'competitor',
    tags: ['比較'],
    question: 'Our new model performs better than any other ___ product on the market.',
    choices: [
      { key: 'A', text: 'competitor' },
      { key: 'B', text: 'competitors' },
      { key: 'C', text: 'compete' },
      { key: 'D', text: 'competing' },
    ],
    answer: 'D',
    explanation:
      '名詞productを修飾する現在分詞competing（競合する）が正しい。A/Bは名詞、Cは動詞原形で、名詞を直接修飾する形容詞的用法には合わない。',
    translation: '当社の新モデルは市場の他のどの競合製品よりも性能が良い。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'strategy',
    tags: ['比較'],
    question: 'This marketing ___ is far more effective than the previous one.',
    choices: [
      { key: 'A', text: 'strategy' },
      { key: 'B', text: 'strategic' },
      { key: 'C', text: 'strategically' },
      { key: 'D', text: 'strategize' },
    ],
    answer: 'A',
    explanation:
      '指示詞Thisの後で複合名詞"marketing strategy"を作る名詞strategyが正しい。B形容詞、C副詞、D動詞は名詞の位置には合わない。',
    translation: 'このマーケティング戦略は以前のものよりずっと効果的だ。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'candidate',
    tags: ['代名詞・関係詞'],
    question: 'The candidate ___ resume impressed the hiring committee got the job.',
    choices: [
      { key: 'A', text: 'whose' },
      { key: 'B', text: 'who' },
      { key: 'C', text: 'which' },
      { key: 'D', text: 'whom' },
    ],
    answer: 'A',
    explanation:
      '空所の後のresumeとの所有関係を表す関係代名詞whoseが正しい。B/Dは人物を直接指す主格/目的格、Cは物を指す関係代名詞で、所有関係を表せない。',
    translation: '履歴書が採用委員会に感銘を与えた候補者がその職を得た。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'proposal',
    tags: ['代名詞・関係詞'],
    question: 'The proposal ___ we submitted last week was finally approved.',
    choices: [
      { key: 'A', text: 'which' },
      { key: 'B', text: 'whose' },
      { key: 'C', text: 'who' },
      { key: 'D', text: 'whom' },
    ],
    answer: 'A',
    explanation:
      '先行詞proposal（物）を受ける目的格の関係代名詞whichが正しい（省略も可）。B所有格、C/Dは人物を指す関係代名詞で、物を先行詞にはできない。',
    translation: '先週提出した提案書がついに承認された。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'client',
    tags: ['代名詞・関係詞'],
    question: 'The client ___ we met yesterday wants to revise the contract.',
    choices: [
      { key: 'A', text: 'whom' },
      { key: 'B', text: 'whose' },
      { key: 'C', text: 'which' },
      { key: 'D', text: 'where' },
    ],
    answer: 'A',
    explanation:
      '先行詞client（人）を受ける目的格の関係代名詞whomが正しい（口語ではwhoも可）。B所有格、C物を指す関係代名詞、D関係副詞は文脈に合わない。',
    translation: '昨日会ったクライアントが契約の修正を望んでいる。',
    difficulty: 4,
  },
]
