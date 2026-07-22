// 主要画面のスクリーンショット一括採取（ビジュアル確認用。docs/20 7節）
//   前提: 別ターミナルで `npm run dev -w @beb-raid/app` が起動済み（ポート5173）
//   使い方: node scripts/screenshot-tour.mjs [出力ディレクトリ] [--light]
//   例:     node scripts/screenshot-tour.mjs shots --light
// モバイル実寸（390x844・DPR2）で、初回診断はスキップして各画面を回る。
// ブラウザはOS同梱のEdge（channel: msedge）を使うため追加ダウンロード不要。
// CI等Edgeが無い環境では PWCHANNEL=chrome など環境変数でチャネルを変えられる。

import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const outDir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'shots'
const colorScheme = process.argv.includes('--light') ? 'light' : 'dark'
mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({
  channel: process.env.PWCHANNEL ?? 'msedge',
  headless: true,
})
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme,
})
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

async function shot(name) {
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${outDir}/${name}-${colorScheme}.png` })
  console.log('shot:', `${name}-${colorScheme}`)
}

await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await shot('01-first-launch')

// 初回起動の診断ウェルカムは自己申告スコアでスキップして進む（IndexedDBが空の場合のみ出る）
if (await page.getByText('ようこそ').count()) {
  await page.getByLabel(/表示名/).fill('ビジュアル確認')
  await page.getByLabel(/自己申告TOEIC/).fill('650')
  await page.waitForTimeout(300)
  const skipBtn = page.getByRole('button', { name: /スキップ/ })
  if (await skipBtn.count()) {
    await skipBtn.first().click()
    await page.waitForTimeout(1000)
    const proceed = page.getByRole('button', { name: /(ホーム|始める|はじめる)/ })
    if (await proceed.count()) {
      await proceed.first().click()
      await page.waitForTimeout(800)
    }
  }
}
await shot('02-home')

// ホームのグリッドから各画面へ（戻る導線が無い画面はリロードで復帰）
const visits = [
  ['語彙SRS', '03-vocab'],
  ['ダッシュボード', '04-dashboard'],
  ['シャドーイング', '05-shadowing'],
  ['設定', '06-settings'],
]
for (const [label, name] of visits) {
  const btn = page.getByRole('button', { name: new RegExp(label) })
  if (!(await btn.count())) {
    console.log('not found:', label)
    continue
  }
  await btn.first().click()
  await page.waitForTimeout(1000)
  await shot(name)
  const back = page.getByRole('button', { name: /(ホームへ|ホームに戻る|戻る)/ })
  if (await back.count()) {
    await back.first().click()
    await page.waitForTimeout(600)
  } else {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)
  }
}

// ドリル: 今日のクエストを開始し、1問目と（選択肢があれば）正誤フィードバックまで撮る
const quest = page.getByRole('button', { name: /今日のクエスト/ })
if (await quest.count()) {
  await quest.first().click()
  await page.waitForTimeout(1500)
  await shot('07-drill')
  const choice = page.locator('.choice-button')
  if (await choice.count()) {
    await choice.first().click()
    await page.waitForTimeout(800)
    await shot('08-drill-feedback')
  }
}

if (errors.length) console.log('console errors:', JSON.stringify(errors.slice(0, 10), null, 1))
else console.log('console errors: なし')
await browser.close()
