/**
 * Code block configuration for BlockNote with Shiki syntax highlighting.
 *
 * Defines the supported languages, default language, and Shiki highlighter
 * factory used by `createCodeBlockSpec` to enable VS Code-quality syntax
 * highlighting in the editor's code blocks.
 *
 * ## Theme switching strategy
 *
 * BlockNote's internal Shiki integration (`prosemirror-highlight`) caches the
 * parser on `globalThis[Symbol.for("blocknote.shikiParser")]` and passes only
 * a single theme to `codeToTokens`. To enable **dual-theme** output (light +
 * dark CSS variables) we intercept the global cache: after the highlighter is
 * created we install our own parser that calls `codeToTokens` with the
 * `themes` option.  The resulting inline styles contain both the default
 * light-mode colour *and* a `--shiki-dark` CSS variable per token, which a
 * companion CSS rule (in `index.css`) activates when `.dark` is present on
 * the document root.
 */
import type { CodeBlockOptions } from '@blocknote/core'
import { createParser } from 'prosemirror-highlight/shiki'
import { createHighlighter } from './shiki.bundle'

/**
 * Languages available in the code block language selector.
 *
 * Each key must match a Shiki language identifier included in the generated
 * bundle (`shiki.bundle.ts`). The `name` is the display label shown in the
 * UI, and `aliases` are alternative identifiers that map to the same grammar.
 */
export const supportedLanguages: NonNullable<
  CodeBlockOptions['supportedLanguages']
> = {
  text: { name: 'Plain Text' },
  javascript: { name: 'JavaScript', aliases: ['js'] },
  typescript: { name: 'TypeScript', aliases: ['ts'] },
  jsx: { name: 'JSX' },
  tsx: { name: 'TSX' },
  html: { name: 'HTML' },
  css: { name: 'CSS' },
  json: { name: 'JSON' },
  python: { name: 'Python', aliases: ['py'] },
  rust: { name: 'Rust', aliases: ['rs'] },
  bash: { name: 'Bash', aliases: ['sh', 'shell', 'zsh'] },
  sql: { name: 'SQL' },
  yaml: { name: 'YAML', aliases: ['yml'] },
  markdown: { name: 'Markdown', aliases: ['md'] },
  go: { name: 'Go' },
  java: { name: 'Java' },
  c: { name: 'C' },
  cpp: { name: 'C++', aliases: ['c++'] },
  ruby: { name: 'Ruby', aliases: ['rb'] },
  php: { name: 'PHP' },
  swift: { name: 'Swift' },
  kotlin: { name: 'Kotlin', aliases: ['kt'] },
  lua: { name: 'Lua' },
  diff: { name: 'Diff' },
  toml: { name: 'TOML' },
  xml: { name: 'XML' },
  dockerfile: { name: 'Dockerfile', aliases: ['docker'] },
  graphql: { name: 'GraphQL', aliases: ['gql'] },
}

/**
 * Well-known symbol BlockNote uses to cache the Shiki parser on `globalThis`.
 *
 * By pre-populating this slot we ensure BlockNote picks up our dual-theme
 * parser instead of creating its own single-theme one.
 */
const SHIKI_PARSER_KEY = Symbol.for('blocknote.shikiParser')

/**
 * Installs a dual-theme Shiki parser into the BlockNote global cache.
 *
 * Must be called (and awaited) before BlockNote first highlights a code block.
 * The returned highlighter is still needed by BlockNote for language loading,
 * so we return it from `createHighlighter`.
 */
async function createDualThemeHighlighter() {
  const highlighter = await createHighlighter({
    themes: ['light-plus', 'dark-plus'],
    langs: [],
  })

  // Install our dual-theme parser into the global cache.
  // BlockNote checks `globalThis[Symbol.for("blocknote.shikiParser")]` before
  // creating its own parser (see @blocknote/core defaultBlocks source), so
  // this ensures all code blocks use light+dark CSS variable output.
  const dualParser = createParser(highlighter, {
    themes: {
      light: 'light-plus',
      dark: 'dark-plus',
    },
    defaultColor: 'light',
    cssVariablePrefix: '--shiki-',
  })
  ;(globalThis as Record<symbol, unknown>)[SHIKI_PARSER_KEY] = dualParser

  return highlighter
}

/**
 * Options passed to `createCodeBlockSpec` to enable syntax highlighting.
 */
export const codeBlockOptions: CodeBlockOptions = {
  indentLineWithTab: true,
  defaultLanguage: 'text',
  supportedLanguages,
  createHighlighter: createDualThemeHighlighter,
}
