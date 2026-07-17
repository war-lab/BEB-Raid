// ESLint flat config（monorepo 全体で共有）
import js from '@eslint/js'
import configPrettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/dist/',
      '**/dev-dist/',
      '**/node_modules/',
      '.playwright-mcp/',
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
      'no-restricted-globals': [
        'error',
        { name: 'caches', message: 'PackCache（src/platform）経由で使うこと（T-04）' },
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
