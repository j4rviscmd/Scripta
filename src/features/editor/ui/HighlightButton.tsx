import {
  useBlockNoteEditor,
  useComponentsContext,
  useEditorState,
} from '@blocknote/react'
import { Highlighter } from 'lucide-react'
import { useCallback } from 'react'

/**
 * Unique identifier for the highlighter style.
 * Uses a dedicated value ("highlight") instead of BlockNote's built-in
 * colour names so that the highlighter and the color-picker's yellow
 * are treated as separate styles.
 */
const HIGHLIGHT_STYLE = 'highlight'

/**
 * Toggle button that applies or removes a fluorescent-yellow highlight
 * on the selected text using a custom `backgroundColor` style value.
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
      // Hide the button when the editor is in read-only mode.
      if (!editor.isEditable) {
        return undefined
      }

      // Collect the blocks covered by the current selection (or the block at cursor).
      const selectedBlocks = editor.getSelection()?.blocks || [
        editor.getTextCursorPosition().block,
      ]

      // Hide the button when none of the selected blocks contain inline content.
      const hasContent = selectedBlocks.some(
        (block) => block.content !== undefined
      )
      if (!hasContent) {
        return undefined
      }

      // Determine whether the highlight style is already applied to the selection.
      const activeBg = editor.getActiveStyles().backgroundColor
      return { active: activeBg === HIGHLIGHT_STYLE }
    },
  })

  /**
   * Toggles the fluorescent highlight on the current editor selection.
   *
   * Focuses the editor first, then adds or removes the custom
   * `backgroundColor: "highlight"` style depending on whether the
   * highlight is already active on the selection.
   */
  const toggleHighlight = useCallback(() => {
    editor.focus()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const style = { backgroundColor: HIGHLIGHT_STYLE } as any

    if (state?.active) {
      editor.removeStyles(style)
    } else {
      editor.addStyles(style)
    }
  }, [editor, state])

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
