# review-ui

コンテンツ生成ドラフト（`content/drafts/*.jsonl`）の人手レビュー用UI（M2・T-57）。

**開発者ローカル専用。ビルド・GitHub Pagesデプロイの対象外。** ルートの `deploy.yml` はこのワークスペースをビルドしない。CIの `npm test` にはこのワークスペースのテストも含まれる。

## 起動

リポジトリルートで:

```
npm run review-ui
```

Vite dev サーバーが起動し、ブラウザで開くと `content/drafts/` 配下のドラフトJSONLを選んでレビューできる。

## できること

- ドラフト一覧の選択
- 1件ずつフィールド単位で編集（kind別フォーム。JSON手入力は未対応kindのみのフォールバック）
- shared-schema バリデーションのインライン表示
- TTS済み音声のプレビュー再生
- 採用/破棄（破棄は理由必須）
- `content/drafts/reviewed/<元ファイル名>.accepted.jsonl` / `.rejected.jsonl` への書出（既存の `beb review-import` 出力と同形式。以降の `beb tts` / `beb build` にそのまま渡せる）

詳細な運用手順は [docs/11_レビュー運用手順.md](../../docs/11_レビュー運用手順.md) を参照。

## 設計メモ

- File System Access API は使わない（ブラウザ互換を追わない方針）。ファイル読み書きは Vite dev サーバーのミドルウェア（`src/server/draftsServerPlugin.ts`）が Node の `fs` で行う。
- `@beb-raid/cli` の `review.ts`（`GeneratedItemDraft` / `RejectedItem` / `parseJsonl` / `toJsonl`）をそのまま import する（`./review` サブパスエクスポート経由）。逆方向（cli → review-ui）の依存は作らない。
