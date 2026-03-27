import { createExtension } from '@blocknote/core'

/**
 * BlockNote extension that fixes the checked state when splitting a
 * checkListItem block by pressing Enter at the text start.
 *
 * BlockNote's `splitBlockTr` passes `keepProps=undefined` (falsy) to
 * `tr.split()`, which gives the new (lower) node `attrs: {}` and resets
 * its `checked` to `false`.  The original (upper) node retains its
 * `checked: true`.  After a line-start split the result is:
 *
 *   Upper: checked=true  (wrong — should be false)
 *   Lower: checked=false (wrong — should be true)
 *
 * This extension intercepts Enter on checked checkListItem blocks via
 * `runsBefore: ['check-list-item-shortcuts']` and performs the split
 * with corrected checked states using `editor.transact()`.
 */
export const checklistSplitFixExtension = createExtension(({ editor }) => ({
  key: 'checklistSplitFix',
  runsBefore: ['check-list-item-shortcuts'],
  keyboardShortcuts: {
    Enter: () => {
      const pos = editor.getTextCursorPosition()
      if (pos.block.type !== 'checkListItem') return false

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const block = editor.getBlock(pos.block.id) as any
      if (!block) return false

      // Check if cursor is at content start (line-head split) by inspecting
      // the TipTap selection.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tiptap = (editor as any)._tiptapEditor
      const { $from } = tiptap.state.selection
      // $from.parent is the checkListItem node; parentOffset === 0 means
      // the cursor is at the very start of its inline content.
      if ($from.parentOffset !== 0) return false

      // Block must have content (empty block → paragraph conversion is
      // handled by BlockNote's own handler).
      if (block.content?.length === 0) return false

      // checked=true, non-empty, cursor at content start: perform split
      // with corrected checked states.
      editor.transact(() => {
        const inserted = editor.insertBlocks(
          [{ type: 'checkListItem', props: { checked: false } }],
          pos.block.id,
          'before'
        )
        if (inserted.length > 0) {
          editor.setTextCursorPosition(inserted[0].id, 'start')
        }
      })

      return true
    },
  },
}))
