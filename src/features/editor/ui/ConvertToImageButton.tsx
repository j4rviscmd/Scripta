import type { LinkToolbarProps } from '@blocknote/react'
import { useBlockNoteEditor, useComponentsContext } from '@blocknote/react'
import { ImageIcon } from 'lucide-react'
import { useCallback } from 'react'
import { findBlockRecursive, urlToImageName } from '../lib/imageBlockUtils'

/**
 * Props for the {@link ConvertToImageButton} component.
 *
 * @property url - The `href` of the inline link to convert into an image block.
 * @property range - The ProseMirror selection range occupied by the link inline element.
 * @property setToolbarOpen - Callback to close the parent link toolbar after conversion.
 */
interface ConvertToImageButtonProps {
  url: string
  range: NonNullable<LinkToolbarProps['range']>
  setToolbarOpen: (open: boolean) => void
}

/**
 * Link toolbar button that converts an inline link into an image block.
 *
 * When the link is the only content in its paragraph, the paragraph is
 * replaced entirely.  When the link sits alongside other text, the link
 * text is removed and the image block is inserted after the paragraph.
 */
export function ConvertToImageButton({
  url,
  range,
  setToolbarOpen,
}: ConvertToImageButtonProps) {
  const Components = useComponentsContext()
  const editor = useBlockNoteEditor()

  const handleClick = useCallback(() => {
    setToolbarOpen(false)
    if (!editor) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tiptap = (editor as any)._tiptapEditor
    if (!tiptap) return

    const { state, view } = tiptap
    const $pos = state.doc.resolve(range.from)
    const blockPos = $pos.before($pos.depth)
    const blockNode = state.doc.nodeAt(blockPos)
    if (!blockNode) return

    const blockEnd = blockPos + blockNode.nodeSize
    // +1 / -1 account for the opening/closing tags of the block node
    const isOnlyContent =
      range.from === blockPos + 1 && range.to === blockEnd - 1

    const name = urlToImageName(url)

    // Find the corresponding BlockNote block by URL
    const bnBlock = findBlockRecursive(editor.document, (b) => {
      const content = b.content
      if (!Array.isArray(content)) return false
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return content.some(
        (inline: any) => inline.type === 'link' && inline.href === url
      )
    })

    if (bnBlock) {
      // Insert the image block after the paragraph that holds the link.
      // Positions inside the current block are unaffected by an "after" insert.
      editor.insertBlocks(
        [{ type: 'image', props: { url, name, caption: name } }],
        bnBlock,
        'after'
      )

      if (isOnlyContent) {
        // The link was the entire paragraph — remove the now-empty block.
        editor.removeBlocks([bnBlock])
      } else {
        // Link was part of larger content — just delete the link text.
        const tr = state.tr.delete(range.from, range.to)
        view.dispatch(tr)
      }
    }
  }, [editor, url, range, setToolbarOpen])

  if (!Components) return null

  // Only show for HTTP(S) URLs
  if (!url.startsWith('http://') && !url.startsWith('https://')) return null

  return (
    <Components.LinkToolbar.Button
      mainTooltip="Convert to image"
      label="Convert to image"
      icon={<ImageIcon size={16} />}
      onClick={handleClick}
    />
  )
}
