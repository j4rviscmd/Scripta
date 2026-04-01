import type { LinkToolbarProps } from '@blocknote/react'
import { useBlockNoteEditor, useComponentsContext } from '@blocknote/react'
import { ImageIcon, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  checkUrlContentType,
  isImageContentType,
} from '../api/imageUrlDetection'
import { findBlockRecursive, urlToImageName } from '../lib/imageBlockUtils'
import { imageDetectionCache, isImageUrlQuick } from '../lib/imageUrlDetection'

/**
 * Props for the {@link ConvertToImageButton} component.
 *
 * @property url - The `href` of the inline link to convert into an image block.
 * @property range - The ProseMirror selection range occupied by the link inline element.
 * @property setToolbarOpen - Callback to close the parent link toolbar after conversion.
 */
interface ConvertToImageButtonProps {
  url: string
  range: NonNullable<LinkToolbarProps['range']>
  setToolbarOpen: (open: boolean) => void
}

/**
 * Discriminated union representing the current image-detection status of a URL.
 *
 * Used by {@link ConvertToImageButton} to drive the button's visibility,
 * enabled state, and loading indicator.
 *
 * | Status        | Meaning                                         |
 * | ------------- | ----------------------------------------------- |
 * | `idle`        | URL scheme is not HTTP(S) -- button is hidden   |
 * | `confirmed`   | URL resolves to an image -- button is clickable |
 * | `checking`    | Async Content-Type check in progress -- spinner |
 * | `not_image`   | URL confirmed as non-image -- button disabled   |
 */
type DetectionState =
  /** URL is not HTTP(S) — button hidden. */
  | { status: 'idle' }
  /** Confirmed image — button clickable. */
  | { status: 'confirmed' }
  /** Async check in progress — spinner + disabled. */
  | { status: 'checking' }
  /** Confirmed non-image — button disabled. */
  | { status: 'not_image' }

/**
 * Derives the initial {@link DetectionState} from synchronous signals.
 *
 * Checks, in order:
 * 1. Whether the URL scheme is HTTP(S) -- non-HTTP(S) URLs (e.g. `asset://`)
 *    immediately resolve to `{ status: 'idle' }`.
 * 2. The fast synchronous check via {@link isImageUrlQuick} (extension + domain).
 * 3. The session-level LRU cache ({@link imageDetectionCache}).
 *
 * If none of the above produce a definitive answer the state falls back to
 * `{ status: 'checking' }`, signalling that an async HEAD request is needed.
 *
 * @param url - The URL to evaluate.
 * @returns The initial detection state for the URL.
 */
function computeInitialState(url: string): DetectionState {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { status: 'idle' }
  }
  if (isImageUrlQuick(url)) return { status: 'confirmed' }
  const cached = imageDetectionCache.get(url)
  if (cached === true) return { status: 'confirmed' }
  if (cached === false) return { status: 'not_image' }
  return { status: 'checking' }
}

/**
 * Link toolbar button that converts an inline link into an image block.
 *
 * Uses three-layer image detection:
 * 1. Fast sync check (extension / known domain)
 * 2. Session LRU cache
 * 3. Async HEAD request via the Rust backend
 *
 * Shows a spinner while checking, disables the button for non-image URLs,
 * and hides it for non-HTTP(S) URLs (e.g. `asset://`).
 */
export function ConvertToImageButton({
  url,
  range,
  setToolbarOpen,
}: ConvertToImageButtonProps) {
  const Components = useComponentsContext()
  const editor = useBlockNoteEditor()

  const [detection, setDetection] = useState<DetectionState>(() =>
    computeInitialState(url)
  )

  // Reset detection state when url changes while the component stays mounted
  useEffect(() => {
    setDetection(computeInitialState(url))
  }, [url])

  useEffect(() => {
    if (detection.status !== 'checking') return
    let cancelled = false
    checkUrlContentType(url)
      .then((contentType) => {
        if (cancelled) return
        const isImage = isImageContentType(contentType)
        imageDetectionCache.set(url, isImage)
        setDetection(
          isImage ? { status: 'confirmed' } : { status: 'not_image' }
        )
      })
      .catch(() => {
        if (cancelled) return
        // Network error — don't cache so a retry is possible later
        setDetection({ status: 'not_image' })
      })
    return () => {
      cancelled = true
    }
  }, [url, detection.status])

  const handleClick = useCallback(() => {
    setToolbarOpen(false)
    if (!editor) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tiptap = (editor as any)._tiptapEditor
    if (!tiptap) return

    const { state, view } = tiptap
    const $pos = state.doc.resolve(range.from)
    const blockPos = $pos.before($pos.depth)
    const blockNode = state.doc.nodeAt(blockPos)
    if (!blockNode) return

    const blockEnd = blockPos + blockNode.nodeSize
    // +1 / -1 account for the opening/closing tags of the block node
    const isOnlyContent =
      range.from === blockPos + 1 && range.to === blockEnd - 1

    const name = urlToImageName(url)

    // Find the corresponding BlockNote block by URL
    const bnBlock = findBlockRecursive(editor.document, (b) => {
      const content = b.content
      if (!Array.isArray(content)) return false
      return content.some(
        (inline: { type: string; href: string }) =>
          inline.type === 'link' && inline.href === url
      )
    })

    if (bnBlock) {
      // Insert the image block after the paragraph that holds the link.
      // Positions inside the current block are unaffected by an "after" insert.
      editor.insertBlocks(
        [{ type: 'image', props: { url, name, caption: name } }],
        bnBlock,
        'after'
      )

      if (isOnlyContent) {
        // The link was the entire paragraph — remove the now-empty block.
        editor.removeBlocks([bnBlock])
      } else {
        // Link was part of larger content — just delete the link text.
        const tr = state.tr.delete(range.from, range.to)
        view.dispatch(tr)
      }
    }
  }, [editor, url, range, setToolbarOpen])

  if (!Components) return null

  // Non-HTTP(S) URLs (e.g. asset://) — hide entirely
  if (detection.status === 'idle') return null

  // Checking — show spinner, disabled
  if (detection.status === 'checking') {
    return (
      <Components.LinkToolbar.Button
        mainTooltip="Checking if image..."
        label="Checking..."
        icon={<Loader2 size={16} className="animate-spin" />}
        onClick={() => {}}
      />
    )
  }

  // Not an image — show disabled button with not-allowed cursor
  if (detection.status === 'not_image') {
    return (
      <Components.LinkToolbar.Button
        className="bn-button cursor-not-allowed opacity-50"
        mainTooltip="URL is not an image"
        label="Convert to image"
        icon={<ImageIcon size={16} />}
        onClick={() => {}}
      />
    )
  }

  // Confirmed image — clickable
  return (
    <Components.LinkToolbar.Button
      mainTooltip="Convert to image"
      label="Convert to image"
      icon={<ImageIcon size={16} />}
      onClick={handleClick}
    />
  )
}
