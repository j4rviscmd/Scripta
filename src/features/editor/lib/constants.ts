/** Union type representing a single inline element produced by BlockNote. */
type InlineContent =
  | string
  | { type: string; text?: string; children?: InlineContent[] }

/**
 * Recursively extracts plain text from BlockNote inline content.
 *
 * @param content - An inline content node produced by BlockNote.
 * @returns The concatenated plain-text representation.
 */
function inlineToText(content: InlineContent): string {
  if (typeof content === 'string') return content
  if (content.text) return content.text
  if (content.children) return content.children.map(inlineToText).join('')
  return ''
}

/**
 * Extracts a title from the first heading block in BlockNote document JSON.
 *
 * Parses the document JSON, locates the first heading block, and concatenates
 * its inline content into plain text truncated to 200 characters.
 * Falls back to `"Untitled"` when no heading exists or JSON cannot be parsed.
 *
 * @param content - The raw BlockNote document JSON string.
 * @returns The extracted title, or `"Untitled"` as a default.
 */
export function extractTitle(content: string): string {
  try {
    const blocks = JSON.parse(content) as Array<{
      type: string
      content?: string | InlineContent[]
    }>
    const heading = blocks.find((b) => b.type === 'heading')
    if (heading?.content) {
      const text =
        typeof heading.content === 'string'
          ? heading.content
          : heading.content.map(inlineToText).join('')
      return text.slice(0, 200) || 'Untitled'
    }
  } catch {
    // ignore parse errors
  }
  return 'Untitled'
}

/** Default BlockNote document content for new notes. */
export const DEFAULT_BLOCKS = [
  {
    type: 'heading',
    content: 'Welcome to Scripta',
    props: { level: 1 } as Record<string, unknown>,
  },
  {
    type: 'paragraph',
    content: 'The note app for everyone. Start typing here...',
  },
]

/** JSON-serialized form of {@link DEFAULT_BLOCKS} for API calls. */
export const DEFAULT_CONTENT = JSON.stringify(DEFAULT_BLOCKS)
