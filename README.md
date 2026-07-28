# BEB Raid（ビーブレイド）

![BEB Raid — 夜行列車の車窓に浮かぶボスの紋章](docs/design/keyvisual/key-visual.webp)

**電車で削る、英語レイド学習。**

BEB Raid（ビーブレイド）は、通勤・通学中の短時間学習を主軸にした、英語学習向けの offline-first PWA です。
弱点駆動ドリル、語彙 SRS、シャドーイング、読解、週次レイドバトル、その場に集まって解く同期バトルを組み合わせ、ひとりで続ける英語学習にゲーム的な進行感と社会性を足します。

> Working title: **Beat English Boss Raid**  
> Pronunciation: **ビーブレイド**  
> Internal concept: **電車で削り、週でボスを倒し、昼で笑う**

## Concept

主戦場は通勤電車です。

1 タップで始まる 3 分セッションを中心に、解答ログから弱点を推定し、誤答・苦手語彙・聞き取れない音を次の学習に自動接続します。
週次レイドでは、協力 PvE と上級者ゴーストを使った非対称 PvP により、スコア帯が違う学習者同士でも同じボス攻略に参加できます。

## Core Features

- **Train-first solo loop**  
  3 分から始められる、スマホ主軸の弱点駆動ドリル。

- **Vocabulary SRS**  
  誤答や key 単語を復習デッキへ自動投入する語彙学習。

- **Listening / Shadowing**  
  TTS 音声を使ったリスニング、ディクテーション、シャドーイング練習。

- **Reading (Part6 / Part7)**  
  通勤セッション内で解ける読解。Part6 と Part7 単一パッセージを配信中で、R レートに反映されます。

- **Weekly Raid Battle**  
  HP・防御パターン・攻撃イベントを持つ週次ボスを学習量と正答で削る協力型イベント。

- **Ghost Raid**  
  上級者が同意のうえ提供した解答記録をボス化し、非同期で挑戦できる非対称バトル。
  ボスの誤答部分は弱点（ダメージ 2 倍）、正答部分は堅い（0.5 倍）として効きます。
  挑戦前に見えるのは Part・タグ単位の集計のみで、個別の問題は開示されません。

- **Event Battle**  
  その場に集まって開催するリアルタイム同期バトル。ホストが 1 台で進行・投影し、参加者は自分の端末で解答します。
  得点は難易度と自分のレートから求めたハンディキャップ換算点に速度ボーナスを足したもので、
  期待点に対して最も伸びた参加者を「ベストグロース賞」として表彰します。

- **Growth Rank**  
  レートの伸びと学習日数から端末内で算出する累積ランク。サーバーへは送信しません。

- **Offline-first PWA**  
  アプリ本体と学習コンテンツは静的配信を基本とし、共有が必要な機能だけ最小 API を使う構成。

## Design Principles

### 1. Solo learning comes first

レイドやイベントは継続装置であり、本体は電車内で完結するソロ学習ループです。
短時間で始められ、オフラインでも動き、全解答ログから次にやるべき問題を絞ります。

### 2. Raid solves both isolation and level gaps

レイドダメージはハンディキャップ換算し、初級者にも上級者にも役割を持たせます。
同じ問題量・同じ正答率で殴り合うのではなく、それぞれの現在地からボス攻略に貢献する設計です。

### 3. Content is generated and reviewed

市販教材の流用ではなく、LLM 生成、人手レビュー、TTS 音声生成を前提とした独自コンテンツパイプラインを採用します。

## Architecture

- Static PWA frontend（GitHub Pages 配信）
- Local-first learning data storage（端末内 IndexedDB）
- Offline content cache
- Static content delivery（問題パック JSON＋TTS 音声）
- Minimal shared API for raid state, ghost records, event battle sync, and question stats（Cloudflare Workers + KV + Durable Objects）
- BYOK AI explanation flow where applicable

詳細は `docs/05_アーキテクチャ設計.md` を参照してください。

## Getting Started

Node.js 22 以上と npm（workspaces 対応）が必要です。

```bash
npm install

# アプリ（PWA本体）を起動する
npm run dev -w @beb-raid/app
```

レイド・イベントバトル（共有API）もローカルで試す場合は、次の2点を追加で行います。

1. `packages/app/.env.example` を参考に `packages/app/.env.local` を作成し、`VITE_RAID_API_BASE_URL`（ローカルAPIなら `http://127.0.0.1:8787`）を設定する。未設定ならレイド関連のUI・通信は一切無効になります（縮退設計）。
2. `packages/api/.dev.vars.example` を参考に `packages/api/.dev.vars` を作成し（招待コード `INVITE_CODE` を記載。gitignore 対象）、共有APIをローカル起動する。

```bash
# 共有API（Cloudflare Workers）をローカルで起動する（wrangler dev --local）
npm run dev -w @beb-raid/api
```

開発時の共通コマンド（すべてルートで実行）:

```bash
npm run build         # 全ワークスペースのビルド
npm test              # 全ワークスペースのテスト
npm run lint          # ESLint
npm run format        # Prettier（docs/ 等の Markdown は対象外）
npm run format:check  # Prettier の検査のみ（CI と同じ）
npm run review-ui     # 生成コンテンツのレビュー用ローカルUIを起動
```

git worktree で作業する場合は、worktree 直下で `npm ci` を実行してから始めてください。
省くと親ディレクトリの `node_modules` を解決してしまい、ビルド・テストが誤って壊れます。

## Packages

npm workspaces の monorepo 構成です。

| Package | 内容 |
|---------|------|
| `packages/app` | PWA本体（Vite + React + Dexie）。学習セッション・SRS・レイド・イベントバトル画面 |
| `packages/cli` | コンテンツパイプラインCLI（問題生成→レビュー取込→TTS→パックビルド） |
| `packages/shared-schema` | 問題パックスキーマ・共有API契約型の単一正本（app / cli / api が import） |
| `packages/api` | 共有API（Cloudflare Workers + KV + Durable Objects）。レイド集計・ゴースト・イベントバトル同期・匿名問題統計 |
| `packages/review-ui` | 生成コンテンツの人手レビュー用ローカルUI |

## Documentation

設計の正本は `docs/` 配下です。進捗の正本は `docs/STATUS.md` にあります。

| # | File | Content |
|---|------|---------|
| 01 | `01_要件定義.md` | 背景、ペルソナ、要件、リスク |
| 02 | `02_機能設計.md` | 電車セッション、語彙、リスニング、レイド、イベント |
| 03 | `03_学習ロジック設計.md` | SRS、key 単語、レーティング、レイドダメージ、カリキュラム |
| 04 | `04_データ設計.md` | 問題 JSON、ローカル DB、共有 API、コンテンツパイプライン |
| 05 | `05_アーキテクチャ設計.md` | PWA、オフライン設計、最小 API、AI 解説 |
| 06 | `06_ロードマップ.md` | マイルストーン、見送り事項、着手前確認事項 |
| 07 | `07_ビジュアルデザイン.md` | デザインコンセプト、カラー、タイポグラフィ、コンポーネント、画面別設計 |
| 08 | `08_M1タスク分解.md` | M1 の実装タスク分解（ブロッカー、依存関係、完了ゲート） |
| 09 | `09_開発体制.md` | 並行開発の契約（スキーマ、インターフェースの固定）、ブランチ運用 |
| 10 | `10_F4-F6実装計画.md` | M1 残タスク（F4〜F6）の自走タスクシート |
| 11 | `11_レビュー運用手順.md` | コンテンツ生成→レビュー→取込の1サイクル手順 |
| 12 | `12_M2タスク分解.md` | M1 クローズアウト＋M2 のタスク分解 |
| 13 | `13_M2実装計画.md` | M2 の自走タスクシート |
| 14 | `14_改善提案_M2ブラッシュアップとM3基盤.md` | 全量監査の問題分析と改善提案 |
| 15 | `15_改修計画_フェーズA-D.md` | 14 を実行に落とす自走タスクシート（T-67〜T-89） |
| 16 | `16_M3タスク分解.md` | M3（共有API・レイド機能）のタスク分解（T-90〜T-102） |
| 17 | `17_M3実装計画.md` | M3 の自走タスクシート（事前決定事項、作業指示、人間タスク H-1〜H-3） |
| 18 | `18_改修計画_表示更新とUX残課題.md` | 表示更新・ドリル UX の残課題タスクシート（T-103〜T-117） |
| 19 | `19_改修計画_モード完走性とセッション導線.md` | 単独モードの問数選択・語彙仕分けの永続化・途中終了導線等（T-118〜T-122） |
| 20 | `20_ビジュアル刷新計画.md` | 脱ワイヤーフレームのビジュアル刷新（V-1〜V-8・判断 JV-1〜JV-3） |
| 21 | `21_M4タスク分解.md` | M4（ゴーストレイド＋イベント）のタスク分解（T-123〜T-131・人間タスク H-4〜H-6） |
| 22 | `22_M4実装計画.md` | M4 の自走タスクシート（WebSocket プロトコル、係数調整の付録 A） |
| 23 | `23_M5ネイティブ化計画.md` | M5 の Capacitor ネイティブ化と通知手段（T-132〜T-137・T-146〜T-149・人間タスク H-7〜H-12） |
| 24 | `24_読解パート実装計画.md` | 読解（Part6/7）完成の自走タスクシート（T-138〜T-145・人間タスク H-R1/H-R2）。旧 `18_読解パート実装計画.md` を 2026-07-27 に改番（旧 ID との対応表は同書 0 節） |
| 25 | `25_ビジュアル刷新計画_M4以降の未適用画面.md` | 20 の続編。M4 で新設されたイベントバトル・ゴースト画面と 20 の適用漏れの棚卸し・ビジュアル方向性（V-9〜V-20・判断 JV-4〜JV-9） |
| — | `STATUS.md` | 現在地（進捗正本）。着手・完了時に必ず更新する |
| — | `adr/` | ADR。01〜08 に書かれていない技術判断の記録 |

## Repository Status

M1（電車ソロコアの MVP）・M2（コンテンツ拡充・体験改善）・M2 後の一連の改修（安定性／体験の質／コンテンツ是正、表示更新・モード完走性の UX 改修、ビジュアル刷新＝docs 14〜20）は完了し、dev / main にマージ済みです。

M3（共有API・レイド機能）は完了ゲートを通過済みです（2026-07-23、発起人確認）。共有API（Cloudflare Workers + KV + Durable Objects）は本番稼働中で、週次ボスの自動生成（cron）・ダメージ同期・GitHub Pages からの CORS 疎通を実環境で確認済みです。

M4（ゴーストレイド＋イベント）は、実装タスク T-123〜T-131 がすべて完了し dev にマージ済みです。ゴーストボス役・ゴースト挑戦・イベントバトルの参加／ホスト画面・成長ランク・バランス調整の運用装置が動きます。
ただし M4 の完了条件は「イベントを2回開催し、レベル差があっても接戦になること」であり、実装完了とマイルストーン完了は別です。残るのは人間タスク H-4（実開催×2回と係数調整）・H-5（ゴーストボス役の募集と同意取得）・H-6（実機通し確認）で、完了判定は H-4 の記録に基づいて行います。

読解パート（docs 24）はフェーズ R-1（Part6・Part7 単一）が完了し配信中です。R-2（Part7 複数パッセージ、T-143〜T-145）は未着手です。

M5（Capacitor ネイティブ化）は着手を保留しています。先に通知の効果を実測し、その結果でネイティブ化の着手可否とスコープを再判断する方針です（[ADR 0007](docs/adr/0007-通知手段の選択とM5ネイティブ化の前提.md) とその 2026-07-27 Amendment）。

効果検証は 2 段構えです。第 1 段（H-12）はスマートフォン標準のリマインダーを毎朝セットして 2 週間運用する人間タスクで、アプリ側の実装を伴いません。第 2 段（T-149）は第 1 段で効果が確認できた場合に限り実施する iOS PWA の Web Push 実装です。第 1 段で効果が確認できなければ、Web Push もネイティブのローカル通知も実装しない判断があり得ます。

最新の進捗は `docs/STATUS.md` を参照してください。

## License

License is not decided yet.
