import { createExtension } from '@blocknote/core'
import { Plugin } from 'prosemirror-state'

/**
 * BlockNote extension that enables "range check toggle" behavior.
 *
 * When the user has a text selection spanning multiple checkListItem blocks
 * and clicks a checkbox on any one of them, ALL checkListItem blocks in the
 * selection are toggled to the same checked state.
 *
 * Selection tracking uses ProseMirror's `doc.nodesBetween()` inside a
 * plugin's `view.update()` callback.  This detects nested/child blocks
 * that `editor.getSelection()` collapses into their parent.
 *
 * `event.preventDefault()` on `mousedown` suppresses the native checkbox
 * toggle, which prevents BlockNote's built-in `change` handler from firing.
 *
 * All block updates are wrapped in `editor.transact()` so the batch
 * toggle is a single undo step.
 *
 * @returns A BlockNote extension object containing a ProseMirror plugin for
 *   selection tracking and a `mount` hook for the mousedown event listener.
 */
export const rangeCheckToggleExtension = createExtension(({ editor }) => {
  /**
   * Block IDs of checkListItem blocks in the most recent multi-block selection.
   *
   * Set to `null` when the selection is collapsed or spans fewer than two
   * checkListItem blocks.  Also cleared when a mousedown event targets an
   * element that is not a checkListItem checkbox.
   */
  let lastCheckListIds: string[] | null = null

  /**
   * Type guard that checks whether the given event target is a checkbox input
   * element that belongs to a checkListItem block.
   *
   * @param el - The event target to test. Typically obtained from
   *   `MouseEvent.target`.
   * @returns `true` when `el` is an `HTMLInputElement` of type `"checkbox"`
   *   nested inside a `[data-content-type="checkListItem"]` element.
   */
  function isCheckListCheckbox(el: EventTarget | null): el is HTMLInputElement {
    return (
      el instanceof HTMLInputElement &&
      el.type === 'checkbox' &&
      el.closest('[data-content-type="checkListItem"]') !== null
    )
  }

  return {
    key: 'rangeCheckToggle',
    prosemirrorPlugins: [
      new Plugin({
        view() {
          return {
            /**
             * ProseMirror view-update callback that tracks which checkListItem
             * blocks are covered by the current text selection.
             *
             * Walks every node between `selection.from` and `selection.to`
             * using `doc.nodesBetween()`.  For each `blockContainer` whose
             * first child is a `checkListItem`, an overlap check is performed
             * to exclude ancestor containers whose content does not actually
             * intersect the selection.
             *
             * `lastCheckListIds` is updated to the collected IDs when two or
             * more checkListItem blocks overlap the selection, or set to
             * `null` otherwise (collapsed cursor, single block, or no blocks).
             */
            update(view) {
              const { from, to } = view.state.selection
              if (from === to) {
                lastCheckListIds = null
                return
              }

              const ids: string[] = []
              view.state.doc.nodesBetween(from, to, (node, pos) => {
                if (
                  node.type.name === 'blockContainer' &&
                  node.firstChild?.type.name === 'checkListItem'
                ) {
                  // Only include this block if its checkListItem content
                  // actually overlaps with the selection range.
                  // Without this check, ancestor blockContainers (whose
                  // children are in the selection but whose own content
                  // is outside) would be incorrectly included.
                  const contentStart = pos + 1
                  const contentEnd = pos + 1 + node.firstChild.nodeSize
                  if (contentStart < to && contentEnd > from) {
                    const id = node.attrs.id as string | undefined
                    if (id) ids.push(id)
                  }
                }
              })

              lastCheckListIds = ids.length >= 2 ? ids : null
            },
          }
        },
      }),
    ],
    /**
     * Mount hook that registers a capturing `mousedown` listener on the editor
     * DOM element.
     *
     * When a checkbox inside a checkListItem block is clicked:
     * 1. Validates that `lastCheckListIds` contains two or more blocks.
     * 2. Verifies the clicked block is part of the tracked selection to guard
     *    against stale IDs from a previous selection.
     * 3. Prevents the default checkbox toggle via `event.preventDefault()`.
     * 4. Batch-updates every tracked block to the inverted checked state
     *    inside a single `editor.transact()` call.
     *
     * The listener is automatically removed when the extension is destroyed
     * (via the AbortSignal).
     *
     * @param dom - The editor's root DOM element.
     * @param signal - An `AbortSignal` used to clean up the event listener.
     */
    mount({ dom, signal }) {
      dom.addEventListener(
        'mousedown',
        (event: Event) => {
          const target = (event as MouseEvent).target
          if (!isCheckListCheckbox(target)) {
            lastCheckListIds = null
            return
          }

          const ids = lastCheckListIds
          if (!ids || ids.length < 2) return

          // Verify the clicked checkbox belongs to the saved range.
          // This guards against stale IDs from a previous selection that
          // was changed via keyboard without triggering a mousedown clear.
          const blockContainer = target.closest(
            '[data-node-type="blockContainer"]'
          )
          const clickedBlockId = blockContainer?.getAttribute('data-id')
          if (!clickedBlockId || !ids.includes(clickedBlockId)) return

          const newChecked = !target.checked

          event.preventDefault()

          editor.transact(() => {
            for (const id of ids) {
              editor.updateBlock(id, {
                props: { checked: newChecked },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any)
            }
          })
        },
        { capture: true, signal }
      )
    },
  }
})
