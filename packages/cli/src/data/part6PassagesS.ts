// Part6（text_passage）1パッセージ4空所の初期在庫データ本体（T-107。正本: docs/24 3.1節・3.6節）。
//
// 30セット・各4設問=計120設問。本文には空所マーカー[[1]]〜[[4]]を1から連番で埋め込む
// （空所番号=subQuestionsの並び順に対応。shared-schemaのvalidatePart6Markersが整合検証する）。
// 設問タイプは①〜③文法・語彙・接続詞のいずれか、④は文挿入問題（1セットに1問。位置は
// 本文の自然な切れ目=最後の空所に固定）。各設問はcorrectText/distractorsの形で書き、
// textPassageQuestion.tsのrotateTextPassageChoicesが4択A〜Dへの決定的ローテーションを行う
// （part34Question.ts/part5Question.tsと同じM1レビュー⑦の方式）。
// keyVocabWordsはS/A/B語彙カード（600語）から選び、correctText（=choices）に実在する語のみを使う
// （text_passageのkeyVocab検査対象はpassages本文＋subQuestionsのquestion/choices。shared-schema
// validate.tsのvalidateKeyVocab参照）。
// 全文・設問はエージェント直接執筆のオリジナル（市販教材の流用なし。CLAUDE.md不変条件）。

export type Part6SubQuestionKind = 'grammar' | 'vocab' | 'connector' | 'insertion'

export interface Part6RawSubQuestion {
  kind: Part6SubQuestionKind
  correctText: string
  distractors: readonly [string, string, string]
  explanation: string
  translation: string
}

export interface Part6RawEntry {
  setId: string
  difficulty: number
  tags: string[]
  keyVocabWords: string[]
  passageKind: string
  /** 本文。[[1]]〜[[4]]を1から連番で埋め込む */
  passageText: string
  subQuestions: readonly [
    Part6RawSubQuestion,
    Part6RawSubQuestion,
    Part6RawSubQuestion,
    Part6RawSubQuestion,
  ]
}

export const PART6_ENTRIES_S: Part6RawEntry[] = [
  {
    setId: 'p6-001',
    difficulty: 2,
    tags: ['動詞の形', '接続詞vs前置詞'],
    keyVocabWords: ['facility', 'renovation'],
    passageKind: 'email',
    passageText:
      'Subject: Office Relocation Update\n\nDear Staff,\n\nAs most of you know, our current facility [[1]] a major renovation next month, so the entire Marketing team will move to the third floor for eight weeks. Please pack any personal items in the boxes provided by Friday. IT will [[2]] all computers and phones over the weekend, so do not attempt to move electronics yourself. [[3]] the move, temporary desks will be assigned on a first-come basis. [[4]] We appreciate your patience during this transition.\n\nBest regards,\nFacilities Team',
    subQuestions: [
      {
        kind: 'grammar',
        correctText: 'is undergoing',
        distractors: ['undergo', 'undergone', 'had undergone'],
        explanation:
          '主語facilityは単数で、来月から始まる予定の進行中の出来事を表すため現在進行形が適切。原形・過去分詞・過去完了は時制・主語一致の点で不適。',
        translation: '現在の施設は来月大規模な改装を行う予定です。',
      },
      {
        kind: 'vocab',
        correctText: 'disconnect',
        distractors: ['disconnecting', 'disconnection', 'disconnects'],
        explanation:
          '助動詞willの直後は動詞の原形が入る。disconnectingは動名詞、disconnectionは名詞、disconnectsは三単現でwillの後には続かない。',
        translation: 'ITは週末にすべてのパソコンと電話の接続を外します。',
      },
      {
        kind: 'connector',
        correctText: 'During',
        distractors: ['Although', 'Because', 'Unless'],
        explanation:
          '直後が名詞句the moveなので前置詞Duringが入る。Although/Because/Unlessは接続詞で後ろに主語+動詞の節が必要になる。',
        translation: '引っ越しの間、仮の席は早い者順で割り当てられます。',
      },
      {
        kind: 'insertion',
        correctText: 'A full floor map with new seat numbers will be emailed on Monday.',
        distractors: [
          'The cafeteria on the second floor will remain open as usual.',
          'Employees are reminded to submit expense reports by the fifth of each month.',
          'The company picnic has been rescheduled to early June.',
        ],
        explanation:
          '直前の文が仮の席割りに触れているため、座席番号を知らせるフロアマップの案内が最も自然につながる。他の3文は移動や座席と無関係。',
        translation: '新しい座席番号付きのフロア図を月曜日にメールで送ります。',
      },
    ],
  },
  {
    setId: 'p6-002',
    difficulty: 2,
    tags: ['動詞の形', '接続詞vs前置詞'],
    keyVocabWords: ['maintenance', 'inspection'],
    passageKind: 'notice',
    passageText:
      'NOTICE: Elevator Maintenance\n\nThe elevator in the West Building [[1]] out of service on Thursday, June 4, from 9 a.m. to 3 p.m. for routine maintenance. A licensed technician will [[2]] a full inspection of the cables and doors during this time. Visitors and staff on the upper floors should use the stairs or the elevator in the East Building. [[3]] the inspection reveals a problem, the elevator may remain closed longer than planned. [[4]] We apologize for any inconvenience this may cause.',
    subQuestions: [
      {
        kind: 'grammar',
        correctText: 'will be',
        distractors: ['is being', 'was', 'has been'],
        explanation:
          '文末にon Thursdayという未来の予定が示されているため、未来を表すwill beが適切。is being/was/has beenはいずれも未来の予定を表せない。',
        translation: '西棟のエレベーターは6月4日木曜午前9時から午後3時まで停止します。',
      },
      {
        kind: 'vocab',
        correctText: 'perform',
        distractors: ['perform to', 'be performed', 'performing'],
        explanation:
          '助動詞willの後は動詞の原形が続く。performは他動詞でto不要、be performedは受動態で主語と合わない、performingは動名詞でwillに続けられない。',
        translation: '技術者はその間にケーブルとドアの点検を行います。',
      },
      {
        kind: 'connector',
        correctText: 'If',
        distractors: ['Despite', 'So that', 'In case of'],
        explanation:
          '直後に主語+動詞（the inspection reveals）が続く条件節なので接続詞Ifが適切。Despite/In case ofは前置詞、So thatは目的を表し意味が合わない。',
        translation:
          '点検で問題が見つかった場合、エレベーターは予定より長く停止することがあります。',
      },
      {
        kind: 'insertion',
        correctText: 'An updated schedule will be posted in the lobby if the closure is extended.',
        distractors: [
          'The elevator was installed three years ago by a local contractor.',
          'Parking permits must be renewed at the front desk every January.',
          'The building will host a fire drill later this month.',
        ],
        explanation:
          '直前の文が停止が延びる可能性に触れているため、延長時の更新スケジュール告知が自然につながる。他の3文は今回の停止と無関係。',
        translation: '停止が延びる場合は、更新されたスケジュールをロビーに掲示します。',
      },
    ],
  },
  {
    setId: 'p6-003',
    difficulty: 3,
    tags: ['接続詞vs前置詞', '動詞の形'],
    keyVocabWords: ['expense', 'reimbursement', 'deadline'],
    passageKind: 'memo',
    passageText:
      "MEMO\nTo: All Employees\nFrom: Accounting Department\n\nStarting next quarter, the expense reimbursement process [[1]] change. All receipts must be submitted through the new online system rather than on paper forms. The deadline for each month's expenses [[2]] the fifth business day of the following month. [[3]] the deadline is missed, reimbursement may be delayed until the next payment cycle. [[4]] Please direct any questions to the accounting help desk.",
    subQuestions: [
      {
        kind: 'grammar',
        correctText: 'will',
        distractors: ['would', 'has', 'having'],
        explanation:
          '文頭のStarting next quarterから未来の変更を述べているためwillが適切。wouldは仮定法・過去の推量、hasは現在完了で未来を表せない、havingは動名詞で主語の後に助動詞として置けない。',
        translation: '来四半期から経費精算のプロセスが変更されます。',
      },
      {
        kind: 'vocab',
        correctText: 'is',
        distractors: ['are', 'be', 'being'],
        explanation:
          '主語The deadlineは単数なのでisが適切。areは複数主語用、beは原形で単独では動詞として使えない、beingは進行・受動の補助でここでは不要。',
        translation: '毎月の経費の締切は翌月の第5営業日です。',
      },
      {
        kind: 'connector',
        correctText: 'If',
        distractors: ['Despite', 'During', 'Except for'],
        explanation:
          '直後に主語+動詞（the deadline is missed）が続く条件節なのでIfが適切。Despite/During/Except forは前置詞で節を続けられない。',
        translation: '締切に遅れた場合、精算は次の支払いサイクルまで延びることがあります。',
      },
      {
        kind: 'insertion',
        correctText: 'A short training video on the new system is available on the intranet.',
        distractors: [
          'The company holiday party will be held in December this year.',
          'Employees should park only in the designated visitor spaces.',
          'The accounting department relocated to the fourth floor in March.',
        ],
        explanation:
          '新しいオンラインシステムへの移行を説明した直後の一文として、操作を学べる研修動画の案内が自然に続く。他の3文は経費精算と無関係。',
        translation: '新システムの操作を説明する短い研修動画が社内サイトで見られます。',
      },
    ],
  },
  {
    setId: 'p6-004',
    difficulty: 2,
    tags: ['前置詞コロケーション', '動詞の形'],
    keyVocabWords: ['upgrade', 'network'],
    passageKind: 'email',
    passageText:
      'Subject: Scheduled Network Upgrade\n\nDear Team,\n\nOur IT department will [[1]] a network upgrade this Saturday to improve connection speed across all offices. During the upgrade, the network [[2]] be unavailable from 6 a.m. to noon. Any files saved [[3]] the shared drive will remain safe, but please save your work locally as a backup. [[4]] Contact IT support if you notice any issues after the upgrade is complete.',
    subQuestions: [
      {
        kind: 'grammar',
        correctText: 'perform',
        distractors: ['performing', 'performed', 'performs'],
        explanation:
          '助動詞willの後は動詞の原形が続くためperformが適切。performingは動名詞、performedは過去形/過去分詞、performsは三単現でwillの直後には置けない。',
        translation: 'IT部門は今週土曜日に接続速度改善のためのネットワーク更新を行います。',
      },
      {
        kind: 'vocab',
        correctText: 'will',
        distractors: ['does', 'is', 'has'],
        explanation:
          'be unavailableという原形の前には助動詞willが必要。does/is/hasはこの形の前に置いても文法的に成立しない。',
        translation: '更新中、ネットワークは午前6時から正午まで利用できません。',
      },
      {
        kind: 'connector',
        correctText: 'on',
        distractors: ['at', 'by', 'from'],
        explanation:
          '「共有ドライブ上に保存された」という意味ではsaved on the shared driveが自然な前置詞コロケーション。at/by/fromは同じ意味を表さない。',
        translation:
          '共有ドライブに保存されたファイルは安全なままですが、念のためローカルにも保存してください。',
      },
      {
        kind: 'insertion',
        correctText: 'The upgrade will not affect email or the company website.',
        distractors: [
          'The company plans to open a new office overseas next year.',
          'Employees are encouraged to take the stairs for exercise.',
          'The cafeteria menu will change starting next Monday.',
        ],
        explanation:
          '直前でネットワークが一時利用不可になると述べた後、影響範囲を補足する一文（メールとサイトは影響なし）が自然につながる。他の3文は更新作業と無関係。',
        translation: 'この更新はメールや会社のウェブサイトには影響しません。',
      },
    ],
  },
  {
    setId: 'p6-005',
    difficulty: 3,
    tags: ['代名詞・関係詞', '接続詞vs前置詞'],
    keyVocabWords: ['conference', 'venue', 'itinerary'],
    passageKind: 'email',
    passageText:
      'Subject: Annual Sales Conference — Registration Reminder\n\nDear Attendee,\n\nThis is a reminder that registration for the annual sales conference closes this Friday. The conference venue, [[1]] is located near the airport, offers a shuttle service every thirty minutes. Once you register, you [[2]] receive a full itinerary with session times and room numbers. [[3]] you have already registered, please double-check that your dietary preferences are up to date. [[4]] We look forward to seeing you there.',
    subQuestions: [
      {
        kind: 'grammar',
        correctText: 'which',
        distractors: ['who', 'whose', 'what'],
        explanation:
          '先行詞the venue（物）を修飾する関係代名詞なのでwhichが適切。whoは人を先行詞にし、whoseは所有格、whatは先行詞を取らない。',
        translation: '空港近くにある会議会場では30分おきにシャトルサービスが利用できます。',
      },
      {
        kind: 'vocab',
        correctText: 'will',
        distractors: ['would', 'should', 'must'],
        explanation:
          '登録後に自動的に届く未来の出来事を述べているためwillが適切。wouldは仮定、shouldは義務・助言、mustは強い義務でここでは意味が合わない。',
        translation: '登録すると、セッション時間と会場番号が書かれた全日程表を受け取ります。',
      },
      {
        kind: 'connector',
        correctText: 'If',
        distractors: ['Unless', 'Whereas', 'In case of'],
        explanation:
          '直後に主語+動詞の節が続き「もし既に登録済みなら」という条件を表すIfが適切。Unlessは否定条件で意味が逆になり、Whereasは対比を表し、In case ofは前置詞句で節を続けられない。',
        translation: '既に登録済みの方は、食事の希望が最新であるか再確認してください。',
      },
      {
        kind: 'insertion',
        correctText: 'Late registrations will not be accepted under any circumstances.',
        distractors: [
          'The conference was first held over twenty years ago.',
          'Parking at the venue is free for all registered guests.',
          "Last year's keynote speaker received excellent feedback.",
        ],
        explanation:
          '直前の文が登録締切のリマインダーであるため、締切後の登録を一切受け付けないという厳格な注意が最も自然に続く。他の3文は登録の締切と直接関係しない。',
        translation: '締切後の登録は、いかなる事情でも受け付けられません。',
      },
    ],
  },
  {
    setId: 'p6-006',
    difficulty: 3,
    tags: ['比較', '動詞の形'],
    keyVocabWords: ['authorize'],
    passageKind: 'notice',
    passageText:
      'NOTICE: Updated Security Badge Policy\n\nEffective July 1, all employees must wear their security badge visibly at [[1]] times while inside the building. The new badges include an authentication chip that is [[2]] secure than the previous magnetic strip. Employees who have not been [[3]] to enter restricted areas should not attempt to use side entrances. [[4]] Badges can be updated at the security desk on the ground floor.',
    subQuestions: [
      {
        kind: 'grammar',
        correctText: 'all',
        distractors: ['every', 'each', 'most'],
        explanation:
          '「常時」という意味の定型表現はat all timesであり、all以外の語はこの慣用句では使えない。',
        translation:
          '7月1日以降、全従業員は建物内で常にセキュリティバッジを見えるように着用しなければなりません。',
      },
      {
        kind: 'vocab',
        correctText: 'more',
        distractors: ['most', 'much', 'many'],
        explanation:
          '直後にthanが続く比較の文なのでmoreが適切。mostは最上級、much/manyはthanと結び付く比較表現を作れない。',
        translation:
          '新しいバッジには、以前の磁気ストライプよりも安全な認証チップが搭載されています。',
      },
      {
        kind: 'vocab',
        correctText: 'authorized',
        distractors: ['authorize', 'authorizing', 'authorization'],
        explanation:
          '「have been+過去分詞」の受動態が正しい形。authorizeは原形、authorizingは進行形用、authorizationは名詞でこの位置には入らない。',
        translation:
          '制限区域への入室を許可されていない従業員は、側面の入口を使おうとしないでください。',
      },
      {
        kind: 'insertion',
        correctText: 'Lost or damaged badges should be reported immediately to security staff.',
        distractors: [
          'The building was renovated two years ago to add more parking.',
          'Employees may bring guests to the cafeteria during lunch hours.',
          'The security team hosts a training session every spring.',
        ],
        explanation:
          '直後の文がバッジの更新場所の案内であるため、その前に紛失・破損時の報告手順を置くとバッジ管理の話題として自然につながる。他の3文はバッジ管理と直接関係しない。',
        translation: '紛失または破損したバッジは、直ちに警備担当者に報告してください。',
      },
    ],
  },
  {
    setId: 'p6-007',
    difficulty: 2,
    tags: ['品詞', '前置詞コロケーション'],
    keyVocabWords: ['reservation'],
    passageKind: 'memo',
    passageText:
      'MEMO\nTo: Department Heads\nFrom: Office Administration\n\nTo make meeting room [[1]] fairer for everyone, we are launching a new booking system next Monday. Each department will receive an equal number of reservation credits [[2]] month. Rooms cannot be booked more than two weeks [[3]] advance under the new system. [[4]] Please share this update with your teams before the launch date.',
    subQuestions: [
      {
        kind: 'grammar',
        correctText: 'reservations',
        distractors: ['reserve', 'reserved', 'reserving'],
        explanation:
          '直前のmeeting roomを修飾し、booking systemの対象である名詞が必要なのでreservations（予約）が適切。reserveは動詞、reservedは形容詞的用法だが文意に合わず、reservingは動名詞でここには入らない。',
        translation:
          '誰にとっても会議室の予約をより公平にするため、来週月曜から新しい予約システムを開始します。',
      },
      {
        kind: 'vocab',
        correctText: 'per',
        distractors: ['within', 'among', 'upon'],
        explanation:
          '「月ごとに」という意味を表す前置詞はper monthが定型。withinは「〜以内に」で意味が合わず、amongは複数名詞を取る前置詞、uponは「〜の上に・〜次第」でいずれもこの文脈に合わない。',
        translation: '各部署は月ごとに同数の予約枠を受け取ります。',
      },
      {
        kind: 'connector',
        correctText: 'in',
        distractors: ['on', 'at', 'for'],
        explanation:
          '「事前に」という意味の定型表現はin advanceであり、on/at/forはこの慣用句では使えない。',
        translation: '新システムでは、会議室は2週間より前に予約することができません。',
      },
      {
        kind: 'insertion',
        correctText: 'Unused credits will not carry over to the following month.',
        distractors: [
          'The office recently switched to recycled paper for all printing.',
          'The IT helpdesk is open from 9 a.m. to 5 p.m. on weekdays.',
          'A new coffee machine was installed in the break room last week.',
        ],
        explanation:
          '直前で予約枠の付与について述べた後、未使用枠の扱い（翌月に持ち越されない）を補足する一文が自然につながる。他の3文は予約システムと無関係。',
        translation: '未使用の予約枠は翌月に持ち越されません。',
      },
    ],
  },
  {
    setId: 'p6-008',
    difficulty: 3,
    tags: ['動詞の形', '前置詞コロケーション'],
    keyVocabWords: ['invoice', 'reconcile'],
    passageKind: 'email',
    passageText:
      'Subject: Invoice Discrepancy — Order 4482\n\nDear Ms. Patel,\n\nWe [[1]] your invoice for order 4482 and noticed the total does not match our purchase order. Our records show a quantity of 200 units, while the invoice [[2]] 250 units. Could you please reconcile this difference and send a corrected invoice [[3]] the end of this week? [[4]] We would like to complete payment before the end of the month.',
    subQuestions: [
      {
        kind: 'grammar',
        correctText: 'have reviewed',
        distractors: ['review', 'reviewing', 'will review'],
        explanation:
          '直後にnoticedという過去形が続き、過去に行った確認作業が現在の指摘につながっているため、現在完了形have reviewedが最も自然。原形・進行形・未来形は文脈の時制と合わない。',
        translation:
          '注文4482の請求書を確認したところ、合計額が発注書と一致しないことに気づきました。',
      },
      {
        kind: 'vocab',
        correctText: 'lists',
        distractors: ['list', 'listing', 'listed'],
        explanation:
          '主語the invoiceは単数のため三単現のlistsが適切。listは原形/複数形用、listingは動名詞、listedは過去形でwhileが導く現在の対比には合わない。',
        translation: '当社の記録では200個となっていますが、請求書には250個と記載されています。',
      },
      {
        kind: 'connector',
        correctText: 'by',
        distractors: ['until', 'since', 'during'],
        explanation:
          '「今週末までに」という期限を表す前置詞はbyが適切。untilは継続の終点、sinceは起点、duringは期間中を表し、いずれも期限の意味には合わない。',
        translation: 'この差異を確認し、今週末までに修正した請求書を送っていただけますか。',
      },
      {
        kind: 'insertion',
        correctText: 'Our accounting team is available to discuss the matter by phone if needed.',
        distractors: [
          'The company plans to expand its warehouse next year.',
          'Order 4482 was shipped by a different carrier than usual.',
          'We recently updated our supplier evaluation process.',
        ],
        explanation:
          '直前で修正請求書の送付を依頼しているため、必要なら電話で相談できるという補足が自然に続く。他の3文は請求書の不一致問題と直接関係しない。',
        translation: '必要であれば、当社の経理チームが電話でこの件についてご相談に応じます。',
      },
    ],
  },
  {
    setId: 'p6-009',
    difficulty: 3,
    tags: ['接続詞vs前置詞', '動詞の形'],
    keyVocabWords: ['workforce', 'compliance'],
    passageKind: 'memo',
    passageText:
      'MEMO\nTo: All Staff\nFrom: Human Resources\n\nBeginning next month, our remote work policy will be updated to give the workforce more flexibility. Employees [[1]] work from home up to three days per week, provided their manager approves the arrangement in advance. [[2]] the new policy takes effect, all employees must complete a short online compliance training. [[3]] the training, employees will confirm they understand the data security requirements for remote work. [[4]] Managers will receive a separate briefing next week.',
    subQuestions: [
      {
        kind: 'grammar',
        correctText: 'may',
        distractors: ['might have', 'would have', 'could have'],
        explanation:
          '現在から将来にかけての許可を表す用法にはmayが適切。might have/would have/could haveはいずれも過去に対する推量や仮定を表し、これからの許可を述べる文には合わない。',
        translation: '従業員は、事前に上司の承認があれば週に最大3日まで自宅で勤務できます。',
      },
      {
        kind: 'connector',
        correctText: 'Before',
        distractors: ['Despite', 'Because of', 'In spite of'],
        explanation:
          '直後に主語+動詞（the new policy takes effect）が続く時間関係を表す接続詞なのでBeforeが適切。Despite/Because of/In spite ofは前置詞でこの節構造には合わない。',
        translation:
          '新しい制度が施行される前に、全従業員は簡単なオンラインコンプライアンス研修を完了する必要があります。',
      },
      {
        kind: 'connector',
        correctText: 'During',
        distractors: ['While', 'Meanwhile', 'Although'],
        explanation:
          '直後が名詞句the trainingなので前置詞Duringが適切。While/Meanwhile/Althoughは接続詞または副詞で名詞句を直接続けられない。',
        translation:
          '研修中、従業員はリモート勤務のデータセキュリティ要件を理解していることを確認します。',
      },
      {
        kind: 'insertion',
        correctText: 'The training takes about twenty minutes to complete online.',
        distractors: [
          'The company was founded more than thirty years ago.',
          'Employees can order office supplies through the intranet portal.',
          'The human resources office relocated last spring.',
        ],
        explanation:
          '直前でコンプライアンス研修の完了を求めているため、研修の所要時間を補足する一文が自然に続く。他の3文はこの研修と直接関係しない。',
        translation: 'この研修はオンラインで完了するまで約20分かかります。',
      },
    ],
  },
  {
    setId: 'p6-010',
    difficulty: 2,
    tags: ['前置詞コロケーション', '接続詞vs前置詞'],
    keyVocabWords: ['recycling', 'sustainable'],
    passageKind: 'notice',
    passageText:
      'NOTICE: New Recycling Program\n\nStarting this month, the office is launching a recycling program to support our sustainable business goals. Blue bins will be placed [[1]] every floor for paper and cardboard, while green bins will be used [[2]] plastic and glass. Employees are asked to rinse containers [[3]] placing them in the green bins. [[4]] A short guide explaining what belongs in each bin will be posted near the bins.',
    subQuestions: [
      {
        kind: 'connector',
        correctText: 'on',
        distractors: ['in', 'at', 'to'],
        explanation:
          '「各フロアに」という意味ではon every floorが自然な前置詞コロケーション。in/at/toはこの文脈で位置を表す表現として使われない。',
        translation:
          '各フロアには紙・段ボール用の青い箱が設置され、プラスチック・ガラス用には緑の箱が使われます。',
      },
      {
        kind: 'connector',
        correctText: 'for',
        distractors: ['with', 'of', 'about'],
        explanation:
          '「〜のために使われる」という意味を表すused forが自然な前置詞コロケーション。with/of/aboutはこの意味を表さない。',
        translation: '緑の箱はプラスチックとガラス用に使われます。',
      },
      {
        kind: 'connector',
        correctText: 'before',
        distractors: ['despite', 'unless', 'although'],
        explanation:
          '直後が動名詞placingなので前置詞beforeが適切。despiteは意味が合わず、unless/althoughは接続詞で動名詞句を直接続けられない。',
        translation: '従業員は緑の箱に入れる前に容器をすすぐようお願いします。',
      },
      {
        kind: 'insertion',
        correctText:
          'Batteries and electronics should still be taken to the recycling drop-off in the lobby.',
        distractors: [
          'The office cafeteria will introduce a new lunch menu next week.',
          'Employees are reminded to badge in at the front desk each morning.',
          'A new printer was installed on the third floor last month.',
        ],
        explanation:
          '直前でリサイクル箱の使い分けを説明した後、電池や電子機器は別の回収場所へという補足情報が自然に続く。他の3文はリサイクル制度と関係しない。',
        translation: '電池や電子機器は、依然としてロビーの回収場所へ持って行ってください。',
      },
    ],
  },
  {
    setId: 'p6-011',
    difficulty: 3,
    tags: ['動詞の形'],
    keyVocabWords: ['catering'],
    passageKind: 'email',
    passageText:
      'Subject: Cafeteria Menu Change Notice\n\nDear Employees,\n\nOur catering provider [[1]] the lunch menu starting next Monday to include more vegetarian and gluten-free options. The salad bar [[2]] available daily, and hot meal choices will rotate weekly. If you have a specific dietary need not covered by the new menu, please [[3]] the cafeteria manager directly. [[4]] We hope these changes make lunchtime more enjoyable for everyone.',
    subQuestions: [
      {
        kind: 'grammar',
        correctText: 'will update',
        distractors: ['updates', 'updating', 'has updated'],
        explanation:
          '文末のstarting next Mondayから未来の変更を述べているためwill updateが適切。updatesは現在の習慣的動作、updatingは動名詞、has updatedは既に完了した過去の行為を表し文脈に合わない。',
        translation:
          'ケータリング業者は来週月曜からベジタリアン向け・グルテンフリーの選択肢を増やす形でランチメニューを変更します。',
      },
      {
        kind: 'grammar',
        correctText: 'will remain',
        distractors: ['remain', 'remaining', 'to remain'],
        explanation:
          '来週月曜以降の今後の状態を述べているためwill remainが適切。remainは三人称単数の主語The salad barと一致せず、remaining/to remainは定形動詞にならないため文が成立しない。',
        translation: 'サラダバーは毎日利用可能で、ホットミールの選択肢は週替わりになります。',
      },
      {
        kind: 'vocab',
        correctText: 'contact',
        distractors: ['contacting', 'contacted', 'contacts'],
        explanation:
          'please+動詞の原形という命令文の形が正しいためcontactが適切。contactingは動名詞、contactedは過去形、contactsは三単現で命令文には使えない。',
        translation:
          '新しいメニューでは対応できない特別な食事制限がある場合は、直接カフェテリア担当者にご連絡ください。',
      },
      {
        kind: 'insertion',
        correctText: 'A printed copy of the new menu will be displayed at the cafeteria entrance.',
        distractors: [
          'The cafeteria will close for renovation next year.',
          'Employees are welcome to bring guests to the annual company picnic.',
          "The building's parking garage was repaved last summer.",
        ],
        explanation:
          '直前で新しいメニューの内容について説明しているため、印刷版の掲示場所を伝える一文が自然に続く。他の3文はメニュー変更と直接関係しない。',
        translation: '新しいメニューの印刷版はカフェテリアの入口に掲示されます。',
      },
    ],
  },
  {
    setId: 'p6-012',
    difficulty: 3,
    tags: ['代名詞・関係詞'],
    keyVocabWords: ['initiative', 'coordinate'],
    passageKind: 'article',
    passageText:
      'Local Employees Take Part in Community Volunteer Day\n\nLast Saturday, more than sixty employees from Greenfield Logistics took part in a community volunteer initiative [[1]] focused on cleaning up the riverside park. The event, [[2]] was organized by the human resources department, also included a lunch for all participants. Volunteers [[3]] planted trees were given small certificates to recognize their effort. [[4]] Organizers say they plan to coordinate a similar event again next spring.',
    subQuestions: [
      {
        kind: 'grammar',
        correctText: 'that',
        distractors: ['who', 'whom', 'whose'],
        explanation:
          '先行詞a community volunteer initiative（物）を修飾する関係代名詞なのでthatが適切。who/whomは人を先行詞にし、whoseは所有格でここでは使えない。',
        translation:
          '先週土曜日、Greenfield Logisticsの60名を超える従業員が河川公園の清掃に重点を置いた地域ボランティア活動に参加しました。',
      },
      {
        kind: 'grammar',
        correctText: 'which',
        distractors: ['what', 'that', 'when'],
        explanation:
          'コンマで区切られた非限定用法の関係代名詞にはwhichを使う。thatは非限定用法では使えず、whatは先行詞を取らず、whenは時を表す関係副詞でこの文脈に合わない。',
        translation: 'このイベントは人事部が主催し、参加者全員に昼食も提供されました。',
      },
      {
        kind: 'grammar',
        correctText: 'who',
        distractors: ['whom', 'which', 'whose'],
        explanation:
          '先行詞Volunteers（人）を主語として修飾する関係代名詞はwho。whomは目的格、whichは物を先行詞にし、whoseは所有格でこの文には合わない。',
        translation: '木を植えたボランティアには、その努力を評価する小さな証明書が贈られました。',
      },
      {
        kind: 'insertion',
        correctText: 'Several local businesses donated tools and refreshments for the day.',
        distractors: [
          'Greenfield Logistics was founded nearly forty years ago.',
          'The riverside park is popular with joggers on weekends.',
          "The company's annual report will be published next month.",
        ],
        explanation:
          '直前でボランティアイベントの内容を説明しているため、地元企業による道具・飲食物の提供という関連情報が自然に続く。他の3文はイベントと直接関係しない。',
        translation: 'いくつかの地元企業が、この日のために道具や軽食を提供しました。',
      },
    ],
  },
  {
    setId: 'p6-013',
    difficulty: 3,
    tags: ['接続詞vs前置詞', '品詞'],
    keyVocabWords: ['vendor', 'renewal', 'contract'],
    passageKind: 'email',
    passageText:
      'Subject: Vendor Contract Renewal — Action Needed\n\nDear Mr. Sato,\n\nOur contract with your company [[1]] expires at the end of next month. [[2]] we have been satisfied with your service, we would like to discuss renewal terms before the current agreement ends. Please let us know [[3]] you are available for a short call this week. [[4]] We would also appreciate an updated price list for the coming year.',
    subQuestions: [
      {
        kind: 'grammar',
        correctText: 'currently',
        distractors: ['current', 'currency', 'currents'],
        explanation:
          '動詞expiresを修飾するのは副詞currentlyが適切。currentは形容詞、currencyは名詞（通貨）、currentsは名詞の複数形でここでは使えない。',
        translation: '御社との契約は現在、来月末に期限を迎えます。',
      },
      {
        kind: 'connector',
        correctText: 'Since',
        distractors: ['Despite', 'Unless', 'During'],
        explanation:
          '直後に主語+動詞（we have been satisfied）が続き、理由を表す接続詞なのでSinceが適切。Despite/During は前置詞、Unlessは否定条件でここでは意味が合わない。',
        translation:
          '御社のサービスに満足しているため、契約終了前に更新条件について相談したいと考えています。',
      },
      {
        kind: 'connector',
        correctText: 'when',
        distractors: ['what', 'that', 'which'],
        explanation:
          '「いつ都合が良いか」という間接疑問を導くのはwhen。what/that/whichはこの文脈での時間を尋ねる意味を表せない。',
        translation: '今週いつ短い電話でお話しできるかお知らせください。',
      },
      {
        kind: 'insertion',
        correctText:
          'We are also open to discussing a longer-term agreement if it benefits both parties.',
        distractors: [
          'Our company recently moved to a larger office building.',
          'The current contract was signed by our previous procurement manager.',
          'We plan to attend the industry trade show again this year.',
        ],
        explanation:
          '直前で更新条件の相談と価格表の依頼をしているため、双方に利益があれば長期契約も検討したいという補足が自然に続く。他の3文は契約更新と直接関係しない。',
        translation: '双方にとって利益があれば、より長期の契約についても検討する用意があります。',
      },
    ],
  },
  {
    setId: 'p6-014',
    difficulty: 2,
    tags: ['品詞', '前置詞コロケーション'],
    keyVocabWords: ['orientation', 'training'],
    passageKind: 'email',
    passageText:
      "Subject: New Employee Orientation Reminder\n\nDear New Team Members,\n\nWelcome to the company! Your orientation [[1]] will begin this Monday at 9 a.m. in the main conference room. Please bring a valid photo ID and any completed [[2]] forms from human resources. The morning session covers company policies, and the afternoon includes hands-on training [[3]] your department's main software tools. [[4]] Lunch will be provided on the first day.",
    subQuestions: [
      {
        kind: 'vocab',
        correctText: 'session',
        distractors: ['sessional', 'sessioning', 'sessions'],
        explanation:
          '直前のYour orientationを受けて単数の名詞sessionが適切。sessionalは形容詞（あまり使われない語）、sessioningは存在しない語形、sessionsは複数形で単数の主語と一致しない。',
        translation:
          '新入社員の皆さんのオリエンテーションは今週月曜午前9時にメイン会議室で始まります。',
      },
      {
        kind: 'vocab',
        correctText: 'enrollment',
        distractors: ['enroll', 'enrolling', 'enrolled'],
        explanation:
          '直前のcompletedに修飾される名詞が必要なためenrollment（登録）が適切。enrollは動詞、enrollingは動名詞、enrolledは過去分詞（形容詞的にも使えるが名詞formsを修飾するにはenrollment formsが自然）。',
        translation:
          '有効な写真付き身分証明書と、人事部から受け取った登録書類の記入済み分をお持ちください。',
      },
      {
        kind: 'connector',
        correctText: 'on',
        distractors: ['about', 'of', 'for'],
        explanation:
          '「〜に関する研修」という意味ではtraining onが自然な前置詞コロケーション。about/of/forはこの用法では一般的でない。',
        translation: '午後の部では、各部署の主要なソフトウェアツールに関する実践研修が行われます。',
      },
      {
        kind: 'insertion',
        correctText: 'Please arrive fifteen minutes early to complete a short check-in process.',
        distractors: [
          'The company was recently recognized for its customer service.',
          'The main conference room can seat up to fifty people.',
          'Human resources plans to hire five more employees this year.',
        ],
        explanation:
          '直前でオリエンテーションの開始時間と持ち物を伝えているため、受付のために早めに来るよう促す一文が自然に続く。他の3文は当日の案内と直接関係しない。',
        translation: '簡単な受付手続きのため、15分早めにお越しください。',
      },
    ],
  },
  {
    setId: 'p6-015',
    difficulty: 4,
    tags: ['比較', '語彙推測'],
    keyVocabWords: ['performance', 'evaluation', 'appraisal'],
    passageKind: 'memo',
    passageText:
      'MEMO\nTo: All Managers\nFrom: Human Resources\n\nAnnual performance evaluations are [[1]] than they were last year, so please review the updated appraisal form before your meetings. Managers are asked to schedule the evaluation [[2]] two weeks before the deadline to allow time for follow-up discussions. Employees should receive their appraisal form [[3]] three days in advance so they can prepare. [[4]] Completed forms must be submitted to HR by the end of the month.',
    subQuestions: [
      {
        kind: 'grammar',
        correctText: 'more detailed',
        distractors: ['most detailed', 'detail', 'detailing'],
        explanation:
          '直後にthanが続く比較の文なのでmore detailedが適切。most detailedは最上級でthanと結びつかず、detail/detailingは形容詞的比較の形として使えない。',
        translation:
          '年次評価は昨年よりも詳細になっているため、面談前に更新された評価フォームを確認してください。',
      },
      {
        kind: 'connector',
        correctText: 'at least',
        distractors: ['at most', 'as long as', 'as soon as'],
        explanation:
          '「少なくとも2週間前に」という意味ではat leastが適切。at mostは「最大でも」で意味が逆になり、as long asは「〜である限り」で期間の下限を表せず、as soon asは「〜するとすぐ」で名詞句の前に置けない。',
        translation: '評価面談は締切の2週間前には設定し、フォローアップの時間を確保してください。',
      },
      {
        kind: 'connector',
        correctText: 'no later than',
        distractors: ['as soon as', 'in case of', 'now that'],
        explanation:
          '「遅くとも〜までに」という期限を表すno later thanが適切。as soon asは「〜するとすぐ」で期限を表せず、in case ofは「〜の場合に備えて」で意味が異なり、now thatは理由を表す接続詞でここでは合わない。',
        translation: '従業員が準備できるよう、評価フォームは遅くとも3日前までに渡してください。',
      },
      {
        kind: 'insertion',
        correctText:
          'HR will hold an optional training session for managers who want extra guidance.',
        distractors: [
          'The company introduced a new logo last quarter.',
          'Employees can request vacation days through the online portal.',
          'The break room was recently equipped with a new coffee machine.',
        ],
        explanation:
          '直前で評価フォームの提出期限に触れているため、追加のガイダンスを求める管理者向けの研修案内が自然に続く。他の3文は評価プロセスと直接関係しない。',
        translation: '追加の指導を希望する管理者向けに、人事部が任意の研修会を開催します。',
      },
    ],
  },
  {
    setId: 'p6-016',
    difficulty: 2,
    tags: ['動詞の形'],
    keyVocabWords: ['feedback', 'survey'],
    passageKind: 'email',
    passageText:
      'Subject: Please Share Your Feedback\n\nDear Customer,\n\nThank you for your recent purchase. We would like to [[1]] your opinion through a short survey about your shopping experience. The survey [[2]] about three minutes and can be completed on any device. Everyone who [[3]] the survey by the end of the month will be entered into a prize drawing. [[4]] Your feedback helps us improve our service.',
    subQuestions: [
      {
        kind: 'grammar',
        correctText: 'hear',
        distractors: ['hearing', 'heard', 'hears'],
        explanation:
          '助動詞would likeの後は「to+動詞の原形」が続くためhearが適切。hearingは動名詞、heardは過去形/過去分詞、hearsは三単現でto不定詞の形に合わない。',
        translation: 'お客様の購買体験についての短い調査を通じて、ご意見をお聞きしたいと思います。',
      },
      {
        kind: 'grammar',
        correctText: 'takes',
        distractors: ['take', 'taking', 'taken'],
        explanation:
          '主語The surveyは単数のため三単現のtakesが適切。takeは原形/複数形用、takingは動名詞、takenは過去分詞でここには入らない。',
        translation: 'この調査は約3分で完了し、どの端末からでも回答できます。',
      },
      {
        kind: 'vocab',
        correctText: 'completes',
        distractors: ['completing', 'completed', 'complete'],
        explanation:
          '関係代名詞whoの後は主語Everyoneに対応する三単現の動詞が必要なためcompletesが適切。completingは動名詞、completedは過去形、completeは原形でこの位置には入らない。',
        translation: '月末までに調査に回答した方全員が抽選に参加できます。',
      },
      {
        kind: 'insertion',
        correctText: 'The drawing winner will be announced by email early next month.',
        distractors: [
          'Our store recently opened a new location downtown.',
          'Shipping delays this season affected several popular items.',
          'Customers can now return items within sixty days of purchase.',
        ],
        explanation:
          '直前で抽選への参加条件を述べているため、当選者の発表方法についての一文が自然に続く。他の3文は調査・抽選と直接関係しない。',
        translation: '抽選の当選者は、来月上旬にメールでお知らせします。',
      },
    ],
  },
  {
    setId: 'p6-017',
    difficulty: 3,
    tags: ['接続詞vs前置詞', '前置詞コロケーション'],
    keyVocabWords: ['technician'],
    passageKind: 'notice',
    passageText:
      'NOTICE: Scheduled Network Outage\n\nThe company network will be unavailable this Sunday [[1]] 11 p.m. to 2 a.m. while our technicians perform system upgrades. [[2]] the outage, employees will not be able to access shared drives or company email remotely. If you experience connection issues [[3]] the outage window has ended, please contact the help desk. [[4]] We recommend saving your work before the outage begins.',
    subQuestions: [
      {
        kind: 'connector',
        correctText: 'from',
        distractors: ['since', 'for', 'at'],
        explanation:
          '「〜から〜まで」を表すfrom...to構文なのでfromが適切。since/for/atはこの範囲を表す構文の一部として使えない。',
        translation:
          '会社のネットワークは今週日曜午後11時から午前2時まで、技術者がシステム更新を行うため利用できません。',
      },
      {
        kind: 'connector',
        correctText: 'During',
        distractors: ['While', 'Although', 'Because'],
        explanation:
          '直後が名詞句the outageなので前置詞Duringが適切。While/Although/Becauseは接続詞で主語+動詞の節を必要とし、名詞句を直接続けられない。',
        translation:
          '停止時間中、従業員はリモートで共有ドライブや会社のメールにアクセスできません。',
      },
      {
        kind: 'connector',
        correctText: 'after',
        distractors: ['despite', 'unless', 'because of'],
        explanation:
          '直後に主語+動詞（the outage window has ended）が続くためafterが適切。despite/because ofは前置詞、unlessは否定条件でここでは意味が合わない。',
        translation: '停止時間が終了した後も接続に問題がある場合は、ヘルプデスクにご連絡ください。',
      },
      {
        kind: 'insertion',
        correctText: 'The upgrade is expected to improve overall connection speed once complete.',
        distractors: [
          'The IT department was established over a decade ago.',
          'Employees can request new equipment through the intranet form.',
          'The help desk recently moved to a new office location.',
        ],
        explanation:
          '直前でネットワーク停止の理由（システム更新）に触れているため、更新完了後の効果を補足する一文が自然に続く。他の3文は今回の停止と直接関係しない。',
        translation: 'この更新が完了すれば、全体的な接続速度の改善が見込まれます。',
      },
    ],
  },
  {
    setId: 'p6-018',
    difficulty: 3,
    tags: ['品詞', '動詞の形'],
    keyVocabWords: ['branch', 'headquarters'],
    passageKind: 'article',
    passageText:
      'Downtown Bank Opens New Branch\n\nRiverstone Bank announced the [[1]] of its newest branch in the downtown business district last week. The branch, which reports directly to headquarters, will offer both retail and small business banking services. Local [[2]] praised the bank for choosing a location close to public transportation. The new branch manager said the team [[3]] over one hundred customers on the first day alone. [[4]] The bank plans to hire additional staff as demand grows.',
    subQuestions: [
      {
        kind: 'vocab',
        correctText: 'opening',
        distractors: ['open', 'opened', 'opens'],
        explanation:
          '直前のtheに続く名詞が必要なためopening（開設）が適切。open/opened/opensは動詞形でこの位置の名詞としては使えない。',
        translation: 'Riverstone銀行は先週、都心の商業地区に新しい支店を開設したと発表しました。',
      },
      {
        kind: 'vocab',
        correctText: 'residents',
        distractors: ['residence', 'reside', 'residential'],
        explanation:
          '主語として動詞praisedを取る名詞（人）が必要なためresidents（住民）が適切。residenceは場所を表す名詞、resideは動詞、residentialは形容詞でここでは使えない。',
        translation: '地元住民は、公共交通機関に近い場所を選んだ銀行を評価しました。',
      },
      {
        kind: 'grammar',
        correctText: 'served',
        distractors: ['serves', 'serving', 'to serve'],
        explanation:
          '過去の出来事（first day）について述べているためservedが適切。servesは現在時制、servingは動名詞、to serveは不定詞でthe teamに続く動詞としては合わない。',
        translation: '新しい支店長は、初日だけで100人以上の顧客に対応したと述べました。',
      },
      {
        kind: 'insertion',
        correctText: 'The branch will be open seven days a week, including holidays.',
        distractors: [
          'Riverstone Bank was founded in a small town nearby.',
          "The bank's mobile app was updated earlier this year.",
          'Interest rates on savings accounts have remained stable.',
        ],
        explanation:
          '直前で新支店の状況（初日の来客数）を述べているため、営業日についての補足が自然に続く。他の3文は新支店開設のニュースと直接関係しない。',
        translation: 'この支店は祝日を含め週7日営業します。',
      },
    ],
  },
  {
    setId: 'p6-019',
    difficulty: 2,
    tags: ['動詞の形', '接続詞vs前置詞'],
    keyVocabWords: ['itinerary', 'reimbursement'],
    passageKind: 'email',
    passageText:
      "Subject: Business Trip Itinerary and Expense Policy\n\nDear Mr. Klein,\n\nAttached [[1]] your itinerary for next week's trip to the regional office. Please review the flight and hotel details carefully. All travel expenses [[2]] submitted for reimbursement within two weeks of your return. Keep every receipt, [[3]] small ones such as taxi fares. [[4]] If you have any questions about the policy, contact the travel desk before you depart.",
    subQuestions: [
      {
        kind: 'grammar',
        correctText: 'is',
        distractors: ['are', 'be', 'being'],
        explanation:
          '主語your itineraryは単数のためisが適切。areは複数主語用、beは原形、beingは進行・受動の補助でここでは主動詞として使えない。',
        translation: '添付ファイルは来週の地方オフィス出張の日程表です。',
      },
      {
        kind: 'grammar',
        correctText: 'must be',
        distractors: ['must', 'have to', 'should have'],
        explanation:
          '直後に過去分詞submittedが続くため受動態を作るmust beが適切。mustだけでは受動態が完成せず、have toは能動態の形、should haveは過去への後悔を表しここでは意味が合わない。',
        translation: '出張費用はすべて、帰任後2週間以内に精算のため申請しなければなりません。',
      },
      {
        kind: 'connector',
        correctText: 'including',
        distractors: ['include', 'included', 'includes'],
        explanation:
          '直後に名詞句small onesが続くため前置詞的に使うincludingが適切。include/included/includesは動詞形でこの位置には入らない。',
        translation: 'タクシー代のような小さなものも含めて、すべてのレシートを保管してください。',
      },
      {
        kind: 'insertion',
        correctText: 'A digital copy of each receipt can also be uploaded through the expense app.',
        distractors: [
          'The regional office was renovated two years ago.',
          'Business class upgrades are not covered under the current policy.',
          'The travel desk is closed on public holidays.',
        ],
        explanation:
          '直前でレシート保管について述べているため、経費アプリでのデジタル提出という補足情報が自然に続く。他の3文は経費精算の手続きと直接関係しない。',
        translation: '各レシートのデジタルコピーも、経費アプリからアップロードできます。',
      },
    ],
  },
  {
    setId: 'p6-020',
    difficulty: 3,
    tags: ['前置詞コロケーション', '品詞'],
    keyVocabWords: ['recall', 'inspection'],
    passageKind: 'notice',
    passageText:
      'NOTICE: Product Recall — Model X200 Charger\n\nWe have issued a voluntary recall [[1]] the Model X200 charger due to a manufacturing defect found during a routine inspection. Customers who purchased this model should stop using it [[2]] and contact our support line for a free replacement. The defect may cause the charger to overheat [[3]] certain conditions. [[4]] We sincerely apologize for any inconvenience this recall may cause.',
    subQuestions: [
      {
        kind: 'connector',
        correctText: 'of',
        distractors: ['with', 'on', 'about'],
        explanation:
          '「〜のリコール」という意味ではrecall ofが自然な前置詞コロケーション。with/on/aboutはこの用法では使えない。',
        translation:
          '定期検査で見つかった製造上の欠陥のため、Model X200充電器の自主リコールを実施しました。',
      },
      {
        kind: 'vocab',
        correctText: 'immediately',
        distractors: ['immediate', 'immediacy', 'immediateness'],
        explanation:
          '動詞stop usingを修飾するのは副詞immediatelyが適切。immediateは形容詞、immediacy/immediatenessは名詞でこの位置には入らない。',
        translation: 'この製品を購入したお客様は、直ちに使用を中止しサポート窓口へご連絡ください。',
      },
      {
        kind: 'connector',
        correctText: 'under',
        distractors: ['above', 'between', 'among'],
        explanation:
          '「〜の条件下で」という意味ではunder certain conditionsが自然な前置詞コロケーション。above/between/amongはこの意味を表さない。',
        translation: 'この欠陥により、特定の条件下で充電器が過熱する可能性があります。',
      },
      {
        kind: 'insertion',
        correctText: 'Replacement units will be shipped within five business days of your request.',
        distractors: [
          'The Model X200 was first released three years ago.',
          'Our support line also handles questions about other products.',
          'The company plans to open a new repair center next year.',
        ],
        explanation:
          '直前で無料交換の依頼手順を説明しているため、交換品の発送スケジュールを伝える一文が自然に続く。他の3文はこのリコールと直接関係しない。',
        translation: 'ご依頼から5営業日以内に交換品を発送いたします。',
      },
    ],
  },
  {
    setId: 'p6-021',
    difficulty: 2,
    tags: ['品詞', '動詞の形'],
    keyVocabWords: ['renewal'],
    passageKind: 'notice',
    passageText:
      'NOTICE: Parking Permit Renewal\n\nAll employee parking permits expire on August 31. To avoid any [[1]] in your parking access, please complete the renewal form online before that date. The renewal [[2]] takes less than five minutes and requires your employee ID number. Permits [[3]] renewed by the deadline will be deactivated on September 1. [[4]] New permit stickers will be mailed to your home address within one week.',
    subQuestions: [
      {
        kind: 'vocab',
        correctText: 'interruption',
        distractors: ['interrupt', 'interrupting', 'interrupted'],
        explanation:
          '直前のanyに続く名詞が必要なためinterruption（中断）が適切。interruptは動詞、interruptingは動名詞、interruptedは過去分詞でこの位置には入らない。',
        translation:
          '駐車利用が中断されないよう、期日前にオンラインで更新手続きを完了してください。',
      },
      {
        kind: 'vocab',
        correctText: 'process',
        distractors: ['processed', 'processing', 'processes'],
        explanation:
          '直前のThe renewalを受けて単数の名詞processが適切。processedは過去分詞、processingは動名詞、processesは複数形で単数主語と一致しない。',
        translation: 'この更新手続きは5分以内で完了し、社員IDが必要です。',
      },
      {
        kind: 'grammar',
        correctText: 'not renewed',
        distractors: ['not renewing', 'no renewed', 'not to renew'],
        explanation:
          '直前のPermitsを修飾する過去分詞句が必要なためnot renewedが適切。not renewingは動名詞句、no renewedは文法的に誤り、not to renewは不定詞句で名詞修飾には合わない。',
        translation: '期日までに更新されなかった許可証は、9月1日に無効化されます。',
      },
      {
        kind: 'insertion',
        correctText:
          'If you no longer need a permit, please cancel it to free up a space for others.',
        distractors: [
          'The parking garage was built five years ago.',
          'Visitor parking is located near the main entrance.',
          'The company is considering adding an electric vehicle charging station.',
        ],
        explanation:
          '直前で更新期日を過ぎた許可証の無効化について述べているため、不要な許可証のキャンセルを促す一文が自然に続く。他の3文は更新手続きと直接関係しない。',
        translation: '許可証が不要になった場合は、他の人のために解約してください。',
      },
    ],
  },
  {
    setId: 'p6-022',
    difficulty: 3,
    tags: ['接続詞vs前置詞', '前置詞コロケーション'],
    keyVocabWords: ['discount', 'merchandise', 'stationery'],
    passageKind: 'advertisement',
    passageText:
      'Office Supply Spring Sale\n\nVisit Parkview Office Supply this month for a storewide sale on stationery and other office merchandise. [[1]] the sale, all printer paper and notebooks are twenty percent off. Customers who spend more than fifty dollars will receive an additional discount coupon [[2]] their next visit. This offer is available [[3]] supplies last, so early shopping is recommended. [[4]] Visit our website for a full list of items included in the sale.',
    subQuestions: [
      {
        kind: 'connector',
        correctText: 'During',
        distractors: ['While', 'Since', 'Because'],
        explanation:
          '直後が名詞句the saleなので前置詞Duringが適切。While/Since/Becauseは接続詞で主語+動詞の節を必要とし、名詞句を直接続けられない。',
        translation: 'セール期間中、すべてのプリンター用紙とノートが20%引きになります。',
      },
      {
        kind: 'connector',
        correctText: 'for',
        distractors: ['at', 'to', 'of'],
        explanation:
          '「次回来店のための」という意味ではcoupon forが自然な前置詞コロケーション。at/to/ofはこの意味を表さない。',
        translation:
          '50ドル以上お買い上げのお客様には、次回来店用の追加割引クーポンを差し上げます。',
      },
      {
        kind: 'connector',
        correctText: 'while',
        distractors: ['during', 'until', 'unless'],
        explanation:
          '「在庫がある限り」という定型表現はwhile supplies lastであり、during/until/unlessはこの慣用句では使えない。',
        translation: 'この特典は在庫がある限り有効ですので、早めのお買い物をお勧めします。',
      },
      {
        kind: 'insertion',
        correctText: 'Members of our loyalty program will receive an extra five percent off.',
        distractors: [
          'The store first opened its doors over twenty years ago.',
          'Our staff can help you find items not currently on display.',
          'The store will be closed for a holiday next Monday.',
        ],
        explanation:
          '直前で割引条件について述べているため、会員向けの追加特典についての一文が自然に続く。他の3文はこのセールと直接関係しない。',
        translation: '当店の会員プログラムにご加入の方は、さらに5%引きになります。',
      },
    ],
  },
  {
    setId: 'p6-023',
    difficulty: 3,
    tags: ['動詞の形'],
    keyVocabWords: ['reconcile', 'invoice'],
    passageKind: 'memo',
    passageText:
      'MEMO\nTo: Accounting Staff\nFrom: Finance Director\n\nBefore closing the books each month, all invoices [[1]] against purchase orders to catch any discrepancies early. Last month, several invoices [[2]] not properly reconciled, which delayed our reporting by two days. Going forward, please [[3]] any mismatched invoice to your supervisor within one business day. [[4]] This extra step should help us close the books on time each month.',
    subQuestions: [
      {
        kind: 'grammar',
        correctText: 'must be reconciled',
        distractors: ['must reconcile', 'must reconciling', 'have to reconciling'],
        explanation:
          '主語all invoicesが動作を受ける側なので受動態must be reconciledが適切。must reconcileは能動態で主語と意味が合わず、must reconciling/have to reconcilingは文法的に誤り。',
        translation:
          '毎月の締め処理の前に、すべての請求書は発注書と照合して不一致を早期に見つける必要があります。',
      },
      {
        kind: 'grammar',
        correctText: 'were',
        distractors: ['was', 'are', 'have been'],
        explanation:
          '主語several invoicesは複数、かつLast monthという過去の出来事を述べているため過去形のwereが適切。wasは単数用、areは現在時制、have beenは現在完了で過去の一時点を表す文には合わない。',
        translation: '先月、いくつかの請求書が正しく照合されておらず、報告が2日遅れました。',
      },
      {
        kind: 'vocab',
        correctText: 'report',
        distractors: ['reporting', 'reported', 'reports'],
        explanation:
          'please+動詞の原形という命令文の形が正しいためreportが適切。reportingは動名詞、reportedは過去形、reportsは三単現で命令文には使えない。',
        translation: '今後は、不一致のある請求書は1営業日以内に上司に報告してください。',
      },
      {
        kind: 'insertion',
        correctText: 'A new checklist has been added to the shared drive to guide this process.',
        distractors: [
          'The finance department hired two new employees last quarter.',
          'Our fiscal year begins in April rather than January.',
          'The accounting office will move to a larger space next year.',
        ],
        explanation:
          '直前で不一致の報告手順を求めているため、その作業を支援する新しいチェックリストの案内が自然に続く。他の3文は請求書照合の手続きと直接関係しない。',
        translation: 'この作業を助けるための新しいチェックリストが共有ドライブに追加されました。',
      },
    ],
  },
  {
    setId: 'p6-024',
    difficulty: 2,
    tags: ['前置詞コロケーション'],
    keyVocabWords: ['equipment', 'facility'],
    passageKind: 'notice',
    passageText:
      'NOTICE: Gym Facility Now Open to All Staff\n\nWe are pleased to announce that the company gym facility on the second floor is now open [[1]] all employees free of charge. A short orientation session is required [[2]] first-time users to learn about the equipment and safety rules. Sessions are offered every weekday [[3]] 8 a.m. and 6 p.m. [[4]] Towels and water bottles are available for purchase at the front desk.',
    subQuestions: [
      {
        kind: 'connector',
        correctText: 'to',
        distractors: ['for', 'with', 'at'],
        explanation:
          '「〜に開放されている」という意味ではopen toが自然な前置詞コロケーション。for/with/atはこの用法では一般的でない。',
        translation: '2階の社内ジム施設は、現在すべての従業員に無料で開放されています。',
      },
      {
        kind: 'connector',
        correctText: 'for',
        distractors: ['at', 'about', 'with'],
        explanation:
          '「初回利用者には〜が必要」という意味ではrequired forが自然な前置詞コロケーション。at/about/withはこの意味を表さない。',
        translation:
          '初めて利用する方は、器具や安全ルールを学ぶための短いオリエンテーションが必要です。',
      },
      {
        kind: 'connector',
        correctText: 'between',
        distractors: ['among', 'during', 'within'],
        explanation:
          '「AとBの間」という時間帯を表すbetween A and Bが適切。among/during/withinはこの構文には合わない。',
        translation: 'このセッションは平日午前8時から午後6時の間、毎日開催されます。',
      },
      {
        kind: 'insertion',
        correctText: 'Employees are asked to bring their own workout clothing and shoes.',
        distractors: [
          'The gym equipment was purchased from a local supplier.',
          'The second floor also houses the marketing department.',
          'A yoga class will be added to the schedule next month.',
        ],
        explanation:
          '直前でオリエンテーションと利用時間について説明しているため、持ち物についての注意が自然に続く。他の3文はジム開放の案内と直接関係しない。',
        translation: '従業員は自分の運動着とシューズを持参するようお願いします。',
      },
    ],
  },
  {
    setId: 'p6-025',
    difficulty: 3,
    tags: ['動詞の形', '接続詞vs前置詞'],
    keyVocabWords: ['sustainability', 'eco-friendly'],
    passageKind: 'article',
    passageText:
      "Company Launches Sustainability Initiative\n\nGreenline Manufacturing announced a new sustainability program that [[1]] to reduce its carbon footprint by thirty percent over the next five years. The plan, which [[2]] with input from employees across all departments, includes switching to eco-friendly packaging materials. Employees who submitted ideas [[3]] the planning phase will be recognized at next month's company meeting. [[4]] The company expects the changes to also lower long-term operating costs.",
    subQuestions: [
      {
        kind: 'grammar',
        correctText: 'aims',
        distractors: ['aim', 'aiming', 'to aim'],
        explanation:
          '関係代名詞thatの先行詞a new sustainability programは三人称単数なのでaimsが適切。aimは主語と一致せず、aiming/to aimは定形動詞にならないため文が成立しない。',
        translation:
          'Greenline製造は、今後5年間で二酸化炭素排出量を30%削減することを目指す新しい持続可能性プログラムを発表しました。',
      },
      {
        kind: 'grammar',
        correctText: 'was developed',
        distractors: ['developing', 'to develop', 'has develop'],
        explanation:
          '主語The planは策定される側なので受動態was developedが適切。developing/to developは定形動詞にならず、has developは文法的に誤り（正しくはhas developed）。',
        translation:
          'この計画は全部署の従業員の意見を取り入れて策定され、環境に配慮した包装材への切り替えを含んでいます。',
      },
      {
        kind: 'connector',
        correctText: 'during',
        distractors: ['while', 'between', 'until'],
        explanation:
          '直後が名詞句the planning phaseなので前置詞duringが適切。whileは接続詞で主語+動詞の節が必要、betweenは2つの対象が必要、untilは「〜まで」で意味が合わない。',
        translation: '計画段階でアイデアを提出した従業員は、来月の全社会議で表彰されます。',
      },
      {
        kind: 'insertion',
        correctText: "A dedicated webpage will track the company's progress toward its goal.",
        distractors: [
          'Greenline Manufacturing was founded by two former engineers.',
          "The company's headquarters recently added a rooftop garden.",
          'Employees can carpool to work using a company shuttle service.',
        ],
        explanation:
          '直前で目標達成に取り組む従業員の表彰について述べているため、進捗を追跡する専用ページの案内が自然に続く。他の3文はこの取組みと直接関係しない。',
        translation: '専用のウェブページで、この目標に向けた進捗状況を追跡します。',
      },
    ],
  },
  {
    setId: 'p6-026',
    difficulty: 2,
    tags: ['品詞', '動詞の形'],
    keyVocabWords: ['appraisal', 'evaluation'],
    passageKind: 'form',
    passageText:
      'ANNUAL PERFORMANCE APPRAISAL FORM — INSTRUCTIONS\n\nPlease complete this evaluation form carefully and return it to your manager by the [[1]] date shown at the top of the page. Each section requires a written [[2]] as well as a numeric rating from one to five. If a section does not apply to your role, write "not applicable" instead of [[3]] it blank. [[4]] Employees who need extra time should contact human resources before the deadline.',
    subQuestions: [
      {
        kind: 'vocab',
        correctText: 'due',
        distractors: ['duly', 'duty', 'dues'],
        explanation:
          '直後の名詞dateを修飾する形容詞が必要なためdue（期日の）が適切。dulyは副詞、dutyは名詞（義務）、duesは名詞の複数形でこの位置には入らない。',
        translation: 'このフォームは、上部に記載された期日までに記入し、上司に提出してください。',
      },
      {
        kind: 'vocab',
        correctText: 'comment',
        distractors: ['commented', 'commenting', 'comments'],
        explanation:
          '直前のwrittenに修飾される単数の名詞が必要なためcomment（コメント）が適切。commentedは過去形、commentingは動名詞、commentsは複数形で単数を表すa writtenの後に置けない。',
        translation: '各項目には、1から5の数値評価に加えて記述式のコメントが必要です。',
      },
      {
        kind: 'vocab',
        correctText: 'leaving',
        distractors: ['leave', 'left', 'leaves'],
        explanation:
          '直前のinstead ofは前置詞で、後ろには動名詞leavingが続く。leaveは原形、leftは過去形、leavesは三単現で、いずれも前置詞の後に置けない。',
        translation:
          '該当しない項目がある場合は、空欄にする代わりに「該当なし」と記入してください。',
      },
      {
        kind: 'insertion',
        correctText: 'A sample completed form is available on the human resources intranet page.',
        distractors: [
          'The company introduced performance appraisals over a decade ago.',
          'Managers are expected to attend a leadership retreat each summer.',
          'The human resources office is located on the fourth floor.',
        ],
        explanation:
          '直前でフォームの記入方法について説明しているため、記入例の参照先案内が自然に続く。他の3文はこのフォームの記入手順と直接関係しない。',
        translation: '記入済みのサンプルフォームは人事部の社内サイトで確認できます。',
      },
    ],
  },
  {
    setId: 'p6-027',
    difficulty: 3,
    tags: ['接続詞vs前置詞', '動詞の形'],
    keyVocabWords: ['authorize'],
    passageKind: 'notice',
    passageText:
      'NOTICE: Visitor Sign-In Procedure Update\n\n[[1]] a recent security review, all visitors must now sign in at the front desk and wear a visitor badge at all times. Employees who are expecting a guest must [[2]] the visit with security at least one hour in advance. Visitors who are not authorized to enter restricted areas will be asked to remain in the lobby [[3]] their host arrives. [[4]] These steps are meant to keep the building safe for everyone.',
    subQuestions: [
      {
        kind: 'connector',
        correctText: 'Following',
        distractors: ['Although', 'Because', 'While'],
        explanation:
          '直後が名詞句a recent security reviewなので前置詞的に使うFollowingが適切。Although/Because/Whileは接続詞で主語+動詞の節を必要とし、名詞句を直接続けられない。',
        translation:
          '最近の安全性審査を受けて、すべての来訪者は受付で記名し、常に来訪者バッジを着用しなければなりません。',
      },
      {
        kind: 'vocab',
        correctText: 'register',
        distractors: ['registered', 'registering', 'registration'],
        explanation:
          '助動詞mustの後は動詞の原形が続くためregisterが適切。registeredは過去形/過去分詞、registeringは動名詞、registrationは名詞でこの位置には入らない。',
        translation:
          '来客を予定している従業員は、少なくとも1時間前に警備担当にその訪問を登録しなければなりません。',
      },
      {
        kind: 'connector',
        correctText: 'until',
        distractors: ['since', 'unless', 'because'],
        explanation:
          '「〜まで」という時間の継続を表すuntilが適切。sinceは起点、unlessは否定条件、becauseは理由を表し、いずれも意味が合わない。',
        translation:
          '制限区域への入室を許可されていない訪問者は、案内担当者が到着するまでロビーで待つよう求められます。',
      },
      {
        kind: 'insertion',
        correctText:
          'Visitor badges must be returned to the front desk before leaving the building.',
        distractors: [
          'The front desk is staffed twenty-four hours a day.',
          'The security review was conducted by an outside consulting firm.',
          'The lobby was recently redecorated with new furniture.',
        ],
        explanation:
          '直前で訪問者バッジの着用義務について述べているため、退館時の返却手順が自然に続く。他の3文はこの入退室手続きと直接関係しない。',
        translation: '来訪者バッジは、建物を出る前に受付に返却しなければなりません。',
      },
    ],
  },
  {
    setId: 'p6-028',
    difficulty: 4,
    tags: ['動詞の形'],
    keyVocabWords: ['recall', 'inspection', 'defect'],
    passageKind: 'memo',
    passageText:
      'MEMO\nTo: Store Managers\nFrom: Product Safety Team\n\nAs of this morning, all units of the Model X200 charger [[1]] from store shelves following an internal inspection that found a wiring defect. Please [[2]] any remaining stock in the storage room and label it clearly as "do not sell." A full list of affected serial numbers [[3]] to your store email within the hour. [[4]] Customers who ask about the recall should be directed to our customer service line.',
    subQuestions: [
      {
        kind: 'grammar',
        correctText: 'are being removed',
        distractors: ['have removed', 'are removing', 'had remove'],
        explanation:
          '主語all unitsが撤去される側で、現在進行中の作業を表すため現在進行形の受動態are being removedが適切（後続の「残っている在庫」の指示とも整合する）。have removed/are removingは能動態で主語と意味が合わず、had removeは文法的に誤り。',
        translation:
          '本日午前より、内部検査で配線の欠陥が見つかったため、Model X200充電器の全在庫の店頭からの撤去が進められています。',
      },
      {
        kind: 'vocab',
        correctText: 'place',
        distractors: ['placing', 'placed', 'places'],
        explanation:
          'please+動詞の原形という命令文の形が正しいためplaceが適切。placingは動名詞、placedは過去形、placesは三単現で命令文には使えない。',
        translation: '残っている在庫は保管室に置き、「販売禁止」と明確に表示してください。',
      },
      {
        kind: 'grammar',
        correctText: 'will be sent',
        distractors: ['will send', 'sending', 'was sent'],
        explanation:
          '主語A full listが動作を受ける側で、これから起こる未来の出来事なため未来受動態will be sentが適切。will sendは能動態で主語と意味が合わず、sendingは動名詞、was sentは過去形で未来の出来事を表せない。',
        translation:
          '影響を受けるシリアル番号の完全なリストは、1時間以内に貴店のメールに送付されます。',
      },
      {
        kind: 'insertion',
        correctText:
          'A company representative will visit each store within the next two days to confirm compliance.',
        distractors: [
          'The Model X200 was one of our best-selling products last year.',
          'Store managers are reminded to submit weekly sales reports on time.',
          'The customer service line will be closed for the upcoming holiday.',
        ],
        explanation:
          '直前で対応手順（在庫の隔離とリストの送付）を指示しているため、対応状況を確認する訪問についての一文が自然に続く。他の3文はこのリコール対応と直接関係しない。',
        translation: '会社の担当者が今後2日以内に各店舗を訪問し、対応状況を確認します。',
      },
    ],
  },
  {
    setId: 'p6-029',
    difficulty: 3,
    tags: ['前置詞コロケーション', '語彙推測'],
    keyVocabWords: ['warehouse', 'distributor'],
    passageKind: 'email',
    passageText:
      'Subject: Delay in Shipment to Regional Warehouse\n\nDear Partner,\n\nWe are writing to inform you [[1]] a short delay in the shipment scheduled to arrive at your regional warehouse this week. The delay is due [[2]] a shortage of shipping containers at our main port. Our distributor expects the shipment to arrive [[3]] three to five days later than originally planned. [[4]] We will send tracking information as soon as the shipment departs.',
    subQuestions: [
      {
        kind: 'connector',
        correctText: 'of',
        distractors: ['to', 'for', 'with'],
        explanation:
          '「〜について知らせる」という意味ではinform someone ofが自然な前置詞コロケーション。to/for/withはこの動詞の用法として使えない。',
        translation:
          '今週貴社の地域倉庫に到着予定の出荷に、短い遅延が生じていることをお知らせいたします。',
      },
      {
        kind: 'connector',
        correctText: 'to',
        distractors: ['of', 'from', 'with'],
        explanation:
          '「〜が原因である」という意味ではdue toが自然な前置詞コロケーション。of/from/withはこの慣用句では使えない。',
        translation: 'この遅延は、主要港でのコンテナ不足が原因です。',
      },
      {
        kind: 'connector',
        correctText: 'approximately',
        distractors: ['nearly', 'almost', 'shortly'],
        explanation:
          '「3〜5日ほど」という範囲を表す副詞はapproximatelyが適切。nearly/almostは「もう少しで〜」の意味で範囲表現には合わず、shortlyは「まもなく」の意味で日数の範囲を修飾できない。',
        translation:
          '当社の配送業者は、当初予定よりおよそ3〜5日遅れて出荷が到着すると見込んでいます。',
      },
      {
        kind: 'insertion',
        correctText: 'We apologize for any inconvenience this delay may cause your operations.',
        distractors: [
          'Our main port has handled shipments for over fifteen years.',
          'The regional warehouse recently expanded its storage capacity.',
          "We look forward to discussing next year's shipping contract.",
        ],
        explanation:
          '直前で遅延の見込み日数を伝えているため、その遅延についての謝罪の一文が自然に続く。他の3文は今回の遅延と直接関係しない。',
        translation: 'この遅延により貴社の業務にご不便をおかけすることをお詫びいたします。',
      },
    ],
  },
  {
    setId: 'p6-030',
    difficulty: 2,
    tags: ['動詞の形'],
    keyVocabWords: ['milestone', 'benchmark'],
    passageKind: 'article',
    passageText:
      "Local Firm Reaches Major Milestone\n\nParkway Consulting [[1]] its five hundredth client project last month, a milestone the company describes as a new benchmark for its ten-year history. The firm's founder said the achievement [[2]] possible by a dedicated staff and loyal clients. To mark the occasion, the company [[3]] a small celebration for employees at its main office. [[4]] The firm plans to open a second office next year to support continued growth.",
    subQuestions: [
      {
        kind: 'grammar',
        correctText: 'completed',
        distractors: ['completes', 'completing', 'has complete'],
        explanation:
          '文中のlast monthから過去の出来事を述べているためcompletedが適切。completesは現在時制、completingは動名詞、has completeは文法的に誤り。',
        translation:
          'Parkwayコンサルティングは先月、通算500件目のクライアント案件を完了し、これを10年の社史における新たな基準と位置付けています。',
      },
      {
        kind: 'grammar',
        correctText: 'was made',
        distractors: ['made', 'is making', 'has make'],
        explanation:
          '主語the achievementが動作を受ける側で、過去の出来事のため過去受動態was madeが適切。madeは能動態で主語と意味が合わず、is makingは進行形能動態、has makeは文法的に誤り。',
        translation: '創業者は、この成果は熱心な社員と忠実な顧客のおかげで実現したと述べました。',
      },
      {
        kind: 'grammar',
        correctText: 'held',
        distractors: ['holds', 'holding', 'has hold'],
        explanation:
          '文脈全体が過去の出来事を述べているためheldが適切。holdsは現在時制、holdingは動名詞、has holdは文法的に誤り（held/has heldが正しい形）。',
        translation: 'この節目を記念して、会社は本社で社員向けの小さな祝賀会を開きました。',
      },
      {
        kind: 'insertion',
        correctText:
          'The company was originally founded by two former engineers working from a small office.',
        distractors: [
          'Parkway Consulting focuses mainly on the manufacturing and logistics industries.',
          "The firm's current office is located near the downtown train station.",
          'Employees at the firm receive an annual bonus based on performance.',
        ],
        explanation:
          '記事の冒頭で10年の社史という節目に触れているため、締めくくりとして創業当時の経緯を振り返る補足が記事の流れに合う。他の3文は今回の節目のニュースと直接関係しない。',
        translation: 'この会社は元々、2人の元エンジニアが小さな事務所から始めたものです。',
      },
    ],
  },
]
