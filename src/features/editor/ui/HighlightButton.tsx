import {
  useBlockNoteEditor,
  useComponentsContext,
  useEditorState,
} from '@blocknote/react'
import { Highlighter } from 'lucide-react'
import { useCallback } from 'react'

/**
 * Yellow highlight color value used for the highlight style.
 */
const HIGHLIGHT_COLOR = 'yellow'

/**
 * Toggle button that applies or removes a yellow highlight on the
 * selected text using BlockNote's built-in `backgroundColor` style.
 *
 * The button is hidden when the editor is read-only or no inline
 * content is selected.  It appears active (pressed) when the
 * selection already has the yellow highlight applied.
 */
export const HighlightButton = () => {
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor()

  const state = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor.isEditable) {
        return undefined
      }

      const selectedBlocks = editor.getSelection()?.blocks || [
        editor.getTextCursorPosition().block,
      ]
      const hasContent = selectedBlocks.some(
        (block) => block.content !== undefined
      )
      if (!hasContent) {
        return undefined
      }

      const activeBg = editor.getActiveStyles().backgroundColor
      return { active: activeBg === HIGHLIGHT_COLOR }
    },
  })

  const toggleHighlight = useCallback(() => {
    editor.focus()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const style = { backgroundColor: HIGHLIGHT_COLOR } as any
    const isHighlighted =
      editor.getActiveStyles().backgroundColor === HIGHLIGHT_COLOR

    if (isHighlighted) {
      editor.removeStyles(style)
    } else {
      editor.addStyles(style)
    }
  }, [editor])

  if (state === undefined) {
    return null
  }

  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      data-test="highlight"
      onClick={toggleHighlight}
      isSelected={state.active}
      label="Highlight"
      mainTooltip="Highlight"
      icon={<Highlighter size={18} />}
    />
  )
}
