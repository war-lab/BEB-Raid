import { SCHEMA_VERSION } from '@beb-raid/shared-schema'

export function App() {
  return (
    <main>
      <h1>BEB Raid</h1>
      <p>開発基盤のみ（画面実装は F4）。パックスキーマ v{SCHEMA_VERSION}</p>
    </main>
  )
}
