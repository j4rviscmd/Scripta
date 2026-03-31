import {
  useBlockNoteEditor,
  useComponentsContext,
  useEditorState,
} from '@blocknote/react'
import { Link2 } from 'lucide-react'
import { useCallback } from 'react'

/**
 * Toolbar button that converts an image block with a remote URL into
 * a paragraph containing an inline link.
 *
 * Self-hides when the selected block is not an image block or when the
 * image uses a local `asset://` URL (uploaded file) rather than HTTP(S).
 */
export const ConvertToLinkButton = () => {
  // biome-ignore lint/style/noNonNullAssertion: consistent with existing toolbar buttons (RenameButton, DownloadButton, etc.)
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor()

  const block = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor.isEditable) return
      const blocks = editor.getSelection()?.blocks || [
        editor.getTextCursorPosition().block,
      ]
      if (blocks.length !== 1) return
      const b = blocks[0]
      if (b.type !== 'image') return
      const props = b.props as Record<string, unknown>
      const url = props?.url
      // Only show for HTTP/HTTPS URLs (not local asset:// URLs)
      if (typeof url === 'string' && url.startsWith('http')) {
        return b
      }
      return
    },
  })

  const handleClick = useCallback(() => {
    if (!block) return
    const props = block.props as Record<string, unknown>
    const url = props.url as string
    const name = (props.name as string) || url

    // Save the new block ID before mutating the document further.
    const inserted = editor.insertBlocks(
      [{ type: 'paragraph' }],
      block,
      'after'
    )
    // biome-ignore lint/style/noNonNullAssertion: inserted[0] is guaranteed by length check
    const newBlockId = inserted.length > 0 ? inserted[0]!.id : undefined

    editor.removeBlocks([block])

    // Insert the link as inline content into the new paragraph.
    if (newBlockId) {
      const newBlock = editor.getBlock(newBlockId)
      if (newBlock) {
        editor.setTextCursorPosition(newBlock)
        editor.insertInlineContent([
          {
            type: 'link',
            href: url,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            content: [{ type: 'text', text: name || url, styles: {} }] as any,
          },
        ])
      }
    }
  }, [block, editor])

  if (block === undefined) return null

  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      onClick={handleClick}
      label="Convert to link"
      mainTooltip="Convert to link"
      icon={<Link2 size={18} />}
    />
  )
}
