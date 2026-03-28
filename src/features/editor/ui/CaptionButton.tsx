import {
  useBlockNoteEditor,
  useComponentsContext,
  useEditorState,
} from '@blocknote/react'
import { Captions } from 'lucide-react'
import { useCallback } from 'react'

/**
 * State payload used to open the caption-editing dialog.
 *
 * @property blockId - The BlockNote block identifier of the target image/file block.
 * @property caption - The current caption text to pre-populate in the dialog input.
 */
export interface CaptionDialogState {
  blockId: string
  caption: string
}

/**
 * Props for the {@link CaptionButton} component.
 *
 * @property onRequestOpen - Callback invoked with the selected block's caption state
 *   when the user clicks the button. The parent renders {@link CaptionDialog} accordingly.
 */
interface CaptionButtonProps {
  onRequestOpen: (state: CaptionDialogState) => void
}

/**
 * Toolbar button that requests opening a caption-editing dialog for the
 * selected image/file block.
 *
 * The actual dialog is rendered by {@link CaptionDialog} at the Editor
 * component level so it survives FormattingToolbar unmount cycles.
 */
export const CaptionButton = ({ onRequestOpen }: CaptionButtonProps) => {
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor()

  /** Resolves to the single selected block only when it is an image/file block
   *  that exposes both `url` and `caption` string props. Returns `undefined`
   *  when no suitable block is selected, causing the button to self-hide. */
  const block = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor.isEditable) return
      const blocks = editor.getSelection()?.blocks || [
        editor.getTextCursorPosition().block,
      ]
      if (blocks.length !== 1) return
      const b = blocks[0]
      const props = b.props as Record<string, unknown>
      // Only image/file blocks have both `url` and `caption` props.
      if (
        typeof props?.url === 'string' &&
        typeof props?.caption === 'string'
      ) {
        return b
      }
      return
    },
  })

  /** Extracts the current caption from the selected block and requests the
   *  parent to open the caption dialog. */
  const handleClick = useCallback(() => {
    if (!block) return
    const caption =
      ((block.props as Record<string, unknown>).caption as string) || ''
    onRequestOpen({ blockId: block.id, caption })
  }, [block, onRequestOpen])

  if (block === undefined) return null

  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      onClick={handleClick}
      label="Edit caption"
      mainTooltip="Edit caption"
      icon={<Captions size={18} />}
    />
  )
}
