import type { PartialBlock } from '@blocknote/core'
import { SideMenuExtension } from '@blocknote/core/extensions'
import {
  useBlockNoteEditor,
  useComponentsContext,
  useExtensionState,
} from '@blocknote/react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { blockToMd } from '../lib/markdown-export'

/**
 * DragHandleMenu item that copies the hovered block to the clipboard as Markdown.
 *
 * Uses {@link blockToMd} to serialise the hovered block, then writes the result
 * to the system clipboard via the Web Clipboard API. A toast notification
 * indicates success or failure.
 *
 * @param props - Component props.
 * @param props.children - The label content rendered inside the menu item.
 * @returns A BlockNote `Generic.Menu.Item`, or `null` when no block is hovered.
 */
export const CopyBlockItem = (props: { children: ReactNode }) => {
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
   * Serialises the hovered block to Markdown and writes it to the system clipboard.
   *
   * Shows a success toast on completion or an error toast when the Clipboard API
   * rejects the write (e.g. when the page lacks focus).
   */
  const handleCopy = async () => {
    const md = blockToMd(block as PartialBlock, editor)
    try {
      await navigator.clipboard.writeText(md)
      toast.success('Copied')
    } catch {
      toast.error('Failed to copy block')
    }
  }

  return (
    <Components.Generic.Menu.Item className="bn-menu-item" onClick={handleCopy}>
      {props.children}
    </Components.Generic.Menu.Item>
  )
}
