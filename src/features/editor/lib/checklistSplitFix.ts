import { createExtension } from '@blocknote/core'

/**
 * BlockNote extension that fixes cursor behaviour when pressing Enter at the
 * very start of a checkListItem block.
 *
 * **Problem**: BlockNote's default Enter handler (splitBlock) inserts a new
 * block *above* the current one and moves the cursor into that new block.
 * When the cursor is at the line head, the expected behaviour is:
 *
 *   - A new empty checkListItem is inserted *above* the current block.
 *   - The cursor stays on the *original* (now lower) block.
 *
 * This extension intercepts Enter on checkListItem blocks via
 * `runsBefore: ['check-list-item-shortcuts']` and performs the split with
 * the cursor left on the original (lower) block.
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

      // Non-empty, cursor at content start: insert a new empty checkListItem
      // above and keep the cursor on the original (lower) block.
      editor.transact(() => {
        editor.insertBlocks(
          [{ type: 'checkListItem', props: { checked: false } }],
          pos.block.id,
          'before'
        )
        // Cursor stays on the original block (pos.block.id).
        editor.setTextCursorPosition(pos.block.id, 'start')
      })

      return true
    },
  },
}))
