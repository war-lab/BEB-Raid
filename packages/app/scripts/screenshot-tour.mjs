// 主要画面のスクリーンショット一括採取（ビジュアル確認用。docs/20 7節・docs/25 V-17）
//   前提: 別ターミナルで `npm run dev -w @beb-raid/app` が起動済み
//   使い方: node scripts/screenshot-tour.mjs [出力ディレクトリ] [--light] [--port=5173]
//   例:     node scripts/screenshot-tour.mjs shots --light --port=5174
// ポートは --port か環境変数 SCREENSHOT_PORT で変えられる（既定5173）。並行して別worktreeの
// devサーバーが5173を使っている状況が常態のため、固定ポート前提にしない（V-17）。
// モバイル実寸（390x844・DPR2）で、初回診断はスキップして各画面を回る。S8ホスト画面のみ
// 投影用レイアウト（V-11・JV-5でモバイルの縦3分割の適用外）なので1920x1080で撮る。
// ブラウザはOS同梱のEdge（channel: msedge）を使うため追加ダウンロード不要。
// CI等Edgeが無い環境では PWCHANNEL=chrome など環境変数でチャネルを変えられる。
//
// 【モック注入について（docs/25 JV-8=案A）】
// レイド・イベントバトルは共有APIのシーズンデータとWebSocket接続が前提のため、素のdev
// サーバーでは到達できない（docs/25 2.5節）。URLに `?screenshotMock=1` を付けたときだけ
// devサーバーが RaidApi・BattleSocket をモックへ差し替える（vitePlugins/screenshotMocks.ts。
// apply:'serve' のため本番ビルドには入らない）。本スクリプトは前半（01〜10）を素の状態で、
// 後半（11〜）をモック有効で撮る。素の状態の画面（ホーム等）の見た目を、モックが作る
// 「レイド登録済み・イベントバトル導線あり」の状態で塗り替えないための切り分け。
//
// 【それでも到達しない画面（黙って落とさないための明記。docs/25 2.5節と対応）】
// - ゴースト記録プレビュー（GhostBossResultScreen）: ボス役セッションの完走（同意→高難度
//   30問の解答）が前提。ボス役セッションを途中で打ち切ると同意済みの記録が不完全なまま
//   プレビューへ入るため、モックで飛ばすと実画面と異なる状態を撮ることになる。V-16の確認は
//   引き続き手動到達で行う。
// （旧「レイド討伐演出は未着手」の記載はV-21の実装により解消。モックの
//   setRaidDefeated(true) で到達し、12d として2枚撮る）
// - イベントバトルの切断画面（closed）: 撮影自体は可能だが、切断理由ごとに4種の文言が
//   出るため1枚では代表にならない。V-13の確認は文言単位のユニットテストで担保済み。

import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const args = process.argv.slice(2)
const outDir = args[0] && !args[0].startsWith('--') ? args[0] : 'shots'
const colorScheme = args.includes('--light') ? 'light' : 'dark'
const portArg = args.find((a) => a.startsWith('--port='))
const port = portArg ? portArg.slice('--port='.length) : (process.env.SCREENSHOT_PORT ?? '5173')
const origin = `http://localhost:${port}`
/** モック有効時に付けるクエリ（vitePlugins/screenshotMocks.ts と対応） */
const MOCK_QUERY = '?screenshotMock=1'

mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch({
  channel: process.env.PWCHANNEL ?? 'msedge',
  headless: true,
})
const errors = []

/** 実機相当のモバイルコンテキスト（既存の巡回と同条件） */
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme,
})
const page = await ctx.newPage()
watch(page)

function watch(target) {
  target.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  target.on('pageerror', (e) => errors.push(String(e)))
  // 「進行中のセッションを破棄しますか」等の window.confirm はPlaywright既定では
  // dismiss（=キャンセル）されるため、必ず承認して進める（承認しないと単独モードが始まらない）
  target.on('dialog', (d) => void d.accept())
}

/** 選択肢の描画待ち（音声問題は再生後に選択肢が出るため、固定待ちでは足りない） */
async function waitForChoices(target) {
  try {
    await target.waitForSelector('.choice-button', { timeout: 20_000 })
    return true
  } catch {
    return false
  }
}

async function shotOf(target, name) {
  await target.waitForTimeout(400)
  await target.screenshot({ path: `${outDir}/${name}-${colorScheme}.png`, fullPage: false })
  console.log('shot:', `${name}-${colorScheme}`)
}

async function shot(name) {
  await shotOf(page, name)
}

/**
 * コンテンツ帯（.screen-layout__content / ホスト投影の .battle-host-stage__body）と
 * 文書自体のスクロール位置を動かす。ScreenLayout は帯の内側で overflow-y: auto するが、
 * 帯の中身が伸びて画面全体が縦に溢れる画面（リザルト等）では文書側がスクロールするため、
 * 両方を動かす（fullPage スクリーンショットでは帯の内側の折り返しが写らない）
 */
async function scrollContent(target, top) {
  await target.evaluate(
    `(() => {
      const el = document.querySelector('.screen-layout__content, .battle-host-stage__body')
      if (el) el.scrollTop = ${top}
      document.scrollingElement.scrollTop = ${top}
    })()`,
  )
}

/**
 * 縦に長い画面（リザルト・レイド・最終リザルト）は1枚に収まらないため、
 * 帯の先頭と末尾の2枚を撮る（`-bottom` 付き。枚数を減らして落とすより、両方見て確認する）
 */
async function shotTall(target, name) {
  await scrollContent(target, 0)
  await shotOf(target, name)
  await scrollContent(target, 100_000)
  await shotOf(target, `${name}-bottom`)
}

/**
 * モックの操作口（window.__bebScreenshotMock）を叩く。式は文字列で渡す
 * （このファイルはNode側のスクリプトで window を持たないため。ブラウザ側で評価される）
 */
async function drive(target, expression) {
  await target.evaluate(expression)
}

await page.goto(origin, { waitUntil: 'networkidle' })
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
    await page.goto(origin, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)
  }
}

// ドリル: 今日のクエストを開始し、1問目と（選択肢があれば）正誤フィードバックまで撮る
const quest = page.getByRole('button', { name: /今日のクエスト/ })
if (await quest.count()) {
  await quest.first().click()
  await page.waitForTimeout(1500)
  await shot('07-drill')
}

// 正誤フィードバック（08）とリザルト（09）はPart5単独モードで撮る。
// 「今日のクエスト」の1問目はカリキュラム配分次第で音声・ディクテーションになり選択肢が
// 出ないことがあるため、選択肢が必ず出るPart5（text_blank）を使って決定的にする。
// リザルトはセッション完走が前提の画面（docs/25 2.5節）なので、モックではなく実際に
// 10問完走して到達する（音声待ちが無いため最短で終わる）
await page.goto(origin, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
let feedbackShot = false
const part5 = page.getByRole('button', { name: /^Part5/ })
if (await part5.count()) {
  await part5.first().click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: '10問' }).first().click()
  await page
    .getByRole('button', { name: /^開始$/ })
    .first()
    .click()
  await page.waitForTimeout(1500)
  for (let i = 0; i < 40; i += 1) {
    if (await page.locator('[data-testid="result-content"]').count()) break
    const choices = page.locator('.choice-button')
    if (await choices.count()) {
      await choices.first().click()
      await page.waitForTimeout(350)
      if (!feedbackShot) {
        feedbackShot = true
        await shot('08-drill-feedback')
      }
    }
    const next = page.getByRole('button', { name: /^(次へ|次の設問へ)$/ })
    if (await next.count()) {
      await next.first().click()
      await page.waitForTimeout(450)
    } else {
      await page.waitForTimeout(350)
    }
  }
  if (await page.locator('[data-testid="result-content"]').count()) {
    // カウントアップ（700ms）の完了後に撮る
    await page.waitForTimeout(1200)
    await shotTall(page, '09-result')
  } else {
    console.log('not reached: 09-result（Part5単独モードが完走しなかった）')
  }
}

// ---------------------------------------------------------------------------
// ここからモック有効（?screenshotMock=1）。読解・レイド・イベントバトル参加を撮る
// ---------------------------------------------------------------------------
await page.goto(`${origin}/${MOCK_QUERY}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

// 読解（Part6）: 通常はドリル内の遷移でしか入らないため、読解パックのセッションを
// モックの操作口から作って遷移する
await drive(page, 'window.__bebScreenshotMock.startReadingSession()')
await page.waitForTimeout(1500)
await shot('10-reading')

// S5 レイド（ゴースト週）: 登録済み状態とバッジをIndexedDBへ投入し、モックのRaidApiが
// 返すゴーストボスを表示する。参加後（joined）の状態まで進めて撮る
await drive(page, 'window.__bebScreenshotMock.seedRaid()')
await page.goto(`${origin}/${MOCK_QUERY}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
const raidEntry = page.getByRole('button', { name: /^レイド/ })
if (await raidEntry.count()) {
  await raidEntry.first().click()
  await page.waitForTimeout(1200)
  await shotTall(page, '11-raid')
  const join = page.getByRole('button', { name: /^参加する$/ })
  if (await join.count()) {
    await join.first().click()
    await page.waitForTimeout(1000)
    await shotTall(page, '12-raid-joined')
  }
  // 討伐済み（V-21の紋章の割れ＋金の粒子）。モックのボスを status='defeated'・HP0 に
  // 切り替えて再入場する。演出は総時間800msなので、粒子が出ている途中（約300ms）と
  // 落ち着いたあと（約1200ms）の2枚を撮る。番号は既存の連番をずらさないため 12d とする
  await drive(page, 'window.__bebScreenshotMock.setRaidDefeated(true)')
  await page.goto(`${origin}/${MOCK_QUERY}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const raidAgain = page.getByRole('button', { name: /^レイド/ })
  if (await raidAgain.count()) {
    await raidAgain.first().click()
    // 演出の途中を捕まえるため shotOf の既定待ち(400ms)を使わず直接撮る
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${outDir}/12d-raid-defeated-mid-${colorScheme}.png` })
    console.log(`shot: 12d-raid-defeated-mid-${colorScheme}`)
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${outDir}/12d-raid-defeated-${colorScheme}.png` })
    console.log(`shot: 12d-raid-defeated-${colorScheme}`)
  } else {
    console.log('not reached: 12d-raid-defeated（レイド導線が見つからない）')
  }
  await drive(page, 'window.__bebScreenshotMock.setRaidDefeated(false)')
} else {
  console.log('not reached: 11-raid（ホームのレイド導線が見つからない）')
}

// S7 イベントバトル参加: ルームコード入力→ロビー→出題中→途中順位→最終リザルト
await page.goto(`${origin}/${MOCK_QUERY}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
const battleEntry = page.getByRole('button', { name: /イベントバトルに参加/ })
if (await battleEntry.count()) {
  await battleEntry.first().click()
  await page.waitForTimeout(800)
  await page.locator('#battle-room-code').fill('RA1D')
  await shot('13-battle-entry')
  await page.getByRole('button', { name: /^参加する$/ }).click()
  await page.waitForTimeout(900)
  await shot('14-battle-lobby')
  await drive(page, 'window.__bebScreenshotMock.battleQuestionOpen()')
  await page.waitForTimeout(900)
  await shot('15-battle-question')
  // 解答直後の正誤フィードバック（枠色＋✓✕。学習中と同じ静かな表示）も1枚撮る
  if (await waitForChoices(page)) {
    await page.locator('.choice-button').first().click()
    await page.waitForTimeout(600)
    await shot('16-battle-answered')
  }
  await drive(page, 'window.__bebScreenshotMock.battleStandings()')
  await page.waitForTimeout(900)
  await shot('17-battle-standings')
  await drive(page, 'window.__bebScreenshotMock.battleResult()')
  // 表彰の段階開示（600〜900ms。V-10）の完了後に撮る
  await page.waitForTimeout(1600)
  await shotTall(page, '18-battle-result')
} else {
  console.log('not reached: 13-18 battle（ホームのイベントバトル導線が見つからない）')
}

// ---------------------------------------------------------------------------
// S8 イベントバトルホスト（投影用レイアウト）。V-11・JV-5でモバイルの縦3分割の適用外に
// なった画面で、確認すべきは「後方の席から読めるか（vw基準の特大タイポ・外周リング）」の
// ため、モバイル実寸ではなくプロジェクタ相当の1920x1080で撮る
// ---------------------------------------------------------------------------
const hostCtx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  colorScheme,
})
const hostPage = await hostCtx.newPage()
watch(hostPage)
await hostPage.goto(`${origin}/${MOCK_QUERY}`, { waitUntil: 'networkidle' })
await hostPage.waitForTimeout(1500)
if (await hostPage.getByText('ようこそ').count()) {
  // ホスト用コンテキストはIndexedDBが別なので初回診断から始まる
  await hostPage.getByLabel(/表示名/).fill('ホスト確認')
  await hostPage.getByLabel(/自己申告TOEIC/).fill('650')
  await hostPage.waitForTimeout(300)
  await hostPage
    .getByRole('button', { name: /スキップ/ })
    .first()
    .click()
  await hostPage.waitForTimeout(1200)
  const proceed = hostPage.getByRole('button', { name: /(ホーム|始める|はじめる)/ })
  if (await proceed.count()) {
    await proceed.first().click()
    await hostPage.waitForTimeout(1000)
  }
}
const hostEntry = hostPage.getByRole('button', { name: /イベントバトルを主催/ })
if (await hostEntry.count()) {
  await hostEntry.first().click()
  await hostPage.waitForTimeout(1000)
  await shotOf(hostPage, '19-battle-host-setup')
  await hostPage.getByRole('button', { name: /ルームを作成/ }).click()
  await hostPage.waitForTimeout(1000)
  await shotOf(hostPage, '20-battle-host-lobby')
  await hostPage.getByRole('button', { name: /^開始する$/ }).click()
  // 音声のある問題（Part2）が引かれた場合は再生完了を待って解答受付が開く。
  // ここでfake clockを入れると再生完了待ちが進まないため、実時間で待つ（V-17の注意）
  await hostPage.waitForTimeout(6000)
  await shotOf(hostPage, '21-battle-host-question')
  await drive(hostPage, 'window.__bebScreenshotMock.battleStandings()')
  await hostPage.waitForTimeout(900)
  await shotOf(hostPage, '22-battle-host-standings')
  await drive(hostPage, 'window.__bebScreenshotMock.battleResult()')
  await hostPage.waitForTimeout(1600)
  await shotTall(hostPage, '23-battle-host-result')

  // 想定上限（10人前後。docs/25 JV-11）での順位表。V-23の2列化が効いて全順位が1画面に
  // 収まるかを確認する。既定の5人（19〜23）はV-20の確認記録の画像と対応するので置き換えず、
  // 別番号（20c・22c・23c）で追加する
  await drive(hostPage, 'window.__bebScreenshotMock.setCrowdedStandings(true)')
  await hostPage.goto(`${origin}/${MOCK_QUERY}`, { waitUntil: 'networkidle' })
  await hostPage.waitForTimeout(1200)
  const hostEntry2 = hostPage.getByRole('button', { name: /イベントバトルを主催/ })
  if (await hostEntry2.count()) {
    await hostEntry2.first().click()
    await hostPage.waitForTimeout(900)
    await hostPage.getByRole('button', { name: /ルームを作成/ }).click()
    await hostPage.waitForTimeout(1000)
    await shotOf(hostPage, '20c-battle-host-lobby-10')
    await hostPage.getByRole('button', { name: /^開始する$/ }).click()
    await hostPage.waitForTimeout(6000)
    await drive(hostPage, 'window.__bebScreenshotMock.battleStandings()')
    await hostPage.waitForTimeout(900)
    await shotOf(hostPage, '22c-battle-host-standings-10')
    await drive(hostPage, 'window.__bebScreenshotMock.battleResult()')
    await hostPage.waitForTimeout(1600)
    await shotOf(hostPage, '23c-battle-host-result-10')
  } else {
    console.log('not reached: 20c/22c/23c（10人ロスターで主催導線が見つからない）')
  }
  await drive(hostPage, 'window.__bebScreenshotMock.setCrowdedStandings(false)')
} else {
  console.log('not reached: 19-23 battle host（ホームの主催導線が見つからない）')
}

if (errors.length) console.log('console errors:', JSON.stringify(errors.slice(0, 10), null, 1))
else console.log('console errors: なし')
await browser.close()
