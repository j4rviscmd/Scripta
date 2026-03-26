import type { BlockNoteEditor } from '@blocknote/core'
import { useEffect } from 'react'
import { toast } from 'sonner'

/**
 * Shows a success toast whenever the user copies content in the
 * BlockNote editor.
 *
 * Only reacts to the `copy` DOM event (Cmd/Ctrl+C); `cut` events
 * are intentionally ignored.  When the selection is collapsed
 * (nothing selected) no toast is shown.
 */
export function useCopyToast(editor: BlockNoteEditor): void {
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tiptap = (editor as any)._tiptapEditor
    if (!tiptap) return

    const editorDom = tiptap.view.dom as HTMLElement

    const handleCopy = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) return

      toast.success('Copied to clipboard')
    }

    editorDom.addEventListener('copy', handleCopy)

    return () => {
      editorDom.removeEventListener('copy', handleCopy)
    }
  }, [editor])
}
