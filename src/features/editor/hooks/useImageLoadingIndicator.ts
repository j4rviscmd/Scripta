import { type RefObject, useEffect } from 'react'

const VISUAL_MEDIA_WRAPPER = 'bn-visual-media-wrapper'
const LOADING_ATTR = 'data-img-loading'
const HANDLED_KEY = 'loadingHandled'

/**
 * Returns the closest `.bn-visual-media-wrapper` ancestor of `img`, or `null`
 * if the image is not inside a BlockNote visual-media block.
 */
function getVisualMediaWrapper(img: HTMLImageElement): HTMLElement | null {
  return img.closest<HTMLElement>(`.${VISUAL_MEDIA_WRAPPER}`)
}

/**
 * Sets `data-img-loading="true"` on the `.bn-visual-media-wrapper` parent
 * of `img` and registers one-shot `load`/`error` listeners that remove it.
 *
 * Guards:
 * - `img.dataset.loadingHandled === 'true'` → already processed, skip
 * - `img.complete`                           → already loaded/errored, skip
 */
function attachSkeleton(img: HTMLImageElement): void {
  if (img.dataset[HANDLED_KEY] === 'true') return
  img.dataset[HANDLED_KEY] = 'true'

  // complete is true when src is empty, load succeeded, or load failed.
  // In the failed case, useImageErrorFallback handles the UI.
  if (img.complete) return

  const wrapper = getVisualMediaWrapper(img)
  if (!wrapper) return

  wrapper.setAttribute(LOADING_ATTR, 'true')

  const removeSkeleton = (): void => {
    wrapper.removeAttribute(LOADING_ATTR)
  }

  img.addEventListener('load', removeSkeleton, { once: true })
  img.addEventListener('error', removeSkeleton, { once: true })
}

/**
 * Shows an animate-pulse skeleton behind every `<img>` inside `containerRef`
 * while it is loading, then removes it on `load` or `error`.
 *
 * Uses a hybrid approach:
 * - **Initial scan**: `querySelectorAll('img')` on mount covers images already
 *   in the DOM (BlockNote renders the initial note synchronously before `useEffect`).
 * - **MutationObserver**: catches `<img>` nodes inserted later (new image blocks
 *   added by the user, or BlockNote re-renders on note switch).
 *
 * Co-exists with `useImageErrorFallback`: on error, the capture-phase listener
 * in that hook fires first (hiding the `<img>` and inserting the placeholder),
 * then `removeSkeleton` fires (clearing `data-img-loading`). No conflicts.
 *
 * @param containerRef - Ref to the editor's root wrapper `<div>`.
 */
export function useImageLoadingIndicator(
  containerRef: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Initial scan: images already in the DOM when the hook mounts.
    container.querySelectorAll<HTMLImageElement>('img').forEach(attachSkeleton)

    // MutationObserver: images inserted after mount (user adds image block, note switch).
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLImageElement) {
            attachSkeleton(node)
          } else if (node instanceof HTMLElement) {
            node
              .querySelectorAll<HTMLImageElement>('img')
              .forEach(attachSkeleton)
          }
        }
      }
    })

    observer.observe(container, { subtree: true, childList: true })

    return () => {
      observer.disconnect()
    }
  }, [containerRef])
}
