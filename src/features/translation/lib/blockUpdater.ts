import type { BlockNoteEditor } from '@blocknote/core'

/**
 * Block types that contain user-editable text and should be translated.
 */
const TRANSLATABLE_BLOCK_TYPES = new Set([
  'heading',
  'paragraph',
  'bulletListItem',
  'numberedListItem',
  'checkListItem',
])

// --- Style-encoded inline content decoder ----------------------------------
//
// Decodes placeholder tokens produced by the Rust backend back into
// BlockNote inline content arrays.  Token format:
//
//   [[0]]...[[/0]]    code
//   [[1]]...[[/1]]    bold
//   [[2]]...[[/2]]    italic
//   [[3]]...[[/3]]    strikethrough
//   [[4]]...[[/4]]    underline
//   [[5]]...[[/5]]    textColor
//   [[9]]...[[/9]]    backgroundColor
//   [[7]]...[[/7]]    link (inner text is recursively encoded)

type Tok =
  | { kind: 'Text'; value: string }
  | { kind: 'Open'; key: string }
  | { kind: 'Close' }

const KNOWN_KEYS = new Set(['0', '1', '2', '3', '4', '5', '7', '9'])

/** Returns true if the key is a recognized style key. */
function isKnownKey(key: string): boolean {
  return KNOWN_KEYS.has(key)
}

/** Returns the base key (the key itself, since keys are '0'-'7'). */
function baseKey(key: string): string {
  return key
}

/**
 * Per-style counters used during decoding to sequentially resolve
 * param_map entries for styles 0 (code), 5 (textColor), 6 (backgroundColor), 7 (link).
 * Initialise with section offsets matching the paramMap layout from the backend:
 * `[code_params..., tc_params..., bc_params..., link_params...]`.
 */
export class StyleCounters {
  private c0 = 0
  private c5 = 0
  private c6 = 0
  private c7 = 0

  constructor(
    private off0: number = 0,
    private off5: number = 0,
    private off6: number = 0,
    private off7: number = 0
  ) {}

  next(base: string): number {
    if (base === '0') return this.off0 + this.c0++
    if (base === '5') return this.off5 + this.c5++
    if (base === '9') return this.off6 + this.c6++
    if (base === '7') return this.off7 + this.c7++
    return 0
  }
}

function tokenize(s: string): Tok[] {
  const tokens: Tok[] = []
  let i = 0
  let textBuf = ''

  const flushText = () => {
    if (textBuf.length > 0) {
      tokens.push({ kind: 'Text', value: textBuf })
      textBuf = ''
    }
  }

  while (i < s.length) {
    if (s[i] === '[' && s[i + 1] === '[') {
      // Look ahead for closing `]]`
      const innerStart = i + 2
      let k = innerStart
      while (k + 1 < s.length && !(s[k] === ']' && s[k + 1] === ']')) k++

      if (k + 1 < s.length && s[k] === ']' && s[k + 1] === ']') {
        const inner = s.slice(innerStart, k)
        flushText()
        i = k + 2

        if (inner.startsWith('/')) {
          const key = inner.slice(1)
          if (isKnownKey(key)) {
            tokens.push({ kind: 'Close' })
          } else {
            tokens.push({ kind: 'Text', value: `[[${inner}]]` })
          }
        } else if (isKnownKey(inner)) {
          tokens.push({ kind: 'Open', key: inner })
        } else {
          tokens.push({ kind: 'Text', value: `[[${inner}]]` })
        }
      } else {
        // No closing `]]` found: treat `[[` as literal
        textBuf += '[['
        i += 2
      }
    } else {
      textBuf += s[i]
      i++
    }
  }
  flushText()
  return tokens
}

function applyStyle(
  styles: Record<string, any>,
  key: string,
  paramMap: string[],
  counters: StyleCounters
): number | undefined {
  switch (key) {
    case '0': {
      // Code: index into paramMap returned so Close handler can look up the text.
      const idx = counters.next('0')
      styles.code = true
      return idx
    }
    case '1':
      styles.bold = true
      return undefined
    case '2':
      styles.italic = true
      return undefined
    case '3':
      styles.strike = true
      return undefined
    case '4':
      styles.underline = true
      return undefined
    case '5': {
      const idx = counters.next('5')
      if (idx < paramMap.length) styles.textColor = paramMap[idx]
      return idx
    }
    case '9': {
      const idx = counters.next('9')
      if (idx < paramMap.length) styles.backgroundColor = paramMap[idx]
      return idx
    }
    case '7': {
      const idx = counters.next('7')
      return idx
    }
    default:
      return undefined
  }
}

function removeStyle(styles: Record<string, any>, key: string): void {
  switch (baseKey(key)) {
    case '0':
      delete styles.code
      break
    case '1':
      delete styles.bold
      break
    case '2':
      delete styles.italic
      break
    case '3':
      delete styles.strike
      break
    case '4':
      delete styles.underline
      break
    case '5':
      delete styles.textColor
      break
    case '9':
      delete styles.backgroundColor
      break
  }
}

function decodeRecursive(
  tokens: Tok[],
  pos: { i: number },
  paramMap: string[],
  counters: StyleCounters
): any[] {
  const result: any[] = []
  let textBuf = ''
  const activeStyles: Record<string, any> = {}
  const styleStack: { key: string; pidx: number | undefined; start: number }[] =
    []

  while (pos.i < tokens.length) {
    const tok = tokens[pos.i]
    switch (tok.kind) {
      case 'Text':
        textBuf += tok.value
        break
      case 'Open': {
        if (textBuf.length > 0) {
          result.push({
            type: 'text',
            text: textBuf,
            styles: { ...activeStyles },
          })
          textBuf = ''
        }
        const pidx = applyStyle(activeStyles, tok.key, paramMap, counters)
        styleStack.push({ key: tok.key, pidx, start: result.length })
        break
      }
      case 'Close': {
        if (textBuf.length > 0) {
          result.push({
            type: 'text',
            text: textBuf,
            styles: { ...activeStyles },
          })
          textBuf = ''
        }
        const frame = styleStack.pop()
        if (frame) {
          if (frame.key === '0') {
            // Emit code text from paramMap BEFORE removing code style so the
            // resulting node carries {code: true}.
            const codeText =
              frame.pidx != null && frame.pidx < paramMap.length
                ? paramMap[frame.pidx]
                : ''
            result.push({
              type: 'text',
              text: codeText,
              styles: { ...activeStyles },
            })
          }
          removeStyle(activeStyles, frame.key)
          if (frame.key === '7') {
            const href =
              frame.pidx != null && frame.pidx < paramMap.length
                ? paramMap[frame.pidx]
                : ''
            const inner = result.splice(frame.start)
            result.push({
              type: 'link',
              href,
              content: inner,
            })
          }
        }
        break
      }
    }
    pos.i++
  }

  if (textBuf.length > 0) {
    result.push({
      type: 'text',
      text: textBuf,
      styles: { ...activeStyles },
    })
  }
  return result
}

/**
 * Decodes a style-encoded string (produced by the Rust backend's
 * `encode_inline_content`) back into a BlockNote inline content array.
 * Falls back to a single plain-text node on parse failure.
 */
export function decodeEncodedInline(
  encoded: string,
  paramMap: string[] = [],
  counters: StyleCounters = new StyleCounters()
): any[] {
  try {
    const tokens = tokenize(encoded)
    const pos = { i: 0 }
    const nodes = decodeRecursive(tokens, pos, paramMap, counters)
    if (nodes.length > 0) return nodes
  } catch {
    // Fall through to plain-text fallback
  }
  return [{ type: 'text', text: encoded, styles: {} }]
}

/**
 * Temporarily patches the ProseMirror view's dispatch so that every
 * transaction dispatched during `fn` has `addToHistory: false`, preventing
 * them from being recorded on the undo stack.
 */
export function withSuppressedHistory(
  editor: BlockNoteEditor,
  fn: () => void
): void {
  const view = editor.prosemirrorView
  const originalDispatch = view.dispatch
  view.dispatch = (tr: any) => {
    originalDispatch(tr.setMeta('addToHistory', false))
  }
  try {
    fn()
  } finally {
    view.dispatch = originalDispatch
  }
}

/**
 * Walks the editor document depth-first and collects the block IDs of all
 * translatable blocks in order.
 *
 * The returned array is indexed in the same way as the backend's
 * `extract_block_texts` so that a translated text at index `i` maps to
 * `ids[i]`.
 */
export function collectTranslatableBlockIds(editor: BlockNoteEditor): string[] {
  const ids: string[] = []

  function walk(blocks: any[]) {
    for (const block of blocks) {
      if (TRANSLATABLE_BLOCK_TYPES.has(block.type)) {
        if (
          Array.isArray(block.content) &&
          block.content.some(
            (n: any) =>
              n.type === 'link' ||
              (typeof n.text === 'string' && n.text.length > 0)
          )
        ) {
          ids.push(block.id)
        }
      }
      if (block.children?.length) walk(block.children)
    }
  }

  walk(editor.document)
  return ids
}

/**
 * Replaces the text content of the Nth translatable block with a translated
 * string. History is suppressed so the update is not recorded on the undo
 * stack — call {@link commitTranslation} after all blocks are updated to
 * create a single undo entry.
 */
export function updateBlockTextByIndex(
  editor: BlockNoteEditor,
  flatIndex: number,
  translatedText: string,
  blockIds: string[],
  paramMap: string[] = [],
  counters: StyleCounters = new StyleCounters()
): void {
  if (flatIndex >= blockIds.length) return
  const blockId = blockIds[flatIndex]

  withSuppressedHistory(editor, () => {
    try {
      editor.updateBlock(blockId, {
        type: undefined as any,
        content: decodeEncodedInline(translatedText, paramMap, counters),
      } as any)
    } catch {
      // Block may have been removed during streaming; skip silently.
    }
  })
}

/**
 * Creates a single undo entry that captures the full before → after state
 * of a translation.
 *
 * 1. Saves the current (translated) document.
 * 2. Restores `originalBlocks` with suppressed history.
 * 3. Calls `replaceBlocks(originalBlocks → translatedDoc)` with history
 *    enabled, producing exactly one undo entry.
 *
 * Steps 2–3 are synchronous, so no visual flash occurs.
 */
export function commitTranslation(
  editor: BlockNoteEditor,
  originalBlocks: any[]
): void {
  const translatedDoc = structuredClone(editor.document)

  // Restore original content without recording it in undo history.
  withSuppressedHistory(editor, () => {
    editor.replaceBlocks(editor.document as any[], originalBlocks as any[])
  })

  // Replace original → translated as a single undo-able transaction.
  editor.replaceBlocks(originalBlocks as any[], translatedDoc as any[])
}
