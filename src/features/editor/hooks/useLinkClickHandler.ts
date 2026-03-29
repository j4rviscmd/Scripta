import type { BlockNoteEditor } from '@blocknote/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useEffect } from 'react'

/**
 * Intercepts Cmd/Ctrl+Click on links in the BlockNote editor and opens
 * them in the system default browser via `tauri-plugin-opener`.
 *
 * Plain clicks propagate normally so the editor can position the cursor
 * within link text and show the link toolbar. This matches the behavior
 * of VS Code, Notion, and other desktop editors.
 *
 * Uses a capture-phase event listener so it fires before TipTap's own
 * click handler.
 *
 * @param editor - The BlockNote editor instance whose DOM will be instrumented.
 */
export function useLinkClickHandler(editor: BlockNoteEditor): void {
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tiptap = (editor as any)._tiptapEditor
    if (!tiptap) return

    const editorDom = tiptap.view.dom as HTMLElement

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const anchor = target.closest('a[href]')
      if (!anchor) return

      // Always intercept clicks on links to prevent TipTap's Link
      // extension (openOnClick: true) from calling window.open().
      // Cursor positioning already happened during mousedown, so
      // stopPropagation here only suppresses the unwanted open.
      event.preventDefault()
      event.stopPropagation()

      // Only open URL on Cmd+Click (macOS) / Ctrl+Click (Windows/Linux)
      if (event.metaKey || event.ctrlKey) {
        const href = anchor.getAttribute('href')
        if (href) {
          openUrl(href).catch(() => {
            console.error('Failed to open URL:', href)
          })
        }
      }
    }

    // Toggle `.link-modifier-held` class to switch cursor to pointer
    // when Cmd (macOS) / Ctrl (Windows/Linux) is held over links.
    const modifierClass = 'link-modifier-held'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) {
        editorDom.classList.add(modifierClass)
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) {
        editorDom.classList.remove(modifierClass)
      }
    }

    const handleBlur = () => {
      editorDom.classList.remove(modifierClass)
    }

    editorDom.addEventListener('click', handleClick, true)
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)

    return () => {
      editorDom.removeEventListener('click', handleClick, true)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
      editorDom.classList.remove(modifierClass)
    }
  }, [editor])
}
