# STATUS — 現在地（進捗正本）

**最終更新: 2026-07-10**（更新ルール: [09_開発体制](09_開発体制.md) 7節。タスクの着手・完了・ブロッカー変化のたびに同じPRで更新する）

## 今どこにいるか（1行）

**M1 実装中 — F3（学習エンジン T-09〜T-14）完了。T-15〜T-19 完了（S-A1・S-A2完了、T-18も完了）。次は S-A3（T-22: ダッシュボード）。** タスク進捗: 20 / 38 完了。

## フェーズ進捗

| フェーズ | 状態 | 備考 |
|---------|------|------|
| F1 プロジェクト基盤（T-01〜T-04） | ✅ 完了 | 2026-07-07 main マージ済み（PR #2） |
| F2 データ層（T-05〜T-08） | ✅ 完了 | 2026-07-07 dev 上で完了。契約 C-1/C-2 確定 |
| F3 学習エンジン（T-09〜T-14） | ✅ 完了 | 2026-07-10 dev 上で完了。契約 C-4 確定。実装は `packages/app/src/engine/` |
| F4 学習モードUI（T-15〜T-23） | 🔶 一部完了 | T-15〜T-19 完了（S-A1・S-A2完了）。次はS-A3（T-22） |
| F5 コンテンツパイプライン（T-24〜T-34) | 🔶 一部完了 | T-24 完了。T-25 以降は B-1/B-2 待ち。**M1 全体の律速** |
| F6 統合・ドッグフード（T-35〜T-38） | ⬜ 未着手 | |

## タスク別状態（完了・進行中のみ記載。全タスク定義は [08](08_M1タスク分解.md)）

| ID | タスク | 状態 | 完了日 |
|----|--------|------|--------|
| T-01 | リポジトリ構成・開発基盤 | ✅ 完了 | 2026-07-07 |
| T-02 | PWAシェル | ✅ 完了 | 2026-07-07 |
| T-03 | デザイントークン・基本コンポーネント | ✅ 完了 | 2026-07-07 |
| T-04 | ネイティブ化前提の抽象化レイヤ骨格 | ✅ 完了 | 2026-07-07 |
| T-05 | 問題パックスキーマ・バリデータ | ✅ 完了 | 2026-07-07 |
| T-06 | IndexedDB（Dexie）スキーマ | ✅ 完了 | 2026-07-07 |
| T-07 | 解答記録サービス・セッション中断復帰 | ✅ 完了 | 2026-07-07 |
| T-08 | エクスポート/インポート | ✅ 完了 | 2026-07-07 |
| T-09 | SRSエンジン | ✅ 完了 | 2026-07-09 |
| T-10 | レーティングエンジン | ✅ 完了 | 2026-07-09 |
| T-11 | key単語システム | ✅ 完了 | 2026-07-10（類題優先出題の通し検証は T-13 のテストで実施） |
| T-12 | タグ統計・弱点判定 | ✅ 完了 | 2026-07-09 |
| T-13 | クイックパック生成 | ✅ 完了 | 2026-07-10（配分は `engine/quickPackConfig.json` に外出し=J-2） |
| T-14 | ストリーク | ✅ 完了 | 2026-07-10 |
| T-24 | コンテンツパイプラインCLI基盤 | ✅ 完了 | 2026-07-07 |
| T-15 | 音声再生基盤 | ✅ 完了（PC Chrome確認済み。iOS実機は未検証） | 2026-07-10 |
| T-16 | S2 ドリル実行画面（共通） | ✅ 完了 | 2026-07-10 |
| T-17 | Part2瞬発モード | ✅ 完了 | 2026-07-10 |
| T-19 | S3 語彙SRS画面 | ✅ 完了 | 2026-07-10 |
| T-18 | Part5ドリル | ✅ 完了 | 2026-07-10 |

※ T-02 の iOS/Android 実機での standalone 表示・小サイズロゴ視認性、T-03 のライトテーマ実地検証は計画どおり後続（T-36 実機検証で確認）。未検証項目であることに注意。
※ T-15: `npm run dev` を起動し、実際のmp3（ffmpegで生成した1秒のトーン2本）を使い Playwright 経由の実 Chromium で unlock→play→部分再生（durationMs）→playSequence連結→replay→stop打ち切り、を一通り操作して確認済み（page error 0件）。iOS Safari実機での自動再生制限解除の確認は T-36 まで未検証。
※ T-16: `zustand` 導入（`store/appStore.ts` 画面遷移・`store/sessionStore.ts` セッション進行キャッシュ）。`services/session.ts` を per-item mode 対応（`SessionSnapshot.items: SessionItem[]`。旧形式スナップショットは破棄）に拡張。`DrillScreen`/`ResultScreen`/`ExplanationCard` を新規実装し、コンポーネントテスト14件で出題→解答→誤答時のsrsCards/tagStats/ratings更新→SRS由来itemのreviewSrsCard呼出→次問→リザルト→ホーム復帰を検証。`quickPackConfig` の allocation合計検証（レビューフォローアップ）も実装。実装後 `npm run dev` を起動し Playwright 経由の実Chromiumでドリル→リザルト→ホームの一連を手動確認し、レート未初期化セクションの表示が `0` になる表示バグ（`DEFAULT_INITIAL_RATING` 不使用）を発見・修正した。audio_qa（Part2）固有のタイマー・音声再生対応は T-17 に委譲。
※ T-17: `DrillScreen` に audio_qa 対応を追加（開始タップ=unlock兼用→play→15秒タイマー→自動タイムアウト誤答、もう一度再生=replay、セッション内連続正解ストリーク表示）。冒頭だけ再生モード（J-5）は `sessionStore.partialAudioMode` フラグで制御し、`PlayOptions.durationMs`（2500ms。docs未記載のチューニング値）付きで `play()` を呼ぶ。コンポーネントテスト6件追加（タイムアウト自動確定・タイマー中の即時解答・ストリーク増減・durationMs付きplay呼び出し等）。`vi.useFakeTimers({ toFake: ['setInterval','clearInterval'] })` で15秒タイマーのみ高速化し、fake-indexeddbのDexie操作は実タイマーのまま動かす手法を確立。ffmpegで生成したPart2ダミー音声2本を `public/packs/dev/audio/` にコミット（生成スクリプト `scripts/generate-dummy-audio.mjs`）。実装後 `npm run dev` を起動しPlaywright実Chromiumで通常モード（2問完走→リザルト）・冒頭再生モード（play呼び出し確認）を手動確認、page error 0件。
※ T-19: 新規 `VocabScreen`＋`SwipeCard`（Pointer Events。左右のみ判定、縦優勢は無視）を実装。復習モード（`getSrsQueue`のdueReviews+newCardsを結合。自己評価3段階→`reviewSrsCard`＋`recordAttempt`(mode='srs')＋`evaluateStreak`）と仕分けモード（vocabQuestionsのうちsrsCards未登録の語を候補にし、「知らない」で`addSrsCard`、「知ってる」はスキップのみ）の2フェーズ構成。`buildSrsQueue`という旧称がdocs/10にあるが実体は`engine/srs.ts`の`getSrsQueue`（実装済み関数名の食い違いを解消して実装）。自己評価→attemptsのisCorrect写像は「もう一回=false、OK/余裕=true」で実装（docs未記載の解釈）。フレーズ音声自動再生は`settings`ストアの`vocabAutoPlayPhrase`キーで永続化。コンポーネントテスト7件。実装後`npm run dev`を起動しPlaywright実Chromiumで実際のポインタドラッグ（mouse.down/move/up）による左右スワイプ＋ボタン仕分けの両方を手動確認、page error 0件。
※ T-18: `DrillScreen`はT-16の時点で既にformat非依存（text_blankは音声なし・タイマーなしの共通フローにそのまま乗る）だったため新規実装は不要。T-18固有の完了条件（文法タグが問題ごとに異なってもtagStatsへ正しく反映される）を明示的に検証するテストを1件追加して完了条件を機械的に満たした。

## 契約の状態（[09](09_開発体制.md) 2節）

| # | 契約 | 状態 |
|---|------|------|
| C-1 | 問題パックスキーマ（T-05） | ✅ 確定済み（`packages/shared-schema`） |
| C-2 | IndexedDB スキーマ（T-06） | ✅ 確定済み（`packages/app/src/db/schema.ts` が正本） |
| C-3 | platform 抽象化レイヤ（T-04） | ✅ 確定済み |
| C-4 | 学習エンジンのインターフェース | ✅ 確定済み（`packages/app/src/engine/types.ts`。C-2 への非インデックスフィールド追加＝srsCards 3件・ratings 1件を含む。マイグレーション不要） |

## 着手前ブロッカー（[08](08_M1タスク分解.md) 2節）

| ID | 内容 | 状態 |
|----|------|------|
| B-1 | 手持ちJSON/PDF素材の出所確認 | 🔶 未解決（未確認の間は「LLM生成に全振り」がデフォルトのため生成作業自体は開始可） |
| B-2 | TTSの調達（Azure Speech の個人利用可否とコスト実測） | 🔶 未解決だが影響縮小（第一候補 Azure F0=月50万文字無料の見込み。話者ローテーションを米/英/豪の3アクセントに縮退済みのため Google TTS 等も代替可能=04の5節。**発起人の判断でアカウント作成は後回しとし、T-31 の実生成着手前までに解消する**。TtsProvider の実装・テストはモックで先行可） |
| B-3 | リポジトリを public にできるかの最終確認 | ✅ 実質解消（リポジトリは現に public。「全世界公開に耐えるコンテンツのみ置く」原則は継続） |

## レビューフォローアップ（2026-07-10 F2/F3 コードレビューの残項目）

major 指摘のうち3件（ストリーク時計巻き戻しの二重加算・attempts 更新遮断とインポート追記化・セッション二重解答防止）は修正済み。以下は将来対応が必要な残項目（対応期限=着手すべきタスク）:

| 項目 | 内容 | 期限 |
|------|------|------|
| BYOKキーのエクスポート除外 | `backup.ts` の exportAll は settings 全件を書き出すため、BYOK実装後はAPIキーがバックアップJSONに平文で出る。エクスポート除外キーのリストを定義すること | **T-23（BYOK実装）着手前・必須** |
| docs/04 3節への実装差分反映 | attempts.isGuess / srsCards の introducedDate・graduatedAt・sourceQuestionId / ratings.answerCount / settings.activeSession が docs 未記載 | docs 更新時 |
| quickPackConfig の検証 | allocation 合計≒1 の検証がなく、不正な設定JSONでパックが黙って目減りする | ✅ T-16 で解消（`validateQuickPackConfig`） |
| ストリーク途切れの表示 | 途切れ確定後も evaluateStreak が旧 currentDays を返す（遅延評価）。UI側で途切れ表示の扱いを決める | T-21（ホーム画面） |
| tagStats の全件読み | 毎解答で attempts 全件を toArray() するため長期運用で遅延が単調増加。打ち切り読みへの変更余地 | 実測して問題が出たら |
| rating K=32 の解釈記録 | 「最初の50問 K=32」をセクション別カウントで実装した解釈が docs/03 に未記載 | docs 更新時 |
| backup の dbVersion 検査 | インポート時に dbVersion を見ず、新スキーマのバックアップで未知ストアが黙って落ちる | DB v2 導入時・必須 |
| CLI の maskApiKey / stderr | 4文字以下のキーで全露出（実運用キー長では起きない）。エラー出力が stdout | T-26 以降 |
| validate.ts の M2 format 検証 | audio_photo の image 必須・dictation の blanks 整合・levelBand の enum チェックが未実装 | M2 format 実装前 |

## 次にやること（優先順）

**残タスク（T-15〜T-23, T-25〜T-38）の実装は [10_F4-F6実装計画](10_F4-F6実装計画.md) のタスクシートに従う**（1タスク=1セッションの自走用作業指示。実装方式の事前決定は同書3節と ADR 0003）。

1. **F4: 学習モードUI** — S-A1（T-15→T-16→T-17）・S-A2（T-19）・T-18 完了。次は S-A3（T-22: ダッシュボード）
2. **F5 前半（並行可）** — T-30 → T-25 → T-26/27/28 のコマンド実装。生成実行と目視レビューは人間の稼働待ち（M1の律速）
3. **B-2 の解消（TTS アカウント作成）** — 発起人の判断で後回し中。T-31 の実生成着手前までに実施（第一候補 Azure F0。手順は 10 の T-31 シート参照）

### F4 への引き継ぎ（T-16/T-17/T-19 実装からの注意点）

- `SessionSnapshot` は T-16 で per-item mode 対応済み（`items: SessionItem[]`。`SessionItem = { questionId, mode, srsCardId?, reason? }`）。SRS復習の解答も **attempts に mode='srs' で記録される**（item.mode がそのまま attempt.mode になる）
- 解答確定時の結線（`DrillScreen` に実装済み。T-18 も踏襲する）: `answerCurrentQuestion` → 誤答なら `processWrongAnswer` → `updateTagStatsForAnswer` → `applyRatingUpdate` → SRS由来item（`srsCardId`あり）なら `reviewSrsCard`（S2は客観正誤のみのUIのため、正解→good/誤答→again に固定。自己評価3段階の本来の入口はT-19のS3語彙カードUI）
- `DrillScreen` は text_blank（音声なし）と audio_qa（Part2。unlock→play→15秒タイマー→タイムアウト自動誤答、ストリーク表示、`sessionStore.partialAudioMode`による冒頭再生）の両方に対応済み。T-18（Part5=text_blank）は既存フローに乗るだけで固有ロジック追加不要の見込み
- audio_qa は `DrillScreen` の `audioPlayer: AudioPlayer` prop 経由で再生する（`App.tsx` がモジュールスコープで `createAudioPlayer()` を1回だけ生成して渡す。テストでは `AudioPlayer` を実装したフェイクを注入する）
- 語彙SRSカードに対応する vocab_card 問題が無い場合 `QuickPackItem.questionId` は null（カードの refId=単語 のみで表示する）。`kind: 'srsVocab'` は S2ドリルでなくS3語彙カードUI（`VocabScreen`。T-19実装済み）で扱う対象（DrillScreenは非対応）
- レート未初期化セクション（'L'/'R' 未着手）の表示は `DEFAULT_INITIAL_RATING`（400）にフォールバックすること（`0` にすると「400→0」のような誤解を招く表示になる。T-16のPlaywright手動確認で発見・修正済み）
- fake timers と fake-indexeddb（Dexie）を同一テストで併用する場合は `vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })` のように対象を絞ること（全種類フェイク化するとDexieの内部非同期処理がデッドロックする。T-17で確立した手法）
- `VocabScreen`（T-19）は `SessionSnapshot`/`sessionStore` を使わず独立動作（DrillScreenの quickPack セッションフローとは無関係）。復習キューは `getSrsQueue().dueReviews + newCards` を結合したもの、仕分け候補は「`vocabQuestions` のうち `srsCards` に未登録の語」。T-21（ホーム）からVocabScreenへ遷移する導線・実パックの語彙カード読み込みはT-21/T-35側で配線する

## 体制・環境メモ

- 開発体制・ブランチ運用: [09_開発体制](09_開発体制.md)
- collaborator: war-lab（owner）, ShimadaTk（write）。もう1名（iCloud メールの方）は GitHub ユーザー名待ちで未招待
- main ブランチ保護: PR 必須・Approve 1件必須（admin はバイパス可の設定）
- 技術判断はコミットメッセージに記録する慣行（ADR ファイルは必要時のみ作成）
- **運用変更（2026-07-10〜）**: T-15 以降、dev 上のタスクは task/ブランチ＋PRを都度作らず、dev へ直接コミットして自走で進める（発起人の指示）。完了条件の検証（build/test/lint＋必要に応じ実ブラウザでの手動確認）は従来どおり各タスクごとに実施する。main への反映は引き続きフェーズ境界でのPRとする
