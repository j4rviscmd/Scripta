import type { BlockNoteEditor } from '@blocknote/core'

/**
 * Maps note IDs to their last-focused BlockNote block ID values.
 * Used as the in-memory representation of persisted cursor positions.
 *
 * @example
 * ```ts
 * { "note-abc123": "block-xyz789" }
 * ```
 */
export type CursorPositions = Record<string, string>

/**
 * Returns the `id` of the block that currently contains the text cursor.
 *
 * Delegates to BlockNote's `getTextCursorPosition()` which reads the
 * current ProseMirror selection and resolves it to the nearest block.
 *
 * @param editor - The BlockNote editor instance.
 * @returns The block ID, or `null` if no block is focused (e.g. no selection).
 */
export function getFocusedBlockId(editor: BlockNoteEditor): string | null {
  try {
    const pos = editor.getTextCursorPosition()
    return pos.block.id
  } catch {
    return null
  }
}

/**
 * Places the text cursor at the end of the specified block.
 *
 * Uses BlockNote's `setTextCursorPosition` with `"end"` placement.
 * If the block no longer exists in the document, this function is a no-op
 * and returns `false`.
 *
 * @param editor - The BlockNote editor instance.
 * @param blockId - The ID of the target block.
 * @returns `true` if the cursor was placed successfully, `false` otherwise.
 */
export function placeCursorAtBlockEnd(
  editor: BlockNoteEditor,
  blockId: string
): boolean {
  const block = editor.getBlock(blockId)
  if (!block) return false

  editor.setTextCursorPosition(block, 'end')
  return true
}

/**
 * Places the text cursor at the end of the first top-level block.
 *
 * This serves as the fallback when no persisted cursor position exists
 * for a note. If the document has no blocks, this function is a no-op
 * and returns `false`.
 *
 * @param editor - The BlockNote editor instance.
 * @returns `true` if the cursor was placed, `false` if the document was empty.
 */
export function placeCursorAtFirstBlock(editor: BlockNoteEditor): boolean {
  const blocks = editor.document
  if (blocks.length === 0) return false

  editor.setTextCursorPosition(blocks[0], 'end')
  return true
}
