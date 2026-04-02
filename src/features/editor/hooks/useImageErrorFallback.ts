import { type RefObject, useEffect } from 'react'

/**
 * Inline SVG for the "image not found" placeholder (matches lucide `ImageOff` style).
 * Rendered as a `data:` URI so no network request is needed.
 */
const IMAGE_OFF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="2" x2="22" y2="22"/><path d="M10.41 10.41a2 2 0 1 1-2.83-2.83"/><line x1="13.5" y1="6.5" x2="13.5" y2="6.5"/><path d="M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4z"/></svg>`

/**
 * Creates a "Image not found" placeholder element that visually replaces
 * a broken `<img>` element.
 *
 * The placeholder consists of an inline SVG icon (matching lucide `ImageOff`)
 * and a text label, wrapped in a `<div>` styled with the
 * `.image-error-placeholder` CSS class defined in `src/index.css`.
 *
 * @returns The fully constructed placeholder `<div>` element, ready to be
 *   inserted into the DOM.
 */
function createPlaceholder(): HTMLDivElement {
  const wrap = document.createElement('div')
  wrap.className = 'image-error-placeholder'

  const icon = document.createElement('div')
  icon.innerHTML = IMAGE_OFF_SVG
  icon.style.cssText =
    'display:flex;align-items:center;justify-content:center;opacity:0.5'

  const label = document.createElement('span')
  label.textContent = 'Image not found'

  wrap.appendChild(icon)
  wrap.appendChild(label)
  return wrap
}

/**
 * Handles a broken `<img>` element by hiding it and inserting a placeholder.
 *
 * Guards against duplicate handling via the `data-error-handled` attribute so
 * that repeated `error` events on the same element do not produce multiple
 * placeholders.
 *
 * @param img - The `<img>` element that failed to load.
 */
function handleImgError(img: HTMLImageElement): void {
  if (img.dataset.errorHandled === 'true') return
  img.dataset.errorHandled = 'true'
  img.style.display = 'none'
  img.parentNode?.insertBefore(createPlaceholder(), img.nextSibling)
}

/**
 * Attaches a capture-phase `error` event listener to the document and
 * replaces broken `<img>` elements inside `containerRef` with a
 * "Image not found" placeholder.
 *
 * Covers both `asset://` URLs whose local file was deleted and remote
 * `https://` images that return 4xx / 5xx responses.
 *
 * @param containerRef - Ref to the editor's root `<div>`. The listener is
 *   scoped to this element so images outside the editor are not affected.
 */
export function useImageErrorFallback(
  containerRef: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const onError = (event: Event) => {
      const target = event.target
      if (!(target instanceof HTMLImageElement)) return
      if (!container.contains(target)) return
      handleImgError(target)
    }

    // Capture phase ensures we intercept the event before it reaches the img.
    document.addEventListener('error', onError, true)
    return () => {
      document.removeEventListener('error', onError, true)
    }
  }, [containerRef])
}
