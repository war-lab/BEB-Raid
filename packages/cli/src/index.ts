#!/usr/bin/env node
// コンテンツパイプライン CLI のエントリポイント（T-24）。
// コマンド実体は commands.ts（テスト可能にするためエントリと分離）。

import { runCli } from './commands.js'

process.exitCode = await runCli(process.argv.slice(2))
