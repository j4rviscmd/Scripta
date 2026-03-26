import type { BlockNoteEditor } from '@blocknote/core'
import { useCallback, useRef } from 'react'
import { fetchLinkTitle } from '../api/linkPreview'

/** Pattern that matches HTTP and HTTPS URLs in plain text. */
const URL_REGEX = /^https?:\/\/\S+/i

/**
 * Replaces the text content of a link in the BlockNote editor.
 *
 * Scans the ProseMirror document for a text node whose text equals `url`
 * and is decorated with a `link` mark pointing to the same `url`.  When
 * found, the text is replaced with `title` while preserving the link mark.
 */
function replaceLinkText(
  editor: BlockNoteEditor,
  url: string,
  title: string
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tiptap = (editor as any)._tiptapEditor
  if (!tiptap) return

  const { state, view } = tiptap
  let found = false

  state.doc.descendants(
    (node: import('@tiptap/pm/model').Node, pos: number) => {
      if (found) return false
      if (!node.isText) return

      const linkMark = node.marks.find(
        (m: import('@tiptap/pm/model').Mark) =>
          m.type.name === 'link' && m.attrs.href === url
      )
      if (linkMark && node.text === url) {
        const mark = state.schema.marks.link.create({
          href: url,
          target: '_blank',
        })
        const textNode = state.schema.text(title, [mark])
        view.dispatch(state.tr.replaceWith(pos, pos + node.nodeSize, textNode))
        found = true
        return false
      }
    }
  )
}

/**
 * Returns a BlockNote `pasteHandler` that detects URL pastes and
 * asynchronously replaces the link text with the fetched page title.
 */
export function useLinkPreview() {
  // Deduplication: track URLs already being fetched.
  const pendingRef = useRef<Set<string>>(new Set())

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler = useCallback<any>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ({ event, editor, defaultPasteHandler }: any) => {
      const clipboardText = event.clipboardData?.getData('text/plain') ?? ''
      const url = clipboardText.trim()

      if (!URL_REGEX.test(url)) {
        return defaultPasteHandler()
      }

      // Insert a link with the URL as initial text.
      editor.focus()
      editor.insertInlineContent([
        {
          type: 'link',
          href: url,
          content: [{ type: 'text', text: url }],
        },
      ])

      // Deduplicate concurrent requests for the same URL.
      if (!pendingRef.current.has(url)) {
        pendingRef.current.add(url)
        fetchLinkTitle(url)
          .then((title) => {
            if (title) replaceLinkText(editor, url, title)
          })
          .catch(() => {
            // Best-effort: leave the URL as link text on failure.
          })
          .finally(() => {
            pendingRef.current.delete(url)
          })
      }

      return true
    },
    []
  )

  return handler
}
