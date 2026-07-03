# BEB Raid（ビーブレイド）

**電車で削る、英語レイド学習。**

BEB Raid（ビーブレイド）は、通勤・通学中の短時間学習を主軸にした、英語学習向けの offline-first PWA です。
弱点駆動ドリル、語彙 SRS、シャドーイング、週次レイドバトルを組み合わせ、ひとりで続ける英語学習にゲーム的な進行感と社会性を足します。

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
  TTS 音声を使ったリスニング、音読、シャドーイング練習。

- **Weekly Raid Battle**  
  HP・防御パターン・攻撃イベントを持つ週次ボスを学習量と正答で削る協力型イベント。

- **Ghost Raid**  
  実ユーザーの解答記録をゴースト化し、非同期で挑戦できる非対称バトル。

- **Offline-first PWA**  
  アプリ本体と学習コンテンツは静的配信を基本とし、共有が必要な機能だけ最小 API を使う構成。

## Design Principles

### 1. Solo learning comes first

レイドや昼イベントは継続装置であり、本体は電車内で完結するソロ学習ループです。
短時間で始められ、オフラインでも動き、全解答ログから次にやるべき問題を絞ります。

### 2. Raid solves both isolation and level gaps

レイドダメージはハンディキャップ換算し、初級者にも上級者にも役割を持たせます。
同じ問題量・同じ正答率で殴り合うのではなく、それぞれの現在地からボス攻略に貢献する設計です。

### 3. Content is generated and reviewed

市販教材の流用ではなく、LLM 生成、人手レビュー、TTS 音声生成を前提とした独自コンテンツパイプラインを採用します。

## Architecture

Initial architecture target:

- Static PWA frontend
- Local-first learning data storage
- Offline content cache
- Static content delivery
- Minimal shared API for raid state and ghost data
- BYOK AI explanation flow where applicable

## Documentation

| # | File | Content |
|---|------|---------|
| 01 | `01_要件定義.md` | 背景、ペルソナ、要件、リスク |
| 02 | `02_機能設計.md` | 電車セッション、語彙、リスニング、レイド、昼イベント |
| 03 | `03_学習ロジック設計.md` | SRS、key 単語、レーティング、レイドダメージ、カリキュラム |
| 04 | `04_データ設計.md` | 問題 JSON、ローカル DB、共有 API、コンテンツパイプライン |
| 05 | `05_アーキテクチャ設計.md` | PWA、オフライン設計、最小 API、AI 解説 |
| 06 | `06_ロードマップ.md` | マイルストーン、見送り事項、着手前確認事項 |
| 07 | `07_ビジュアルデザイン.md` | デザインコンセプト、カラー、タイポグラフィ、コンポーネント、画面別設計 |

## Current Scope

M1 focuses on a reduced, testable product slice:

- Mobile-first PWA shell
- Basic drill session
- Initial vocabulary review loop
- Minimal local progress tracking
- Small initial content set
- Simple raid prototype

Deferred items include the full review UI, expanded content volume, advanced social features, and native app distribution details.

## Repository Status

This repository is in the early design and prototyping phase.

## License

License is not decided yet.
