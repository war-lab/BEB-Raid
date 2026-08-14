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
      // T-295（K-58）: speechSynthesisはAudioPlayerの外の音声出力経路のため同様に塞ぐ
      'no-restricted-globals': [
        'error',
        { name: 'caches', message: 'PackCache（src/platform）経由で使うこと（T-04）' },
        { name: 'Notification', message: 'Notifier（src/platform）経由で使うこと（T-263）' },
        {
          name: 'speechSynthesis',
          message: 'AudioPlayer（src/platform）経由で使うこと（T-295・K-58）',
        },
      ],
      'no-restricted-properties': [
        'error',
        // T-295（K-58）: 列挙がwindow/globalThisのみで、self.cachesが素通りしていた。
        // Web WorkerのグローバルスコープはselfもWindow/WorkerGlobalScope双方の参照先になりうるため、
        // caches・Audio・AudioContext・Notification・speechSynthesisいずれもselfを併記する
        ...['window', 'globalThis', 'self'].flatMap((object) => [
          {
            object,
            property: 'caches',
            message: 'PackCache（src/platform）経由で使うこと（T-04・T-263・T-295）',
          },
          {
            object,
            property: 'Audio',
            message: 'AudioPlayer（src/platform）経由で使うこと（T-04・T-263・T-295）',
          },
          {
            object,
            property: 'AudioContext',
            message: 'AudioPlayer（src/platform）経由で使うこと（T-04・T-263・T-295）',
          },
          {
            object,
            property: 'Notification',
            message: 'Notifier（src/platform）経由で使うこと（T-263・T-295）',
          },
          {
            object,
            property: 'speechSynthesis',
            message: 'AudioPlayer（src/platform）経由で使うこと（T-295・K-58）',
          },
        ]),
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
        {
          // T-295（K-58）: Audio識別子を経由しないaudio要素生成の迂回路
          selector:
            "CallExpression[callee.property.name='createElement'][arguments.0.value='audio']",
          message: 'AudioPlayer（src/platform）経由で使うこと（T-295・K-58）',
        },
        {
          // T-295（K-58）: ServiceWorkerRegistration.showNotificationはNotifier抽象の迂回路
          // （iOS PWAで通知を出す唯一のWeb手段のため実装者が最も自然に書く形が抽象層を迂回する）。
          // 呼び出し元オブジェクトの名前が固定されないため、webkitAudioContextと同じ理由で
          // プロパティ名一致で検出する
          selector: "MemberExpression[property.name='showNotification']",
          message: 'Notifier（src/platform）経由で使うこと（T-295・K-58）',
        },
      ],
    },
  },
  {
    // T-289（K-16。docs/32 3節J-116系）: 型情報つきESLintを使っておらず、未awaitの
    // Promise（recordAnswerPipelineの記録漏れ・pendingSyncのエンキュー漏れ等、無音の
    // データ欠落に直結しうる）を検出できていなかった。packages/app/src/**に限定して
    // 有効化する（型検査つきlintは低速なため、まずapp/src配下から導入する）
    files: ['packages/app/src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        // allowDefaultProjectが無いと、実在しないパス（eslintBoundary.test.tsがlintTextへ
        // 渡す仮想ファイル）で「project serviceに見つからない」致命的なパースエラーになり、
        // 境界ルール（no-restricted-*）の検証テストごと壊れる。実在するプローブ
        // （__eslint_promise_probe__.ts）は通常どおりproject service側で解決されるため、
        // ここには含めない（含めると「両方に含まれている」エラーになる）
        projectService: {
          allowDefaultProject: [
            'packages/app/src/__boundary_probe__.ts',
            'packages/app/src/platform/__boundary_probe__.ts',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
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
