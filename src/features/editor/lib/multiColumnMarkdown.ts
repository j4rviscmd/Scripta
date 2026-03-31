import type { BlockNoteEditor, PartialBlock } from '@blocknote/core'

/** Opening tag for a column-list wrapper block. */
const COLS_OPEN_TAG = '<div data-bn-cols>'

/** Regex that captures individual <div data-bn-col data-width="N">...</div> blocks. */
const COLUMN_RE =
  /<div\s+data-bn-col(?:\s+data-width="([^"]*)")?\s*>([\s\S]*?)<\/div>/gi

/**
 * Splits a Markdown string into sections, separating `<div data-bn-cols>` column-list
 * blocks from surrounding regular Markdown content.
 *
 * Uses div-depth counting instead of a regex to correctly handle nested `<div>` tags
 * inside column content (e.g. raw HTML, toggle blocks).
 */
function splitMarkdownSections(markdown: string): string[] {
  const parts: string[] = []
  let pos = 0

  while (pos < markdown.length) {
    const colStart = markdown.indexOf(COLS_OPEN_TAG, pos)

    if (colStart === -1) {
      parts.push(markdown.slice(pos))
      break
    }

    // Push text before this column list.
    if (colStart > pos) {
      parts.push(markdown.slice(pos, colStart))
    }

    // Walk forward, tracking div nesting depth to find the matching outer </div>.
    let depth = 0
    let i = colStart
    let end = -1

    while (i < markdown.length) {
      if (
        markdown.startsWith('<div', i) &&
        (markdown[i + 4] === ' ' || markdown[i + 4] === '>')
      ) {
        depth++
        i += 4
      } else if (markdown.startsWith('</div>', i)) {
        depth--
        if (depth === 0) {
          end = i + 6 // '</div>'.length === 6
          break
        }
        i += 6
      } else {
        i++
      }
    }

    if (end === -1) {
      // Unclosed tag — push the rest as a column section and stop.
      parts.push(markdown.slice(colStart))
      break
    }

    parts.push(markdown.slice(colStart, end))
    pos = end
  }

  return parts.filter(Boolean)
}

/**
 * Parses a single `<div data-bn-cols>...</div>` HTML string into a `columnList`
 * PartialBlock by extracting each `<div data-bn-col>` child and recursively
 * parsing its Markdown content.
 *
 * Returns `null` when fewer than 2 columns are found (degenerate input).
 */
async function parseColumnListHtml(
  html: string,
  editor: BlockNoteEditor
): Promise<PartialBlock | null> {
  const columns: PartialBlock[] = []

  for (const match of html.matchAll(COLUMN_RE)) {
    const width = match[1] ? parseFloat(match[1]) : 1
    const innerMd = match[2].trim()
    const children: PartialBlock[] = innerMd
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((await editor.tryParseMarkdownToBlocks(innerMd)) as PartialBlock[])
      : []

    columns.push({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type: 'column' as any,
      props: { width },
      children,
    })
  }

  if (columns.length < 2) return null

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type: 'columnList' as any,
    children: columns,
  }
}

/**
 * Parses a Markdown string that may contain `<div data-bn-cols>` markers
 * (produced by {@link exportToMarkdown}) back into BlockNote blocks,
 * restoring the column layout for round-trip fidelity.
 *
 * Regular Markdown sections are delegated to BlockNote's built-in parser;
 * column sections are reconstructed as `columnList` / `column` blocks.
 *
 * @param markdown - Raw Markdown string, possibly containing column markers.
 * @param editor   - Active BlockNote editor instance used for parsing.
 * @returns Array of PartialBlock representing the full document structure.
 */
export async function parseMarkdownWithColumns(
  markdown: string,
  editor: BlockNoteEditor
): Promise<PartialBlock[]> {
  const result: PartialBlock[] = []

  for (const part of splitMarkdownSections(markdown)) {
    if (part.startsWith(COLS_OPEN_TAG)) {
      const block = await parseColumnListHtml(part, editor)
      if (block) result.push(block)
    } else if (part.trim()) {
      const blocks = (await editor.tryParseMarkdownToBlocks(
        part
      )) as PartialBlock[]
      result.push(...blocks)
    }
  }

  return result
}
