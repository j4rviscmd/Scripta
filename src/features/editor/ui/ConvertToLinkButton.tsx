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

  /**
   * Converts the currently selected image block into a paragraph containing
   * a single inline link.
   *
   * Uses the image's `url` prop as the link href, and its `name` prop (falling
   * back to the URL string itself) as the visible link text. The replacement is
   * issued as a single BlockNote `updateBlock` call so that the entire
   * conversion is reverted as one step when the user presses Cmd+Z / Ctrl+Z.
   *
   * No-ops when `block` is `undefined` (i.e. the button is hidden because the
   * selection is not an eligible image block).
   */
  const handleClick = useCallback(() => {
    if (!block) return
    const props = block.props as Record<string, unknown>
    const url = props.url as string
    const name = (props.name as string) || url

    // Replace the image block with a paragraph+link in a single atomic update so
    // that Cmd+Z reverts the whole conversion in one step.
    editor.updateBlock(block, {
      type: 'paragraph',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      content: [
        {
          type: 'link',
          href: url,
          content: [{ type: 'text', text: name || url, styles: {} }],
        },
      ] as any,
    })
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
