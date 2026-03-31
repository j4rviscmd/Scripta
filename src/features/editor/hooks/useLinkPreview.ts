import type { BlockNoteEditor } from '@blocknote/core'
import { useCallback, useRef } from 'react'
import {
  checkUrlContentType,
  isImageContentType,
} from '../api/imageUrlDetection'
import { fetchLinkTitle } from '../api/linkPreview'
import { ImageDetectionCache, isImageUrlQuick } from '../lib/imageUrlDetection'
import { parseMarkdownWithColumns } from '../lib/multiColumnMarkdown'

/** Matches a standalone HTTP or HTTPS URL at the start of a string. */
const URL_REGEX = /^https?:\/\/\S+/i

/**
 * Extracts the display name from a URL's last path segment, stripping the extension.
 *
 * Falls back to `"image"` when the URL cannot be parsed or the path is empty.
 *
 * @param url - The absolute URL to extract the name from.
 * @returns The filename without its extension, or `"image"` as a fallback.
 *
 * @example
 * ```ts
 * urlToImageName('https://example.com/photos/cat.png') // 'cat'
 * urlToImageName('https://example.com/')               // 'image'
 * ```
 */
function urlToImageName(url: string): string {
  try {
    const filename = new URL(url).pathname.split('/').pop() ?? ''
    if (!filename) return 'image'
    const dotIndex = filename.lastIndexOf('.')
    return dotIndex > 0 ? filename.substring(0, dotIndex) : filename
  } catch {
    return 'image'
  }
}

/** Session-scoped LRU cache for asynchronous image-URL detection results. */
const imageDetectionCache = new ImageDetectionCache()

/**
 * Replaces the text content of a link in the BlockNote editor.
 *
 * Scans the ProseMirror document for a text node whose text equals `url`
 * and is decorated with a `link` mark pointing to the same `url`.  When
 * found, the text is replaced with `title` while preserving the link mark.
 *
 * @param editor - The BlockNote editor instance whose ProseMirror document to scan.
 * @param url - The URL to search for (both as link text and `href` attribute).
 * @param title - The replacement text to write into the link node.
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
 * Recursively walks `blocks` and returns the first block for which
 * `predicate` returns `true`.
 *
 * @param blocks - The array of BlockNote blocks to search (may include nested children).
 * @param predicate - A function that tests each block. Short-circuits on the first match.
 * @returns The first matching block, or `undefined` when no block satisfies the predicate.
 */
function findBlockRecursive(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blocks: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  predicate: (block: any) => boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any | undefined {
  for (const block of blocks) {
    if (predicate(block)) return block
    if (block.children?.length) {
      const found = findBlockRecursive(block.children, predicate)
      if (found) return found
    }
  }
  return undefined
}

/**
 * Inserts an image block after `anchorBlock` and asynchronously updates
 * its name/caption with the fetched page title.
 *
 * @param editor - The BlockNote editor instance to operate on.
 * @param url - The image URL to embed.
 * @param anchorBlock - A reference block; the new image block is inserted immediately after it.
 */
function insertImageBlock(
  editor: BlockNoteEditor,
  url: string,
  anchorBlock: { id: string }
): void {
  const name = urlToImageName(url)
  editor.insertBlocks(
    [{ type: 'image', props: { url, name, caption: name } }],
    anchorBlock,
    'after'
  )
  tryUpdateImageNameWithTitle(editor, url)
}

/**
 * Tries to fetch the page title for an image URL and updates the block's
 * name/caption when a title is found.
 *
 * Priority: title -> filename (already set at insertion) -> "image".
 * Failures are silently ignored (best-effort).
 *
 * @param editor - The BlockNote editor instance whose document to search.
 * @param url - The image URL whose block should be updated.
 */
function tryUpdateImageNameWithTitle(
  editor: BlockNoteEditor,
  url: string
): void {
  fetchLinkTitle(url)
    .then((title) => {
      if (!title) return
      const block = findBlockRecursive(
        editor.document,
        (b) => b.props?.url === url && b.type === 'image'
      )
      if (!block) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      editor.updateBlock(block, {
        props: { name: title, caption: title },
      } as any)
    })
    .catch(() => {
      // Best-effort: keep the filename-based name already set.
    })
}

/**
 * Replaces the block containing a link inline element with an image block.
 *
 * Walks the BlockNote document to find the block that holds the link
 * inline element pointing to `url`, inserts an image block after it,
 * then removes the original block.
 *
 * @param editor - The BlockNote editor instance to operate on.
 * @param url - The URL of the link to replace with an image block.
 */
function replaceLinkWithImage(editor: BlockNoteEditor, url: string): void {
  const block = findBlockRecursive(editor.document, (b) => {
    const content = b.content
    if (!Array.isArray(content)) return false
    return content.some(
      (inline: { type: string; href: string }) =>
        inline.type === 'link' && inline.href === url
    )
  })
  if (!block) return

  insertImageBlock(editor, url, block)
  editor.removeBlocks([block])
}

/**
 * React hook that returns a BlockNote-compatible paste handler which
 * detects image URLs in clipboard content.
 *
 * Detection strategy (in order of precedence):
 * 1. **Fast path** -- file extension or known image-hosting domain check
 *    (synchronous, via {@link isImageUrlQuick}).
 * 2. **Cached async result** -- a session-level LRU cache of previously
 *    resolved Content-Type checks.
 * 3. **HEAD request** -- sends a HEAD request via the Rust backend
 *    ({@link checkUrlContentType}) and inspects the `Content-Type` header.
 *    Falls back to a minimal GET when the server rejects HEAD.
 *
 * When the URL is confirmed as an image an image block is inserted
 * immediately; otherwise a link is inserted and the page title is fetched
 * asynchronously (falling back to the raw URL text on failure).
 *
 * Deduplication is handled via a `Set` of URLs currently being processed
 * so that rapid re-pastes of the same URL do not produce duplicate blocks.
 *
 * @returns A paste handler callback for the BlockNote editor's `pasteHandler` option.
 */
export function useLinkPreview() {
  // Deduplication: track URLs already being processed.
  const pendingRef = useRef<Set<string>>(new Set())

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler = useCallback<any>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ event, editor, defaultPasteHandler }: any) => {
      const clipboardText = event.clipboardData?.getData('text/plain') ?? ''

      // Round-trip import: restore column layout from exported Markdown.
      if (clipboardText.includes('<div data-bn-cols>')) {
        event.preventDefault()
        const blocks = await parseMarkdownWithColumns(clipboardText, editor)
        if (blocks.length > 0) {
          editor.focus()
          const cursorBlock = editor.getTextCursorPosition().block
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          editor.insertBlocks(blocks as any, cursorBlock, 'after')
          return true
        }
      }

      const url = clipboardText.trim()

      if (!URL_REGEX.test(url)) {
        return defaultPasteHandler()
      }

      // Fast path: extension or known domain → insert image block immediately.
      if (isImageUrlQuick(url)) {
        editor.focus()
        insertImageBlock(editor, url, editor.getTextCursorPosition().block)
        return true
      }

      // Check async cache
      const cached = imageDetectionCache.get(url)
      if (cached === true) {
        editor.focus()
        insertImageBlock(editor, url, editor.getTextCursorPosition().block)
        return true
      }

      // Insert a link as placeholder, then check Content-Type asynchronously.
      editor.focus()
      editor.insertInlineContent([
        {
          type: 'link',
          href: url,
          content: [{ type: 'text', text: url }],
        },
      ])

      if (!pendingRef.current.has(url)) {
        pendingRef.current.add(url)

        // Try HEAD request to determine if the URL is an image.
        checkUrlContentType(url)
          .then((contentType) => {
            if (isImageContentType(contentType)) {
              imageDetectionCache.set(url, true)
              replaceLinkWithImage(editor, url)
              return
            }
            imageDetectionCache.set(url, false)

            // Not an image — fetch page title instead.
            return fetchLinkTitle(url).then((title) => {
              if (title) replaceLinkText(editor, url, title)
            })
          })
          .catch(() => {
            // Content-Type check failed — try title fetch as fallback.
            fetchLinkTitle(url)
              .then((title) => {
                if (title) replaceLinkText(editor, url, title)
              })
              .catch(() => {
                // Best-effort: leave the URL as link text on failure.
              })
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
