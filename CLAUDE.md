# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## リポジトリの現状

BEB Raid（ビーブレイド）— 通勤電車での短時間学習を主軸にした TOEIC 学習用 offline-first PWA。
**M1 実装中**（`docs/08_M1タスク分解.md` の F1: T-01〜T-04 まで完了）。技術スタックは `docs/05_アーキテクチャ設計.md` のとおり（React + TypeScript + Vite、vite-plugin-pwa、Dexie.js、Zustand 程度の軽量状態管理、コンテンツ CLI は TypeScript/Node）。

### 構成とコマンド

npm workspaces の monorepo。ルートで実行する:

- `npm run build` / `npm test` / `npm run lint` / `npm run format`（Prettier。`docs/` 等の Markdown は整形対象外）
- `packages/app` — PWA本体（Vite + React）。`packages/cli` — コンテンツパイプラインCLI。`packages/shared-schema` — 問題パックスキーマ型の共有（app/cli 双方から import）
- `packages/app/src/platform/` — 音声再生（AudioPlayer）・パックキャッシュ（PackCache）の抽象化レイヤ。**UI・エンジンから Audio / AudioContext / caches を直接呼ぶと ESLint エラーになる**（必ず platform のインターフェース経由で使う）
- デザイントークンは `packages/app/src/styles/tokens.css`（07の3節が正本）。色は必ずトークン経由で参照する

## ドキュメント構成

設計の正本は `docs/` 配下。`草案.md` は元ネタのメモで、`docs/` が優先する。

| ファイル | 内容 |
|---------|------|
| `docs/01_要件定義.md` | 背景・ペルソナ・要件・リスク（著作権含む） |
| `docs/02_機能設計.md` | 電車セッション・語彙・リスニング・レイド・昼イベント |
| `docs/03_学習ロジック設計.md` | SRS・key単語・レーティング・レイドダメージ計算・カリキュラム |
| `docs/04_データ設計.md` | 問題JSONスキーマ・IndexedDBスキーマ・共有APIデータ・コンテンツパイプライン |
| `docs/05_アーキテクチャ設計.md` | 静的PWA＋極小共有API構成・オフライン設計・BYOK AI解説・ネイティブ化路線 |
| `docs/06_ロードマップ.md` | マイルストーン（M1〜M5）・見送り事項・着手前確認事項 |
| `docs/07_ビジュアルデザイン.md` | デザインコンセプト・カラー・タイポグラフィ・画面別設計 |
| `docs/08_M1タスク分解.md` | M1の実装タスク分解（ブロッカー・依存関係・完了ゲート）。01〜07が正本で本書は従属 |

## アーキテクチャの要点（設計判断の前提）

3層構成で、**依存の方向が固定されている**。共有APIが全損してもソロ学習は無傷、が設計の根幹（縮退設計）。

1. **コンテンツ層** — GitHub Pages 静的配信。問題パックJSON＋TTS音声mp3＋manifest＋ボスプロファイル。ビルド時に生成し、ランタイムの LLM/TTS 課金はゼロ。**public リポジトリ前提**なので全世界公開に耐えるものだけを置く。
2. **個人データ層** — 端末内 IndexedDB（local-first）。全解答ログ `attempts` が分析の基盤で消さない。エクスポート/インポートが iOS ストレージ退避への保険。
3. **共有層** — Cloudflare Workers + KV + Durable Objects（無料枠）。レイド集計・ゴースト・昼バトル同期・匿名問題統計のみ。「集計板」であって学習データの正本ではない。

### 破ってはいけない不変条件

- **プライバシー境界**: 個人紐づきで共有APIに送るのは「ダメージ換算値＋表示名」のみ。個人単位の正誤詳細・レート実値・本名・社名は端末外に出さない。問題別正誤集計（questionStats）は deviceToken と結合できない匿名統計としてのみ扱う。
- **コンテンツの出所**: 問題パックは `license` / `origin` 必須。市販教材（金のフレーズ等）の流用は著作権リスクがあるため取込拒否。LLM生成＋人手レビュー＋TTS のパイプラインで自作する。
- **オフラインが正常系**: 解答・SRS更新は IndexedDB へ即時保存。レイドダメージは pendingSync キュー経由で冪等送信（同一 attempt ID の二重送信はサーバー側で無視）。
- **ネイティブ化路線の確保**: 将来 Capacitor でラップする前提のため、キャッシュ層・通知・音声再生は差し替え可能な抽象化レイヤにしておく（05の7節）。
- **BYOK**: AI解説はユーザー自身の Claude API キーをブラウザから直接呼ぶ。キーは IndexedDB 保存で端末外に出さない。

## 開発の進め方

- ロードマップは M1（電車ソロコアのMVP、GitHub Pages のみで完結）から順に進める。レイド・共有API（M3以降）を先行させない。`docs/06_ロードマップ.md` の「意図的に見送るもの」に載っている項目を勝手に実装しない。
- 設計変更を伴う場合は該当する `docs/` のファイルを更新し、矛盾を作らない（00_README の冒頭にレビュー反映履歴を追記する慣行がある）。
- コミットメッセージは既存の慣行に従い `Doc:` などのプレフィックス付き日本語。
