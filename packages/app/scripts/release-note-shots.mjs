// リリースノート（BEB-Raid-リリースノート.html）の埋め込みスクリーンショット13枚の採取（H-13）。
//   前提: 別ターミナルで `npm run dev -w @beb-raid/app` が起動済み
//   使い方: node scripts/release-note-shots.mjs [出力ディレクトリ] [--port=5173]
//
// 初版（PR #73・2026-07-27）はローカル実機＋wrangler dev --local を2ブラウザで操作する
// 手作業だったため再現できなかった。ビジュアル刷新（V-9〜V-23）後の撮り直し（H-13）に際して
// screenshot-tour.mjs と同じモック（?screenshotMock=1）で自動化し、次回以降も同じ手順で
// 撮り直せるようにした。モックは apply:'serve' のプラグイン経由で本番ビルドに入らない。
//
// 【元の13枚との対応と、刷新で変わった点】
// 1〜5 はイベントバトル主催（S8）。**V-11／V-22で投影用レイアウトになったため 1920x1080 の
//   横長になった**（初版は当時モバイル用の ScreenLayout だったので縦長750px幅だった）。
//   リリースノート側は横長画像を広く見せる必要があるため .shot--wide を足して全幅表示する。
// 6〜9 はイベントバトル参加（S7）。モバイル実寸のまま。
// 10 はボス役立候補の同意画面、11 はゴースト週のレイド画面、12 は弱点を突いたときの解説カード、
//   13 はホーム画面。いずれもモバイル実寸のまま。
//
// 【WebPへの変換】
// 追加依存を入れずに済ませるため、PNGで撮ってからブラウザの canvas で WebP へ変換する
// （ChromiumはWebPエンコードに対応する）。表示幅は縦長750px・横長1600pxで、リリースノートの
// 表示サイズ（縦長340px・横長は全幅900pxまで）に対して2倍程度の密度を確保する。
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const args = process.argv.slice(2)
const outDir = args[0] && !args[0].startsWith('--') ? args[0] : 'release-shots'
const portArg = args.find((a) => a.startsWith('--port='))
const port = portArg ? portArg.slice('--port='.length) : (process.env.SCREENSHOT_PORT ?? '5173')
const origin = `http://localhost:${port}`
const MOCK = '?screenshotMock=1'

/** WebPの品質。0.72で初版（約694KB）と同程度の総量に収まることを確認した */
const WEBP_QUALITY = 0.72
/** 出力の表示幅（px）。縦長=モバイル画面、横長=投影画面 */
const WIDTH_PORTRAIT = 750
const WIDTH_LANDSCAPE = 1600

mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({
  channel: process.env.PWCHANNEL ?? 'msedge',
  headless: true,
})
const errors = []
/** 採取結果。{ key, dataUri, width, height, wide } の順序付き配列 */
const shots = []

function watch(target) {
  target.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  target.on('pageerror', (e) => errors.push(String(e)))
  target.on('dialog', (d) => void d.accept())
}

/** 変換用の作業ページ（about:blankでcanvasだけ使う） */
const convCtx = await browser.newContext()
const convPage = await convCtx.newPage()
await convPage.goto('about:blank')

/**
 * PNGバッファをWebPのdata URIへ変換する。targetWidth へ等比縮小する
 * （元がtargetWidthより小さい場合は拡大しない）
 */
async function toWebp(pngBuffer, targetWidth) {
  const base64 = pngBuffer.toString('base64')
  // 式は文字列で渡す（このファイルはNode側で window / document / Image を持たないため。
  // screenshot-tour.mjs の drive() と同じ方式）
  return await convPage.evaluate(`(async () => {
    const img = new Image()
    img.src = 'data:image/png;base64,${base64}'
    await img.decode()
    const scale = Math.min(1, ${targetWidth} / img.naturalWidth)
    const cw = Math.round(img.naturalWidth * scale)
    const ch = Math.round(img.naturalHeight * scale)
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    canvas.getContext('2d').drawImage(img, 0, 0, cw, ch)
    return { uri: canvas.toDataURL('image/webp', ${WEBP_QUALITY}), width: cw, height: ch }
  })()`)
}

/** 1枚撮ってWebPに変換し、確認用のPNGも残す */
async function capture(target, key, { wide = false, fullPage = true } = {}) {
  await target.waitForTimeout(400)
  const png = await target.screenshot({ fullPage })
  writeFileSync(`${outDir}/${key}.png`, png)
  const { uri, width, height } = await toWebp(png, wide ? WIDTH_LANDSCAPE : WIDTH_PORTRAIT)
  shots.push({ key, dataUri: uri, width, height, wide })
  console.log(
    `shot: ${key} ${width}x${height} ${Math.round(uri.length / 1024)}KB${wide ? ' (wide)' : ''}`,
  )
}

async function skipOnboarding(page, displayName) {
  if (!(await page.getByText('ようこそ').count())) return
  await page.getByLabel(/表示名/).fill(displayName)
  await page.getByLabel(/自己申告TOEIC/).fill('650')
  await page.waitForTimeout(300)
  const skip = page.getByRole('button', { name: /スキップ/ })
  if (!(await skip.count())) return
  await skip.first().click()
  await page.waitForTimeout(1000)
  const proceed = page.getByRole('button', { name: /(ホーム|始める|はじめる)/ })
  if (await proceed.count()) {
    await proceed.first().click()
    await page.waitForTimeout(800)
  }
}

// ---------------------------------------------------------------------------
// モバイル（375x812・DPR2）。初版と同じ実寸で撮る
// ---------------------------------------------------------------------------
const mobileCtx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme: 'dark',
})
const page = await mobileCtx.newPage()
watch(page)

await page.goto(`${origin}/${MOCK}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await skipOnboarding(page, 'たなか')
await page.evaluate('window.__bebScreenshotMock.seedRaid()')
await page.goto(`${origin}/${MOCK}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

// 13. ホーム画面（全体）
await capture(page, '13-home')

// 11. ゴースト週のレイド画面
const toRaid = async () => {
  await page.goto(`${origin}/${MOCK}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const entry = page.getByRole('button', { name: /^レイド/ })
  if (!(await entry.count())) return false
  await entry.first().click()
  await page.waitForTimeout(1200)
  return true
}
if (await toRaid()) {
  await capture(page, '11-raid-ghost')

  // 10. ボス役立候補の同意画面
  const candidate = page.getByRole('button', { name: /ボス役に立候補/ })
  if (await candidate.count()) {
    await candidate.first().click()
    await page.waitForTimeout(900)
    await capture(page, '10-boss-consent')
  } else {
    console.log('not reached: 10-boss-consent')
  }

  // 12. 弱点を突いたときの解説カード。
  // 弱点バッジは「レイドに参加登録済み」かつ「正答」で出る（answerPipelineは
  // baseDamage<=0でnullを返すので誤答では出ない）。モードには依存しないため、
  // **Part5単独モード**で撮る。「レイドに挑む」のセッションはカリキュラム配分で
  // Part2の音声問題が続き、ヘッドレスでは音声の再生完了が来ず選択肢が出ないため到達できない。
  // 既定のモックは弱点をパック先頭9問ずつにしか付けないので、撮影のあいだだけ網羅モードにする
  // （#11の弱点マップは既に撮り終えている）。
  await page.evaluate('window.__bebScreenshotMock.setWideDefense(true)')
  // 参加登録していないとダメージが積まれず（answerPipelineがjoined=falseでnullを返す）
  // 弱点バッジも出ない。レイド画面に戻って「参加する」を押しておく
  if (await toRaid()) {
    const join = page.getByRole('button', { name: /^参加する$/ })
    if (await join.count()) {
      await join.first().click()
      await page.waitForTimeout(1200)
    }
  }
  await page.goto(`${origin}/${MOCK}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const part5 = page.getByRole('button', { name: /^Part5/ })
  if (await part5.count()) {
    await part5.first().click()
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: '10問' }).first().click()
    await page
      .getByRole('button', { name: /^開始$/ })
      .first()
      .click()
    await page.waitForTimeout(1600)
    let done = false
    for (let i = 0; i < 20 && !done; i += 1) {
      const choices = page.locator('.choice-button')
      if (await choices.count()) {
        await choices.first().click()
        await page.waitForTimeout(600)
        if (await page.locator('[data-testid="ghost-defense-badge"]').count()) {
          await capture(page, '12-weakness-explanation')
          done = true
          break
        }
      }
      const next = page.getByRole('button', { name: /^(次へ|次の設問へ)$/ })
      if (await next.count()) {
        await next.first().click()
        await page.waitForTimeout(600)
      } else {
        await page.waitForTimeout(500)
      }
    }
    if (!done) {
      console.log('not reached: 12-weakness-explanation（弱点つきの問題に正答できなかった）')
    }
  }
}

await page.evaluate('window.__bebScreenshotMock.setWideDefense(false)')

// 6〜9. イベントバトル参加（S7）
await page.goto(`${origin}/${MOCK}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
const joinEntry = page.getByRole('button', { name: /イベントバトルに参加/ })
if (await joinEntry.count()) {
  await joinEntry.first().click()
  await page.waitForTimeout(800)
  await page.locator('#battle-room-code').fill('RA1D')
  await capture(page, '06-join-roomcode')
  await page.getByRole('button', { name: /^参加する$/ }).click()
  await page.waitForTimeout(900)
  await page.evaluate('window.__bebScreenshotMock.battleQuestionOpen()')
  await page.waitForTimeout(900)
  await capture(page, '07-join-question')
  const choices = page.locator('.choice-button')
  if (await choices.count()) {
    await choices.first().click()
    await page.waitForTimeout(700)
    await capture(page, '08-join-answered')
  }
  await page.evaluate('window.__bebScreenshotMock.battleResult()')
  await page.waitForTimeout(1700)
  await capture(page, '09-join-result')
} else {
  console.log('not reached: 06-09（イベントバトル参加の導線が見つからない）')
}

// ---------------------------------------------------------------------------
// S8ホスト（投影）。V-11／V-22で 1920x1080 の投影レイアウトになったため横長で撮る
// ---------------------------------------------------------------------------
const hostCtx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  colorScheme: 'dark',
})
const hostPage = await hostCtx.newPage()
watch(hostPage)
await hostPage.goto(`${origin}/${MOCK}`, { waitUntil: 'networkidle' })
await hostPage.waitForTimeout(1500)
await skipOnboarding(hostPage, 'さとう')
// 1. 抽選プレビューだけはノートPCのウィンドウ相当（1440x900）で撮る。
// JV-10=案Bでこの画面は投影用意匠の対象外＝「ホストが手元で12問を読み比べる画面」と定めており、
// プロジェクタ実寸（1920x1080）で撮ると規定していない用途の見た目を代表させてしまう
// （実際に1920で撮ると本文が細く全幅ボタンが伸びきって、画面の目的と合わない）
const laptopCtx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  colorScheme: 'dark',
})
const laptopPage = await laptopCtx.newPage()
watch(laptopPage)
await laptopPage.goto(`${origin}/${MOCK}`, { waitUntil: 'networkidle' })
await laptopPage.waitForTimeout(1500)
await skipOnboarding(laptopPage, 'さとう')
const lotteryEntry = laptopPage.getByRole('button', { name: /イベントバトルを主催/ })
if (await lotteryEntry.count()) {
  await lotteryEntry.first().click()
  await laptopPage.waitForTimeout(1000)
  await capture(laptopPage, '01-host-lottery', { wide: true })
} else {
  console.log('not reached: 01-host-lottery')
}

const hostEntry = hostPage.getByRole('button', { name: /イベントバトルを主催/ })
if (await hostEntry.count()) {
  await hostEntry.first().click()
  await hostPage.waitForTimeout(1000)
  await hostPage.getByRole('button', { name: /ルームを作成/ }).click()
  await hostPage.waitForTimeout(1000)
  await capture(hostPage, '02-host-lobby', { wide: true })
  await hostPage.getByRole('button', { name: /^開始する$/ }).click()
  await hostPage.waitForTimeout(6000)
  await capture(hostPage, '03-host-question', { wide: true })
  await hostPage.evaluate('window.__bebScreenshotMock.battleStandings()')
  await hostPage.waitForTimeout(900)
  await capture(hostPage, '04-host-standings', { wide: true })
  await hostPage.evaluate('window.__bebScreenshotMock.battleResult()')
  await hostPage.waitForTimeout(1700)
  await capture(hostPage, '05-host-result', { wide: true })
} else {
  console.log('not reached: 01-05（イベントバトル主催の導線が見つからない）')
}

writeFileSync(`${outDir}/shots.json`, JSON.stringify(shots, null, 1))
const total = shots.reduce((n, s) => n + s.dataUri.length, 0)
console.log(`\n${shots.length}枚 / data URI 合計 ${Math.round(total / 1024)}KB`)
if (errors.length) console.log('console errors:', JSON.stringify(errors.slice(0, 10), null, 1))
else console.log('console errors: なし')
await browser.close()
