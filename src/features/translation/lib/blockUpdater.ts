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
//   {{C:text}}            code
//   {{B:text}}            bold
//   {{I:text}}            italic
//   {{S:text}}            strikethrough
//   {{U:text}}            underline
//   {{TC:#hexcolor|text}}  textColor
//   {{BC:#hexcolor|text}}  backgroundColor
//   {{L:href|text}}       link (inner text is recursively encoded)

type Tok =
  | { kind: 'Text'; value: string }
  | { kind: 'Open'; key: string; param?: string }
  | { kind: 'Close' }

const KNOWN_KEYS = new Set(['C', 'B', 'I', 'S', 'U', 'TC', 'BC', 'L'])
const PARAM_KEYS = new Set(['TC', 'BC', 'L'])

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
    if (s[i] === '{' && s[i + 1] === '{') {
      flushText()
      i += 2

      let key = ''
      while (i < s.length && s[i] !== ':' && s[i] !== '~' && s[i] !== '}') {
        key += s[i]
        i++
      }

      if (!KNOWN_KEYS.has(key) || i >= s.length || s[i] !== ':') {
        tokens.push({ kind: 'Text', value: '{{' })
        tokens.push({ kind: 'Text', value: key })
        if (i < s.length && s[i] === ':') {
          tokens.push({ kind: 'Text', value: ':' })
          i++
        }
        continue
      }
      i++ // skip ':'

      let param: string | undefined
      if (PARAM_KEYS.has(key)) {
        let p = ''
        while (i < s.length && s[i] !== '~') {
          p += s[i]
          i++
        }
        if (i < s.length && s[i] === '~') i++
        param = p
      }

      tokens.push({ kind: 'Open', key, param })
    } else if (s[i] === '}' && s[i + 1] === '}') {
      flushText()
      tokens.push({ kind: 'Close' })
      i += 2
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
  param?: string,
): void {
  switch (key) {
    case 'C':
      styles.code = true
      break
    case 'B':
      styles.bold = true
      break
    case 'I':
      styles.italic = true
      break
    case 'S':
      styles.strikethrough = true
      break
    case 'U':
      styles.underline = true
      break
    case 'TC':
      if (param) styles.textColor = param
      break
    case 'BC':
      if (param) styles.backgroundColor = param
      break
  }
}

function removeStyle(styles: Record<string, any>, key: string): void {
  switch (key) {
    case 'C':
      delete styles.code
      break
    case 'B':
      delete styles.bold
      break
    case 'I':
      delete styles.italic
      break
    case 'S':
      delete styles.strikethrough
      break
    case 'U':
      delete styles.underline
      break
    case 'TC':
      delete styles.textColor
      break
    case 'BC':
      delete styles.backgroundColor
      break
  }
}

function decodeRecursive(
  tokens: Tok[],
  pos: { i: number },
): any[] {
  const result: any[] = []
  let textBuf = ''
  const activeStyles: Record<string, any> = {}
  const styleStack: { key: string; param?: string; start: number }[] = []

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
        styleStack.push({ key: tok.key, param: tok.param, start: result.length })
        applyStyle(activeStyles, tok.key, tok.param)
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
          removeStyle(activeStyles, frame.key)
          if (frame.key === 'L') {
            const inner = result.splice(frame.start)
            result.push({
              type: 'link',
              href: frame.param ?? '',
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
export function decodeEncodedInline(encoded: string): any[] {
  try {
    const tokens = tokenize(encoded)
    const pos = { i: 0 }
    const nodes = decodeRecursive(tokens, pos)
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
  fn: () => void,
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
          block.content.some((n: any) => typeof n.text === 'string' && n.text.length > 0)
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
): void {
  if (flatIndex >= blockIds.length) return
  const blockId = blockIds[flatIndex]

  withSuppressedHistory(editor, () => {
    try {
      editor.updateBlock(blockId, {
        type: undefined as any,
        content: decodeEncodedInline(translatedText),
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
  originalBlocks: any[],
): void {
  const translatedDoc = structuredClone(editor.document)

  // Restore original content without recording it in undo history.
  withSuppressedHistory(editor, () => {
    editor.replaceBlocks(editor.document as any[], originalBlocks as any[])
  })

  // Replace original → translated as a single undo-able transaction.
  editor.replaceBlocks(originalBlocks as any[], translatedDoc as any[])
}
