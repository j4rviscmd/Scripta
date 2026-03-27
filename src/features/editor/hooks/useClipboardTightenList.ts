import type { BlockNoteEditor } from '@blocknote/core'
import { useEffect } from 'react'

/** Matches a line that begins with a Markdown list marker (possibly indented). */
const LIST_LINE_RE = /^\s*(?:[*-]|\d+\.)\s/

/**
 * Clipboard-safe list tightener.
 *
 * Unlike the export-only {@link tightenList} which is applied to pre-grouped
 * list blocks, this function operates on arbitrary Markdown and only removes
 * blank lines where **both** the preceding and following lines are list items.
 * This preserves intentional blank lines between paragraphs and lists.
 *
 * @param md - Raw Markdown string (typically from `text/plain` clipboard data).
 * @returns The Markdown string with blank lines between consecutive list items removed.
 */
function tightenListForClipboard(md: string): string {
  const lines = md.split('\n')
  const result: string[] = []

  for (let i = 0; i < lines.length; i++) {
    // Detect a blank line sitting between two list-item lines
    if (
      lines[i].trim() === '' &&
      i > 0 &&
      i < lines.length - 1 &&
      LIST_LINE_RE.test(lines[i - 1]) &&
      LIST_LINE_RE.test(lines[i + 1])
    ) {
      continue // skip the blank line
    }
    result.push(lines[i])
  }

  return result.join('\n')
}

/**
 * Post-processes the clipboard `text/plain` data produced by BlockNote's
 * copy handler so that Markdown lists use tight formatting (no blank lines
 * between sibling items).
 *
 * BlockNote writes Markdown to `text/plain` via `remark-stringify`, which
 * defaults to loose lists. This hook rewrites the clipboard data after
 * BlockNote's handler has run, using a conservative algorithm that only
 * removes blank lines between consecutive list items.
 *
 * @param editor - The BlockNote editor instance whose DOM will be patched
 *   with clipboard event listeners.
 */
export function useClipboardTightenList(editor: BlockNoteEditor): void {
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tiptap = (editor as any)._tiptapEditor
    if (!tiptap) return

    const editorDom = tiptap.view.dom as HTMLElement

    /**
     * Reads the `text/plain` markdown that BlockNote already wrote to the
     * clipboard, applies tight-list formatting, and writes it back.
     */
    const handleCopy = (event: Event): void => {
      const clipboardEvent = event as ClipboardEvent
      const data = clipboardEvent.clipboardData
      if (!data) return

      const plain = data.getData('text/plain')
      if (!plain) return

      const tightened = tightenListForClipboard(plain)
      if (tightened !== plain) {
        data.setData('text/plain', tightened)
      }
    }

    editorDom.addEventListener('copy', handleCopy)
    editorDom.addEventListener('cut', handleCopy)

    return () => {
      editorDom.removeEventListener('copy', handleCopy)
      editorDom.removeEventListener('cut', handleCopy)
    }
  }, [editor])
}
