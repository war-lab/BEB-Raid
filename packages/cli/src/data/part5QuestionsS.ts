// Part5（text_blank）50問のデータ本体（T-28。正本: docs/04 2節・docs/03 7.1節）。
// keyVocabWordはSランク200語（freqList.ts/vocabCardsS.ts）から選び、単語帳との循環を成立させる。
// tags[0]は文法系タグ必須（03の7.1: 品詞/動詞の形/代名詞・関係詞/接続詞vs前置詞/比較）。
// questionの空所は"___"で統一する（バリデータとの整合。実装指示3）。
// 正答キーはA〜Dに分散させている（レビュー対応: 常に同じ記号が正答だとテストとして破綻するため）。
// explanationは選択肢記号でなく実テキストを引用する（並び替えに耐性を持たせるため）。

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
      '命令文のため動詞の原形submitが正しい。submissionは名詞、submittedは過去形/過去分詞、submittingは動名詞/現在分詞で、命令文の主動詞としては使えない。',
    translation: '金曜日の午後までに経費報告書を提出してください。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'attend',
    tags: ['動詞の形'],
    question: 'All department heads are expected to ___ the quarterly meeting.',
    choices: [
      { key: 'A', text: 'attendance' },
      { key: 'B', text: 'attended' },
      { key: 'C', text: 'attending' },
      { key: 'D', text: 'attend' },
    ],
    answer: 'D',
    explanation:
      'to不定詞の後は動詞の原形が続くため、attendが正しい。attendanceは名詞、attendedは過去形、attendingは動名詞/現在分詞で、to不定詞の形に合わない。',
    translation: '各部門長は四半期会議に出席することが求められている。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'approve',
    tags: ['品詞'],
    question: 'The manager gave her ___ for the new marketing budget.',
    choices: [
      { key: 'A', text: 'approved' },
      { key: 'B', text: 'approvingly' },
      { key: 'C', text: 'approval' },
      { key: 'D', text: 'approve' },
    ],
    answer: 'C',
    explanation:
      '所有格herの後には名詞が続くため、approval（承認）が正しい。approve/approved/approvinglyはそれぞれ動詞・過去分詞・副詞で名詞の位置には入らない。',
    translation: '部長は新しいマーケティング予算を承認した。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'negotiate',
    tags: ['動詞の形'],
    question: 'The two companies plan to ___ a new pricing agreement next week.',
    choices: [
      { key: 'A', text: 'negotiating' },
      { key: 'B', text: 'negotiate' },
      { key: 'C', text: 'negotiation' },
      { key: 'D', text: 'negotiated' },
    ],
    answer: 'B',
    explanation:
      'plan to の後は動詞の原形が続くため、negotiateが正しい。negotiationは名詞、negotiated/negotiatingはそれぞれ過去形・動名詞で、to不定詞の形には合わない。',
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
      '助動詞couldの後は動詞の原形が続くため、confirmが正しい。confirmationは名詞、confirmed/confirmingは過去形/現在分詞で、助動詞の後には置けない。',
    translation: '水曜日までにご出席を確認していただけますと幸いです。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'authorize',
    tags: ['動詞の形'],
    question: 'Only the director is ___ to approve expenses over five thousand dollars.',
    choices: [
      { key: 'A', text: 'authorization' },
      { key: 'B', text: 'authorized' },
      { key: 'C', text: 'authorizing' },
      { key: 'D', text: 'authorize' },
    ],
    answer: 'B',
    explanation:
      'be動詞isの後で受動態を作る過去分詞authorizedが正しい（「権限を与えられている」）。authorize/authorizingは能動形、authorizationは名詞で、この文脈には合わない。',
    translation: '5000ドルを超える経費を承認する権限があるのは部長だけだ。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'implement',
    tags: ['動詞の形'],
    question: 'The company decided to ___ the new safety policy immediately.',
    choices: [
      { key: 'A', text: 'implemented' },
      { key: 'B', text: 'implementing' },
      { key: 'C', text: 'implement' },
      { key: 'D', text: 'implementation' },
    ],
    answer: 'C',
    explanation:
      'decided to の後は動詞の原形が続くため、implementが正しい。implementationは名詞、implemented/implementingは過去形/動名詞で、to不定詞の形には合わない。',
    translation: '会社は新しい安全方針を直ちに実施することを決定した。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'comply',
    tags: ['品詞'],
    question: 'All employees must be in full ___ with the new safety regulations.',
    choices: [
      { key: 'A', text: 'compliantly' },
      { key: 'B', text: 'comply' },
      { key: 'C', text: 'compliance' },
      { key: 'D', text: 'compliant' },
    ],
    answer: 'C',
    explanation:
      '前置詞inの後で名詞complianceが正しい（"in compliance with" で「〜を遵守して」の定型表現）。comply動詞、compliant形容詞、compliantly副詞は前置詞の直後の名詞位置には合わない。',
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
      'need to の後は動詞の原形が続くため、finalizeが正しい。finalizationは名詞、finalized/finalizingは過去形/動名詞で、to不定詞の形には合わない。',
    translation: '今月末までに契約の詳細を最終決定する必要がある。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'delegate',
    tags: ['動詞の形'],
    question: 'A good manager knows how to ___ tasks effectively.',
    choices: [
      { key: 'A', text: 'delegation' },
      { key: 'B', text: 'delegated' },
      { key: 'C', text: 'delegating' },
      { key: 'D', text: 'delegate' },
    ],
    answer: 'D',
    explanation:
      'how to の後は動詞の原形が続くため、delegateが正しい。delegationは名詞、delegated/delegatingは過去形/動名詞で、to不定詞の形には合わない。',
    translation: '優秀な管理職は仕事を効果的に任せる方法を知っている。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'prioritize',
    tags: ['動詞の形'],
    question: 'You should ___ the most urgent tasks first thing in the morning.',
    choices: [
      { key: 'A', text: 'prioritized' },
      { key: 'B', text: 'prioritizing' },
      { key: 'C', text: 'prioritize' },
      { key: 'D', text: 'priority' },
    ],
    answer: 'C',
    explanation:
      '助動詞shouldの後は動詞の原形が続くため、prioritizeが正しい。priorityは名詞、prioritized/prioritizingは過去形/動名詞で、助動詞の後には置けない。',
    translation: '朝一番で最も緊急な仕事を優先すべきだ。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'facilitate',
    tags: ['動詞の形'],
    question: 'The new software is designed to ___ communication between departments.',
    choices: [
      { key: 'A', text: 'facilitating' },
      { key: 'B', text: 'facilitate' },
      { key: 'C', text: 'facilitation' },
      { key: 'D', text: 'facilitated' },
    ],
    answer: 'B',
    explanation:
      'designed to の後は動詞の原形が続くため、facilitateが正しい。facilitationは名詞、facilitated/facilitatingは過去形/動名詞で、to不定詞の形には合わない。',
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
      '助動詞willの後は動詞の原形が続くため、coordinateが正しい。coordinationは名詞、coordinated/coordinatingは過去形/動名詞で、助動詞の後には置けない。',
    translation: '彼女が今年の年次会議の運営調整を担当する。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'supervise',
    tags: ['動詞の形'],
    question: 'He was hired specifically to ___ the new production line.',
    choices: [
      { key: 'A', text: 'supervision' },
      { key: 'B', text: 'supervised' },
      { key: 'C', text: 'supervising' },
      { key: 'D', text: 'supervise' },
    ],
    answer: 'D',
    explanation:
      'to不定詞の後は動詞の原形が続くため、superviseが正しい。supervisionは名詞、supervised/supervisingは過去形/動名詞で、to不定詞の形には合わない。',
    translation: '彼は新しい生産ラインを監督するために特別に採用された。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'oversee',
    tags: ['動詞の形'],
    question: 'The project manager will ___ the entire renovation process.',
    choices: [
      { key: 'A', text: 'overseen' },
      { key: 'B', text: 'overseeing' },
      { key: 'C', text: 'oversee' },
      { key: 'D', text: 'oversight' },
    ],
    answer: 'C',
    explanation:
      '助動詞willの後は動詞の原形が続くため、overseeが正しい。oversightは名詞、overseen/overseeingは過去分詞/動名詞で、助動詞の後には置けない。',
    translation: 'プロジェクトマネージャーが改装工事全体を統括する。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'recruit',
    tags: ['動詞の形'],
    question: 'The firm plans to ___ ten new engineers this year.',
    choices: [
      { key: 'A', text: 'recruiting' },
      { key: 'B', text: 'recruit' },
      { key: 'C', text: 'recruitment' },
      { key: 'D', text: 'recruited' },
    ],
    answer: 'B',
    explanation:
      'plans to の後は動詞の原形が続くため、recruitが正しい。recruitmentは名詞、recruited/recruitingは過去形/動名詞で、to不定詞の形には合わない。',
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
      '形容詞newの後で複数の名詞hires（採用者たち）が正しい。hire動詞原形、hiring動名詞/現在分詞、hired過去形/過去分詞は、severalの後の複数名詞位置には合わない。',
    translation: '会社は先月、何人かの新規採用を行った。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'notify',
    tags: ['動詞の形'],
    question: 'Employees will be ___ of the schedule change by email.',
    choices: [
      { key: 'A', text: 'notification' },
      { key: 'B', text: 'notified' },
      { key: 'C', text: 'notifying' },
      { key: 'D', text: 'notify' },
    ],
    answer: 'B',
    explanation:
      'will be の後で受動態を作る過去分詞notifiedが正しい（「知らされる」）。notify原形、notifying現在分詞は能動的な形、notificationは名詞で受動態の形には合わない。',
    translation: '従業員はメールで予定変更について通知される。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'inform',
    tags: ['動詞の形'],
    question: 'We regret to ___ you that the flight has been delayed.',
    choices: [
      { key: 'A', text: 'informed' },
      { key: 'B', text: 'informing' },
      { key: 'C', text: 'inform' },
      { key: 'D', text: 'information' },
    ],
    answer: 'C',
    explanation:
      'regret to の後は動詞の原形が続くため、informが正しい。informationは名詞、informed/informingは過去形/動名詞で、to不定詞の形には合わない。',
    translation: '残念ながら、フライトが遅延したことをお知らせいたします。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'request',
    tags: ['品詞'],
    question: 'Please submit your ___ for a schedule change in writing.',
    choices: [
      { key: 'A', text: 'requestable' },
      { key: 'B', text: 'request' },
      { key: 'C', text: 'requesting' },
      { key: 'D', text: 'requested' },
    ],
    answer: 'B',
    explanation:
      '所有格yourの後には名詞requestが続く。requesting動名詞/現在分詞、requested過去形/過去分詞、requestable形容詞（一般的でない語）は名詞の位置には合わない。',
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
      '助動詞couldの後は動詞の原形が続くため、clarifyが正しい。clarificationは名詞、clarified/clarifyingは過去形/動名詞で、助動詞の後には置けない。',
    translation: 'サービス料に何が含まれているか明確にしていただけますか？',
    difficulty: 2,
  },
  {
    keyVocabWord: 'terminate',
    tags: ['動詞の形'],
    question: 'The company decided to ___ the agreement due to repeated delays.',
    choices: [
      { key: 'A', text: 'termination' },
      { key: 'B', text: 'terminated' },
      { key: 'C', text: 'terminating' },
      { key: 'D', text: 'terminate' },
    ],
    answer: 'D',
    explanation:
      'decided to の後は動詞の原形が続くため、terminateが正しい。terminationは名詞、terminated/terminatingは過去形/動名詞で、to不定詞の形には合わない。',
    translation: '会社は度重なる遅延を理由に契約を終了することを決定した。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'renewal',
    tags: ['品詞'],
    question: 'The lease is up for ___ at the end of this month.',
    choices: [
      { key: 'A', text: 'renewed' },
      { key: 'B', text: 'renewing' },
      { key: 'C', text: 'renewal' },
      { key: 'D', text: 'renew' },
    ],
    answer: 'C',
    explanation:
      '"be up for renewal"（更新時期を迎えている）は定型表現で、名詞renewalを用いる。renewは動詞原形、renewedは過去形/過去分詞で前置詞forの後に置けない。動名詞renewingは文法上は前置詞の後に置けるが、この定型表現では用いない。',
    translation: '賃貸契約は今月末に更新の時期を迎える。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'extension',
    tags: ['品詞'],
    question: 'We requested an ___ on the project deadline.',
    choices: [
      { key: 'A', text: 'extending' },
      { key: 'B', text: 'extension' },
      { key: 'C', text: 'extend' },
      { key: 'D', text: 'extended' },
    ],
    answer: 'B',
    explanation:
      '冠詞anの後には名詞extension（延長）が続く。extend動詞原形、extended過去形/過去分詞、extending動名詞は冠詞anの直後の名詞位置には合わない。',
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
      '冠詞aの後には名詞promotion（昇進）が続く。promote動詞原形、promoted過去形/過去分詞、promoting動名詞は冠詞の直後の名詞位置には合わない。',
    translation: '彼女は先月、シニアマネージャーへの昇進を果たした。',
    difficulty: 1,
  },
  {
    keyVocabWord: 'retirement',
    tags: ['品詞'],
    question: 'He is planning his ___ for next spring.',
    choices: [
      { key: 'A', text: 'retire' },
      { key: 'B', text: 'retired' },
      { key: 'C', text: 'retiring' },
      { key: 'D', text: 'retirement' },
    ],
    answer: 'D',
    explanation:
      '所有格hisの後には名詞retirement（退職）が続く。retireは動詞原形、retiredは過去形/過去分詞で所有格の後に置けない。動名詞retiringは文法上は所有格に続き得るが、確立した名詞retirementがあるこの文脈では用いない。',
    translation: '彼は来年の春に退職することを計画している。',
    difficulty: 1,
  },
  {
    keyVocabWord: 'evaluation',
    tags: ['品詞'],
    question: 'Her annual ___ is scheduled for next Tuesday.',
    choices: [
      { key: 'A', text: 'evaluated' },
      { key: 'B', text: 'evaluating' },
      { key: 'C', text: 'evaluation' },
      { key: 'D', text: 'evaluate' },
    ],
    answer: 'C',
    explanation:
      '形容詞annualの後には名詞evaluation（評価）が続く。evaluate動詞原形、evaluated過去形/過去分詞、evaluating動名詞は形容詞の後の名詞位置には合わない。',
    translation: '彼女の年次評価は来週火曜日に予定されている。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'performance',
    tags: ['品詞'],
    question: 'His ___ has improved significantly over the past year.',
    choices: [
      { key: 'A', text: 'performing' },
      { key: 'B', text: 'performance' },
      { key: 'C', text: 'perform' },
      { key: 'D', text: 'performed' },
    ],
    answer: 'B',
    explanation:
      '所有格Hisの後には名詞performance（成績・業績）が続く。performは動詞原形、performedは過去形/過去分詞で所有格の後に置けない。動名詞performingはこの文脈では不自然。',
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
      '形容詞thoroughの後には名詞inspection（検査）が続く。inspect動詞原形、inspected過去形/過去分詞、inspecting動名詞は形容詞の後の名詞位置には合わない。',
    translation: 'すべての車両は出荷前に徹底的な検査を受ける。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'liability',
    tags: ['品詞'],
    question: 'The company carries ___ insurance for workplace accidents.',
    choices: [
      { key: 'A', text: 'liable' },
      { key: 'B', text: 'liably' },
      { key: 'C', text: 'liabilities' },
      { key: 'D', text: 'liability' },
    ],
    answer: 'D',
    explanation:
      '複合名詞"liability insurance"（賠償責任保険）として単数形liabilityが正しい。liable形容詞、liably副詞は名詞insuranceを修飾できず、liabilities複数形は定型表現として不自然。',
    translation: '会社は労働災害に対する賠償責任保険に加入している。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'warranty',
    tags: ['品詞'],
    question: 'The product comes with a two-year ___.',
    choices: [
      { key: 'A', text: 'warranted' },
      { key: 'B', text: 'warranting' },
      { key: 'C', text: 'warranty' },
      { key: 'D', text: 'warrant' },
    ],
    answer: 'C',
    explanation:
      '形容詞句two-yearの後には名詞warranty（保証）が続く。warrant動詞原形、warranted過去形/過去分詞、warranting動名詞は名詞の位置には合わない。',
    translation: 'この製品には2年間の保証が付いている。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'certification',
    tags: ['品詞'],
    question: 'She earned a professional ___ in project management last year.',
    choices: [
      { key: 'A', text: 'certifying' },
      { key: 'B', text: 'certification' },
      { key: 'C', text: 'certify' },
      { key: 'D', text: 'certified' },
    ],
    answer: 'B',
    explanation:
      '形容詞professionalの後には名詞certification（認定）が続く。certify動詞原形、certified過去形/過去分詞、certifying動名詞は形容詞の後の名詞位置には合わない。',
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
      { key: 'D', text: 'Registers' },
    ],
    answer: 'A',
    explanation:
      '文頭の主語位置には、冠詞なしで使える不可算名詞Registration（登録受付）が入る。Registerは動詞原形（命令文と解釈しても後続のclosesと整合しない）、Registeredは過去形/過去分詞で主語になれない。Registersは複数名詞と解釈しても単数動詞closesと数が合わない。',
    translation: 'カンファレンスの登録受付は次の金曜日に締め切られる。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'subscription',
    tags: ['品詞'],
    question: 'Employees receive a free ___ to the industry magazine.',
    choices: [
      { key: 'A', text: 'subscribe' },
      { key: 'B', text: 'subscribed' },
      { key: 'C', text: 'subscribing' },
      { key: 'D', text: 'subscription' },
    ],
    answer: 'D',
    explanation:
      '形容詞freeの後には名詞subscription（購読）が続く。subscribe動詞原形、subscribed過去形/過去分詞、subscribing動名詞は形容詞の後の名詞位置には合わない。',
    translation: '従業員は業界誌の無料購読を受けられる。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'projection',
    tags: ['品詞'],
    question: 'Financial ___ for the next quarter were presented at the board meeting.',
    choices: [
      { key: 'A', text: 'projected' },
      { key: 'B', text: 'projecting' },
      { key: 'C', text: 'projections' },
      { key: 'D', text: 'project' },
    ],
    answer: 'C',
    explanation:
      '形容詞Financialに続き、複数形の動詞wereと数が一致する複数名詞projectionsが正しい。projectは単数で数が合わず、projectedは過去分詞で主語となる名詞が無くなり、projectingは動名詞で数も文意も合わない。',
    translation: '来四半期の財務予測が取締役会で提示された。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'acquisition',
    tags: ['品詞'],
    question: 'The ___ helped the company expand into new markets.',
    choices: [
      { key: 'A', text: 'acquiring' },
      { key: 'B', text: 'acquisition' },
      { key: 'C', text: 'acquire' },
      { key: 'D', text: 'acquired' },
    ],
    answer: 'B',
    explanation:
      '冠詞Theの後で文の主語となる名詞acquisition（買収）が正しい。acquire動詞原形、acquired過去形/過去分詞、acquiring動名詞は冠詞の直後の主語位置には合わない。',
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
      '冠詞Theの後で文の主語となる名詞merger（合併）が正しい。merge動詞原形、merged過去形/過去分詞、merging動名詞は冠詞の直後の主語位置には合わない。',
    translation: '両社の合併が本日発表された。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'endorsement',
    tags: ['品詞'],
    question: 'The athlete signed an ___ deal with a sportswear brand.',
    choices: [
      { key: 'A', text: 'endorse' },
      { key: 'B', text: 'endorses' },
      { key: 'C', text: 'endorsing' },
      { key: 'D', text: 'endorsement' },
    ],
    answer: 'D',
    explanation:
      '冠詞anの後で複合名詞"endorsement deal"（宣伝起用契約）を作る名詞endorsementが正しい。endorse/endorsesは動詞で名詞を修飾できず、endorsingは"endorsing deal"という表現が成立せず不自然。',
    translation: 'その選手はスポーツウェアブランドと広告契約を結んだ。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'correspondence',
    tags: ['品詞'],
    question: 'All ___ with the client should be kept on file.',
    choices: [
      { key: 'A', text: 'corresponded' },
      { key: 'B', text: 'corresponding' },
      { key: 'C', text: 'correspondence' },
      { key: 'D', text: 'correspond' },
    ],
    answer: 'C',
    explanation:
      '数量形容詞Allの後には名詞correspondence（やり取り）が続く。correspond動詞原形、corresponded過去形/過去分詞、corresponding動名詞/現在分詞は名詞の位置には合わない。',
    translation: '取引先とのやり取りはすべて記録として保管すべきだ。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'participate',
    tags: ['動詞の形'],
    question: 'Employees are encouraged to ___ in the training program.',
    choices: [
      { key: 'A', text: 'participating' },
      { key: 'B', text: 'participate' },
      { key: 'C', text: 'participation' },
      { key: 'D', text: 'participated' },
    ],
    answer: 'B',
    explanation:
      'to不定詞の後は動詞の原形が続くため、participateが正しい。participationは名詞、participated/participatingは過去形/動名詞で、to不定詞の形には合わない。',
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
      '冠詞aの後には名詞reservation（予約）が続く。reserve動詞原形、reserved過去形/過去分詞、reserving動名詞は冠詞の直後の名詞位置には合わない。',
    translation: '今夜2名で予約をお願いしたいのですが。',
    difficulty: 1,
  },
  {
    keyVocabWord: 'expenditure',
    tags: ['品詞'],
    question: 'Total ___ on marketing rose sharply this year.',
    choices: [
      { key: 'A', text: 'expend' },
      { key: 'B', text: 'expended' },
      { key: 'C', text: 'expending' },
      { key: 'D', text: 'expenditure' },
    ],
    answer: 'D',
    explanation:
      '形容詞Totalの後で文の主語となる名詞expenditure（支出）が正しい。expend動詞原形、expended過去形/過去分詞、expending動名詞は主語位置には合わない。',
    translation: '今年のマーケティングへの総支出は急激に増加した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'account',
    tags: ['接続詞vs前置詞'],
    question: 'The transaction failed ___ insufficient funds in the account.',
    choices: [
      { key: 'A', text: 'although' },
      { key: 'B', text: 'despite' },
      { key: 'C', text: 'because' },
      { key: 'D', text: 'because of' },
    ],
    answer: 'D',
    explanation:
      '空所の後は名詞句（insufficient funds）なので前置詞句because ofが正しい。becauseとalthoughは後ろに節（主語＋動詞）が必要な接続詞。despiteは前置詞だが「〜にもかかわらず」となり文意が通らない。',
    translation: '口座の残高不足のためその取引は失敗した。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'budget',
    tags: ['接続詞vs前置詞'],
    question: 'The project was delayed ___ the budget had not been approved yet.',
    choices: [
      { key: 'A', text: 'despite' },
      { key: 'B', text: 'because' },
      { key: 'C', text: 'because of' },
      { key: 'D', text: 'due to' },
    ],
    answer: 'B',
    explanation:
      '空所の後は節(the budget had not...)なので接続詞becauseが正しい。because of/due toは後ろに名詞句が必要な前置詞、despiteは意味が逆（〜にもかかわらず）で合わない。',
    translation: 'そのプロジェクトは予算がまだ承認されていなかったため遅れた。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'quality',
    tags: ['品詞'],
    question: 'This year’s products are of much higher ___ than last year’s.',
    choices: [
      { key: 'A', text: 'quality' },
      { key: 'B', text: 'qualities' },
      { key: 'C', text: 'qualify' },
      { key: 'D', text: 'qualified' },
    ],
    answer: 'A',
    explanation:
      '"of ... quality"は不可算名詞として単数形qualityで使うのが正しい。qualitiesは可算的な複数形で不自然、qualify動詞、qualified過去分詞は名詞位置に合わない。',
    translation: '今年の製品は昨年のものよりずっと品質が高い。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'competitor',
    tags: ['比較'],
    question: 'Our new model performs better than any other ___ on the market.',
    choices: [
      { key: 'A', text: 'competitors' },
      { key: 'B', text: 'compete' },
      { key: 'C', text: 'competing' },
      { key: 'D', text: 'competitor' },
    ],
    answer: 'D',
    explanation:
      '「比較級 + than any other + 単数名詞」の形で、any otherの後には単数名詞competitorが入る。competitorsは複数形でany otherと共起しない。competeは動詞原形、competingは現在分詞/動名詞で、名詞の位置には合わない。',
    translation: '当社の新モデルは市場の他のどの競合よりも性能が優れている。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'strategy',
    tags: ['品詞'],
    question: 'This marketing ___ is far more effective than the previous one.',
    choices: [
      { key: 'A', text: 'strategically' },
      { key: 'B', text: 'strategize' },
      { key: 'C', text: 'strategy' },
      { key: 'D', text: 'strategic' },
    ],
    answer: 'C',
    explanation:
      '指示詞Thisの後で複合名詞"marketing strategy"を作る名詞strategyが正しい。strategic形容詞、strategically副詞、strategize動詞は名詞の位置には合わない。',
    translation: 'このマーケティング戦略は以前のものよりずっと効果的だ。',
    difficulty: 2,
  },
  {
    keyVocabWord: 'candidate',
    tags: ['代名詞・関係詞'],
    question: 'The candidate ___ resume impressed the hiring committee got the job.',
    choices: [
      { key: 'A', text: 'whom' },
      { key: 'B', text: 'whose' },
      { key: 'C', text: 'who' },
      { key: 'D', text: 'which' },
    ],
    answer: 'B',
    explanation:
      '空所の後のresumeとの所有関係を表す関係代名詞whoseが正しい。who/whomは人物を直接指す主格/目的格、whichは物を指す関係代名詞で、所有関係を表せない。',
    translation: '履歴書が採用委員会に感銘を与えた候補者がその職を得た。',
    difficulty: 4,
  },
  {
    keyVocabWord: 'proposal',
    tags: ['代名詞・関係詞'],
    question: 'The proposal ___ we submitted last week was finally approved.',
    choices: [
      { key: 'A', text: 'which' },
      { key: 'B', text: 'who' },
      { key: 'C', text: 'whom' },
      { key: 'D', text: 'where' },
    ],
    answer: 'A',
    explanation:
      '先行詞proposal（物）を受ける目的格の関係代名詞whichが正しい（省略も可）。who/whomは人物を指す関係代名詞、whereは場所を指す関係副詞で、いずれも物を先行詞にはできない。',
    translation: '先週提出した提案書がついに承認された。',
    difficulty: 3,
  },
  {
    keyVocabWord: 'client',
    tags: ['代名詞・関係詞'],
    question: 'The client ___ we met yesterday wants to revise the contract.',
    choices: [
      { key: 'A', text: 'whose' },
      { key: 'B', text: 'which' },
      { key: 'C', text: 'where' },
      { key: 'D', text: 'whom' },
    ],
    answer: 'D',
    explanation:
      '先行詞client（人）を受ける目的格の関係代名詞whomが正しい（口語ではwhoも可）。whose所有格、B物を指す関係代名詞、C関係副詞は文脈に合わない。',
    translation: '昨日会ったクライアントが契約の修正を望んでいる。',
    difficulty: 4,
  },
]
