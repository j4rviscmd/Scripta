import type { BlockNoteEditor, PartialBlock } from '@blocknote/core'

/** Matches a Markdown table separator row: `| --- | --- |` */
const TABLE_SEPARATOR_RE = /^\|[\s\-:|]+\|$/

/** Matches a Markdown table row that contains only whitespace and pipes (no visible text). */
const EMPTY_TABLE_ROW_RE = /^\|[\s|]*\|$/

/**
 * Converts BlockNote inline content (StyledText, Link, or plain string)
 * to a Markdown string with basic formatting preserved.
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
 */
function blockToMd(block: PartialBlock, editor: BlockNoteEditor): string {
  const isToggleListItem = block.type === 'toggleListItem'
  const isToggleHeading =
    block.type === 'heading' &&
    (block.props as { isToggleable?: boolean })?.isToggleable

  if (isToggleListItem || isToggleHeading) {
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

  return editor.blocksToMarkdownLossy([block])
}

/**
 * Exports the editor document to Markdown, converting toggle blocks
 * (ToggleListItem and toggle Heading) to `<details>` tags.
 */
export function exportToMarkdown(editor: BlockNoteEditor): string {
  const blocks = editor.document
  return blocks.map((block) => blockToMd(block, editor)).join('\n\n')
}

/**
 * Fixes BlockNote's table export where an empty header row is inserted
 * above the actual header content.
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
