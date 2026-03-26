/* Generate by @shikijs/codegen */
import type {
  DynamicImportLanguageRegistration,
  DynamicImportThemeRegistration,
  HighlighterGeneric,
} from '@shikijs/types'
import {
  createBundledHighlighter,
  createSingletonShorthands,
} from '@shikijs/core'
import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript'

type BundledLanguage =
  | 'javascript'
  | 'js'
  | 'cjs'
  | 'mjs'
  | 'typescript'
  | 'ts'
  | 'cts'
  | 'mts'
  | 'jsx'
  | 'tsx'
  | 'html'
  | 'css'
  | 'json'
  | 'python'
  | 'py'
  | 'rust'
  | 'rs'
  | 'shellscript'
  | 'bash'
  | 'sh'
  | 'shell'
  | 'zsh'
  | 'sql'
  | 'yaml'
  | 'yml'
  | 'markdown'
  | 'md'
  | 'go'
  | 'java'
  | 'c'
  | 'cpp'
  | 'c++'
  | 'ruby'
  | 'rb'
  | 'php'
  | 'swift'
  | 'kotlin'
  | 'kt'
  | 'kts'
  | 'lua'
  | 'diff'
  | 'toml'
  | 'xml'
  | 'docker'
  | 'dockerfile'
  | 'graphql'
  | 'gql'
type BundledTheme = 'light-plus' | 'dark-plus'
type Highlighter = HighlighterGeneric<BundledLanguage, BundledTheme>

const bundledLanguages = {
  javascript: () => import('@shikijs/langs-precompiled/javascript'),
  js: () => import('@shikijs/langs-precompiled/javascript'),
  cjs: () => import('@shikijs/langs-precompiled/javascript'),
  mjs: () => import('@shikijs/langs-precompiled/javascript'),
  typescript: () => import('@shikijs/langs-precompiled/typescript'),
  ts: () => import('@shikijs/langs-precompiled/typescript'),
  cts: () => import('@shikijs/langs-precompiled/typescript'),
  mts: () => import('@shikijs/langs-precompiled/typescript'),
  jsx: () => import('@shikijs/langs-precompiled/jsx'),
  tsx: () => import('@shikijs/langs-precompiled/tsx'),
  html: () => import('@shikijs/langs-precompiled/html'),
  css: () => import('@shikijs/langs-precompiled/css'),
  json: () => import('@shikijs/langs-precompiled/json'),
  python: () => import('@shikijs/langs-precompiled/python'),
  py: () => import('@shikijs/langs-precompiled/python'),
  rust: () => import('@shikijs/langs-precompiled/rust'),
  rs: () => import('@shikijs/langs-precompiled/rust'),
  shellscript: () => import('@shikijs/langs-precompiled/shellscript'),
  bash: () => import('@shikijs/langs-precompiled/shellscript'),
  sh: () => import('@shikijs/langs-precompiled/shellscript'),
  shell: () => import('@shikijs/langs-precompiled/shellscript'),
  zsh: () => import('@shikijs/langs-precompiled/shellscript'),
  sql: () => import('@shikijs/langs-precompiled/sql'),
  yaml: () => import('@shikijs/langs-precompiled/yaml'),
  yml: () => import('@shikijs/langs-precompiled/yaml'),
  markdown: () => import('@shikijs/langs-precompiled/markdown'),
  md: () => import('@shikijs/langs-precompiled/markdown'),
  go: () => import('@shikijs/langs-precompiled/go'),
  java: () => import('@shikijs/langs-precompiled/java'),
  c: () => import('@shikijs/langs-precompiled/c'),
  cpp: () => import('@shikijs/langs-precompiled/cpp'),
  'c++': () => import('@shikijs/langs-precompiled/cpp'),
  ruby: () => import('@shikijs/langs-precompiled/ruby'),
  rb: () => import('@shikijs/langs-precompiled/ruby'),
  php: () => import('@shikijs/langs-precompiled/php'),
  swift: () => import('@shikijs/langs-precompiled/swift'),
  kotlin: () => import('@shikijs/langs-precompiled/kotlin'),
  kt: () => import('@shikijs/langs-precompiled/kotlin'),
  kts: () => import('@shikijs/langs-precompiled/kotlin'),
  lua: () => import('@shikijs/langs-precompiled/lua'),
  diff: () => import('@shikijs/langs-precompiled/diff'),
  toml: () => import('@shikijs/langs-precompiled/toml'),
  xml: () => import('@shikijs/langs-precompiled/xml'),
  docker: () => import('@shikijs/langs-precompiled/docker'),
  dockerfile: () => import('@shikijs/langs-precompiled/docker'),
  graphql: () => import('@shikijs/langs-precompiled/graphql'),
  gql: () => import('@shikijs/langs-precompiled/graphql'),
} as Record<BundledLanguage, DynamicImportLanguageRegistration>

const bundledThemes = {
  'light-plus': () => import('@shikijs/themes/light-plus'),
  'dark-plus': () => import('@shikijs/themes/dark-plus'),
} as Record<BundledTheme, DynamicImportThemeRegistration>

const createHighlighter = /* @__PURE__ */ createBundledHighlighter<
  BundledLanguage,
  BundledTheme
>({
  langs: bundledLanguages,
  themes: bundledThemes,
  engine: () => createJavaScriptRegexEngine(),
})

const {
  codeToHtml,
  codeToHast,
  codeToTokensBase,
  codeToTokens,
  codeToTokensWithThemes,
  getSingletonHighlighter,
  getLastGrammarState,
} = /* @__PURE__ */ createSingletonShorthands<BundledLanguage, BundledTheme>(
  createHighlighter,
)

export {
  bundledLanguages,
  bundledThemes,
  codeToHast,
  codeToHtml,
  codeToTokens,
  codeToTokensBase,
  codeToTokensWithThemes,
  createHighlighter,
  getLastGrammarState,
  getSingletonHighlighter,
}
export type { BundledLanguage, BundledTheme, Highlighter }
