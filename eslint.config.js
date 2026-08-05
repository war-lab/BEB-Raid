// ESLint flat config（monorepo 全体で共有）
import js from '@eslint/js'
import configPrettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // .claude/ はセッション用worktree（.claude/worktrees/）が置かれるため除外する
  // （worktree内のファイルをルートからも二重lintするとtsconfigRootDirが多義になりエラーになる）。
  // packages/api/.wrangler/ は wrangler dev/vitest のローカル実行時生成物（M3・T-90）
  {
    ignores: [
      '**/dist/',
      '**/dev-dist/',
      '**/node_modules/',
      '.playwright-mcp/',
      '.claude/',
      'packages/api/.wrangler/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/app/**/*.{ts,tsx}', 'packages/review-ui/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // 抽象化レイヤの強制（docs/05 7節・T-04）:
    // UI・エンジンコードは音声再生とキャッシュを Web API 直接でなく
    // src/platform のインターフェース経由で使う
    files: ['packages/app/src/**/*.{ts,tsx}'],
    ignores: ['packages/app/src/platform/**'],
    rules: {
      // no-restricted-globals はベア識別子（`caches` 単体の参照）しか検出できず、
      // `window.caches` や `globalThis.caches` はメンバー式のため素通りする（T-263）。
      // メンバー式は no-restricted-properties 側で塞ぐ。
      'no-restricted-globals': [
        'error',
        { name: 'caches', message: 'PackCache（src/platform）経由で使うこと（T-04）' },
        { name: 'Notification', message: 'Notifier（src/platform）経由で使うこと（T-263）' },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'window',
          property: 'caches',
          message: 'PackCache（src/platform）経由で使うこと（T-04・T-263）',
        },
        {
          object: 'globalThis',
          property: 'caches',
          message: 'PackCache（src/platform）経由で使うこと（T-04・T-263）',
        },
        {
          object: 'window',
          property: 'Audio',
          message: 'AudioPlayer（src/platform）経由で使うこと（T-04・T-263）',
        },
        {
          object: 'globalThis',
          property: 'Audio',
          message: 'AudioPlayer（src/platform）経由で使うこと（T-04・T-263）',
        },
        {
          object: 'window',
          property: 'AudioContext',
          message: 'AudioPlayer（src/platform）経由で使うこと（T-04・T-263）',
        },
        {
          object: 'globalThis',
          property: 'AudioContext',
          message: 'AudioPlayer（src/platform）経由で使うこと（T-04・T-263）',
        },
        {
          object: 'window',
          property: 'Notification',
          message: 'Notifier（src/platform）経由で使うこと（T-263）',
        },
        {
          object: 'globalThis',
          property: 'Notification',
          message: 'Notifier（src/platform）経由で使うこと（T-263）',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Audio']",
          message: 'AudioPlayer（src/platform）経由で使うこと（T-04）',
        },
        {
          selector: "NewExpression[callee.name='AudioContext']",
          message: 'AudioPlayer（src/platform）経由で使うこと（T-04）',
        },
        {
          selector: "NewExpression[callee.name='webkitAudioContext']",
          message: 'AudioPlayer（src/platform）経由で使うこと（T-04・T-263）',
        },
        {
          // webkitAudioContext は型定義に無い非標準APIのため、実コードでは
          // `(window as any).webkitAudioContext` のようにキャストを介して参照する。
          // キャストを挟むと object 側の型が Identifier でなくなり no-restricted-properties
          // の object 名一致から外れるため、プロパティ名一致でオブジェクトの形に依らず検出する。
          selector: "MemberExpression[property.name='webkitAudioContext']",
          message: 'AudioPlayer（src/platform）経由で使うこと（T-04・T-263）',
        },
      ],
    },
  },
  {
    // Node で実行するビルド補助スクリプト（.mjs）
    files: ['**/scripts/**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', URL: 'readonly' },
    },
  },
  // Prettier と競合する整形系ルールを無効化（整形は Prettier に一任）
  configPrettier,
)
