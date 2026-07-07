#!/usr/bin/env node
// コンテンツパイプライン CLI のエントリポイント。
// コマンド体系（generate / review-export / review-import / tts / build）の実装は T-24。
// ここでは shared-schema の型共有が機能することの配線確認のみ。

import { SCHEMA_VERSION } from '@beb-raid/shared-schema'

console.log(`beb-raid CLI (問題パック schemaVersion: ${SCHEMA_VERSION})`)
console.log('コマンドは未実装です（T-24 で実装予定）')
