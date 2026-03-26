import type { BlockNoteEditor } from '@blocknote/core'
import { useEffect } from 'react'
import { toast } from 'sonner'

/**
 * Shows a success toast whenever the user copies or cuts content in the
 * BlockNote editor.
 *
 * Reacts to both `copy` (Cmd/Ctrl+C) and `cut` (Cmd/Ctrl+X) DOM events.
 * The `cut` listener uses the capture phase so the selection is checked
 * before ProseMirror removes the content from the DOM.
 */
export function useCopyToast(editor: BlockNoteEditor): void {
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tiptap = (editor as any)._tiptapEditor
    if (!tiptap) return

    /** The underlying DOM element that hosts the ProseMirror editor view. */
    const editorDom = tiptap.view.dom as HTMLElement

    /** Displays a success toast when the user copies or cuts non-collapsed content. */
    const handleCopyOrCut = (): void => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) return

      toast.success('Copied to clipboard')
    }

    editorDom.addEventListener('copy', handleCopyOrCut)
    editorDom.addEventListener('cut', handleCopyOrCut, true)

    return () => {
      editorDom.removeEventListener('copy', handleCopyOrCut)
      editorDom.removeEventListener('cut', handleCopyOrCut, true)
    }
  }, [editor])
}
