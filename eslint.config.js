// ESLint flat config（monorepo 全体で共有）
import js from '@eslint/js'
import configPrettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/', '**/dev-dist/', '**/node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/app/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  // Prettier と競合する整形系ルールを無効化（整形は Prettier に一任）
  configPrettier,
)
