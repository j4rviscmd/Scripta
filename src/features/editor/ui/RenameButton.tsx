import {
  useBlockNoteEditor,
  useComponentsContext,
  useEditorState,
} from '@blocknote/react'
import { Pencil } from 'lucide-react'
import { useCallback } from 'react'

/**
 * State payload used to open the rename dialog.
 *
 * @property blockId - The BlockNote block identifier of the target image/file block.
 * @property name - The current file name to pre-populate in the dialog input.
 */
export interface RenameDialogState {
  blockId: string
  name: string
  url: string
}

/**
 * Props for the {@link RenameButton} component.
 *
 * @property onRequestOpen - Callback invoked with the selected block's rename state
 *   when the user clicks the button. The parent renders {@link RenameDialog} accordingly.
 */
interface RenameButtonProps {
  onRequestOpen: (state: RenameDialogState) => void
}

/**
 * Toolbar button that requests opening a rename dialog for the selected
 * image/file block.
 */
export const RenameButton = ({ onRequestOpen }: RenameButtonProps) => {
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor()

  /** Resolves to the single selected block only when it is an image/file block
   *  that exposes both `url` and `name` string props. Returns `undefined`
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
      // Only image/file blocks have both `url` and `name` props.
      if (typeof props?.url === 'string' && typeof props?.name === 'string') {
        return b
      }
      return
    },
  })

  /** Extracts the current name from the selected block and requests the
   *  parent to open the rename dialog. */
  const handleClick = useCallback(() => {
    if (!block) return
    const props = block.props as Record<string, unknown>
    const name = (props.name as string) || ''
    const url = (props.url as string) || ''
    onRequestOpen({ blockId: block.id, name, url })
  }, [block, onRequestOpen])

  if (block === undefined) return null

  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      onClick={handleClick}
      label="Rename"
      mainTooltip="Rename"
      icon={<Pencil size={18} />}
    />
  )
}
