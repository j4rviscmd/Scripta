import type { BlockNoteEditor, PartialBlock } from '@blocknote/core'

/** Attribute written on the outer wrapper div for column-list blocks. */
const COL_LIST_ATTR = 'data-bn-cols'

/** Attribute written on each column div. */
const COL_ATTR = 'data-bn-col'

/** Matches a Markdown table separator row: `| --- | --- |` */
const TABLE_SEPARATOR_RE = /^\|[\s\-:|]+\|$/

/** Matches a Markdown table row that contains only whitespace and pipes (no visible text). */
const EMPTY_TABLE_ROW_RE = /^\|[\s|]*\|$/

/** Block types that form continuous lists (no blank lines between siblings). */
const LIST_BLOCK_TYPES = new Set([
  'bulletListItem',
  'numberedListItem',
  'checkListItem',
])

/**
 * Collapse loose-list blank lines into tight format.
 * Removes blank lines that appear before a list marker (with optional indentation).
 *
 * @param md - Markdown string that may contain loose-list formatting
 * @returns The same Markdown with inter-item blank lines removed
 */
function tightenList(md: string): string {
  return md.replace(/\n\n(\s*(?:[*-]|\d+\.) )/g, '\n$1')
}

/** Checks whether a block is a list item (bullet, numbered, or checklist). */
function isListBlock(block: PartialBlock): boolean {
  return LIST_BLOCK_TYPES.has(block.type as string)
}

/** Checks whether a block is a `columnList` block added by `@blocknote/xl-multi-column`. */
function isColumnListBlock(block: PartialBlock): boolean {
  return (block.type as string) === 'columnList'
}

/**
 * Converts a `columnList` block to a Markdown string using HTML `<div>` wrappers
 * with `data-bn-cols` / `data-bn-col` attributes, enabling round-trip import
 * via {@link parseMarkdownWithColumns}.
 *
 * Each column's children are recursively converted to Markdown so that the
 * output is still human-readable while preserving enough metadata to restore
 * the column structure on re-import.
 */
function columnListToMd(block: PartialBlock, editor: BlockNoteEditor): string {
  const columns = block.children ?? []
  const colDivs = columns
    .map((col) => {
      const width = (col.props as { width?: number })?.width ?? 1
      const innerMd = (col.children ?? [])
        .map((child) => blockToMd(child, editor))
        .join('\n\n')
      return `<div ${COL_ATTR} data-width="${width}">\n\n${innerMd}\n\n</div>`
    })
    .join('\n')
  return `<div ${COL_LIST_ATTR}>\n${colDivs}\n</div>`
}

/** Checks whether a block is a toggle block (`toggleListItem` or a toggleable heading). */
function isToggleBlock(block: PartialBlock): boolean {
  if (block.type === 'toggleListItem') return true
  if (
    block.type === 'heading' &&
    (block.props as { isToggleable?: boolean })?.isToggleable
  )
    return true
  return false
}

/**
 * Converts BlockNote inline content (StyledText, Link, or plain string)
 * to a Markdown string with basic formatting preserved.
 *
 * @param content - Inline content array from a BlockNote block
 * @returns Markdown-formatted string representation of the inline content
 */
function inlineContentToMd(content: PartialBlock['content']): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map((item: any) => {
      if (typeof item === 'string') return item

      if (item.type === 'text') {
        let text = item.text ?? ''
        const styles = item.styles ?? {}
        if (styles.strikethrough) text = `~~${text}~~`
        if (styles.bold) text = `**${text}**`
        if (styles.italic) text = `*${text}*`
        if (styles.code) text = `\`${text}\``
        return text
      }

      if (item.type === 'link') {
        const linkText = inlineContentToMd(item.content)
        return `[${linkText}](${item.href})`
      }

      return ''
    })
    .join('')
}

/**
 * Recursively converts a BlockNote block to Markdown.
 * ToggleListItem and toggle Heading blocks are exported as `<details>` tags.
 *
 * @param block - A single BlockNote block to convert
 * @param editor - The BlockNoteEditor instance used for fallback conversion
 * @returns Markdown string for the given block
 */
function blockToMd(block: PartialBlock, editor: BlockNoteEditor): string {
  if (isColumnListBlock(block)) {
    return columnListToMd(block, editor)
  }

  if (isToggleBlock(block)) {
    const title = inlineContentToMd(block.content)
    let body = ''
    if (block.children && block.children.length > 0) {
      body =
        '\n' +
        block.children.map((child) => blockToMd(child, editor)).join('\n\n') +
        '\n'
    }
    return `<details>\n<summary>${title}</summary>${body}</details>`
  }

  return editor.blocksToMarkdownLossy([block]).trimEnd()
}

/**
 * Exports the editor document to Markdown, converting toggle blocks
 * (ToggleListItem and toggle Heading) to `<details>` tags.
 * Consecutive list items of the same type are grouped and exported
 * as a tight list (no blank lines between items).
 *
 * @param editor - The BlockNoteEditor instance whose document will be exported
 * @returns The full document as a Markdown string
 */
export function exportToMarkdown(editor: BlockNoteEditor): string {
  const blocks = editor.document
  const segments: string[] = []
  let i = 0

  while (i < blocks.length) {
    const block = blocks[i]

    if (isToggleBlock(block)) {
      segments.push(blockToMd(block, editor))
      i++
      continue
    }

    if (isColumnListBlock(block)) {
      segments.push(blockToMd(block, editor))
      i++
      continue
    }

    // Group consecutive same-type list blocks for tight list output.
    // Empty paragraphs break the group so intentional spacing is preserved.
    if (isListBlock(block)) {
      const group: PartialBlock[] = []
      const listType = block.type
      while (
        i < blocks.length &&
        blocks[i].type === listType &&
        !isToggleBlock(blocks[i])
      ) {
        group.push(blocks[i])
        i++
      }
      const md = editor.blocksToMarkdownLossy(group).trimEnd()
      segments.push(tightenList(md))
      continue
    }

    // Regular block
    segments.push(editor.blocksToMarkdownLossy([block]).trimEnd())
    i++
  }

  return segments.filter((s) => s.length > 0).join('\n\n')
}

/**
 * Fixes BlockNote's table export where an empty header row is inserted
 * above the actual header content.
 *
 * When BlockNote serialises a table, it may produce an empty first row
 * followed by the separator and then the real header. This function
 * detects that pattern and swaps the empty row with the real header row
 * so standard Markdown parsers render the table correctly.
 *
 * @param markdown - Raw Markdown string potentially containing malformed tables
 * @returns Corrected Markdown with properly ordered table header rows
 */
export function fixBlockNoteTableExport(markdown: string): string {
  const lines = markdown.split('\n')
  const result: string[] = []
  let i = 0
  while (i < lines.length) {
    if (
      i + 2 < lines.length &&
      EMPTY_TABLE_ROW_RE.test(lines[i]) &&
      TABLE_SEPARATOR_RE.test(lines[i + 1])
    ) {
      result.push(lines[i + 2])
      result.push(lines[i + 1])
      i += 3
    } else {
      result.push(lines[i])
      i++
    }
  }
  return result.join('\n')
}
