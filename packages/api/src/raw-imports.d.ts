// T-288（K-15）: workerd（vitest-pool-workers）内ではホストのファイルシステムを
// node:fsで読めないため、Viteの?raw importでビルド時（Node側）に文字列として埋め込む
// （index.test.tsがwrangler.tomlを読むために使う）。vite/client型全体は
// @cloudflare/workers-typesと衝突しうるため、このクエリ専用の宣言のみ持つ
declare module '*?raw' {
  const content: string
  export default content
}
