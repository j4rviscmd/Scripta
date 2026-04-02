import type { PartialBlock } from '@blocknote/core'
import { SideMenuExtension } from '@blocknote/core/extensions'
import {
  useBlockNoteEditor,
  useComponentsContext,
  useExtensionState,
} from '@blocknote/react'
import type { ReactNode } from 'react'

/**
 * DragHandleMenu item that inserts a copy of the hovered block immediately below it.
 *
 * Strips the original block's `id` so BlockNote assigns a fresh one, then
 * inserts the copy after the source block. Insertion is deferred to the next
 * microtask so the drag-handle menu can fully close and call
 * `unfreezeMenu()` before the document mutation races with the close event.
 *
 * @param props - Component props.
 * @param props.children - The label content rendered inside the menu item.
 * @returns A BlockNote `Generic.Menu.Item`, or `null` when no block is hovered.
 */
export const DuplicateBlockItem = (props: { children: ReactNode }) => {
  const Components = useComponentsContext()!
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editor = useBlockNoteEditor<any, any, any>()
  const block = useExtensionState(SideMenuExtension, {
    editor,
    selector: (state) => state?.block,
  })

  if (block === undefined) {
    return null
  }

  /**
   * Inserts a shallow copy of the hovered block directly after it.
   *
   * The original block's `id` is omitted so that BlockNote generates a unique
   * identifier for the duplicate. A `setTimeout(0)` is used to defer the
   * insertion until after the drag-handle menu has closed; without this the
   * document change races with the menu's close event and can leave the side
   * menu in a stuck state.
   */
  const handleDuplicate = () => {
    // Defer insertion until after the menu has fully closed and the
    // SideMenuExtension has called unfreezeMenu(). Without this, the document
    // change races with the close event and leaves the side menu stuck.
    setTimeout(() => {
      const { id: _id, ...blockCopy } = block
      editor.insertBlocks([blockCopy as PartialBlock], block, 'after')
    }, 0)
  }

  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      onClick={handleDuplicate}
    >
      {props.children}
    </Components.Generic.Menu.Item>
  )
}
