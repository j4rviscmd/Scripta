import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/app/providers/store-provider'
import { CENTERING_EVENT } from '@/shared/lib/events'

/**
 * Configuration options for {@link useScrollDirection}.
 */
interface ScrollDirectionOptions {
  /** Minimum accumulated scroll delta (px) before toggling header visibility. Defaults to `10`. */
  threshold?: number
}

/**
 * Tracks scroll direction via `wheel` events and reports whether
 * the header should be hidden (scrolling down) or shown (scrolling up).
 *
 * Uses the `wheel` event instead of `scroll` to avoid false positives
 * from programmatic scrolling (e.g. ProseMirror `scrollIntoView`).
 *
 * Also listens for the {@link CENTERING_EVENT} custom event to hide the
 * header when the cursor-centering ProseMirror plugin triggers a
 * centering scroll, and forces the header visible when the container
 * is scrolled back to the very top.
 *
 * @param containerRef - Ref to the scrollable container element.
 * @param options - Configuration options. See {@link ScrollDirectionOptions}.
 * @returns An object containing:
 *   - `isHidden` - `true` when the header should be hidden, `false` otherwise.
 *   - `resetHeader` - Imperative function to force the header visible and clear internal state.
 */
export function useScrollDirection(
  containerRef: React.RefObject<HTMLElement | null>,
  options: ScrollDirectionOptions = {}
) {
  const { threshold = 10 } = options
  const { editorState: editorStore } = useAppStore()
  const [isHidden, setIsHidden] = useState(false)

  // Load persisted header hidden state from the store on first mount.
  useEffect(() => {
    editorStore
      .get<boolean>('headerHidden')
      .then((val) => {
        if (val !== undefined) setIsHidden(val)
      })
      .catch((err) => {
        console.error('Failed to load headerHidden:', err)
      })
  }, [editorStore])

  /** Updates the hidden state and persists it to the store. */
  const setHidden = useCallback(
    (value: boolean) => {
      setIsHidden(value)
      if (value) {
        suppressScrollShow.current = true
        clearTimeout(suppressTimer.current)
        suppressTimer.current = setTimeout(() => {
          suppressScrollShow.current = false
        }, 300)
      }
      editorStore.set('headerHidden', value).catch((err) => {
        console.error('Failed to persist headerHidden:', err)
      })
    },
    [editorStore]
  )
  /** Accumulated vertical wheel delta (px) since the last animation-frame flush. */
  const accumulatedDelta = useRef(0)
  /** Whether an `requestAnimationFrame` callback is already scheduled. */
  const ticking = useRef(false)
  /** When `true`, wheel events are ignored to prevent toggles triggered by click-induced scrolls. */
  const clickLock = useRef(false)
  /** Timer handle for releasing {@link clickLock} after a 200 ms cooldown. */
  const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )
  /** ID of the pending `requestAnimationFrame` callback, used for cleanup on unmount. */
  const rafId = useRef<number>(0)

  // Suppresses the scroll-to-top auto-show for a short period after hiding
  // the header, preventing the feedback loop where header collapse → container
  // resize → scrollTop clamp to 0 → header re-shown → repeat.
  const suppressScrollShow = useRef(false)
  const suppressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    /** Locks wheel-based scroll detection for 200 ms after a mouse click to prevent accidental toggles. */
    const handleMouseDown = () => {
      clickLock.current = true
      clickTimer.current = setTimeout(() => {
        clickLock.current = false
      }, 200)
    }

    /**
     * Accumulates vertical wheel delta and, once it exceeds the threshold within a
     * single animation frame, toggles header visibility. Skips processing when the
     * container is already at the top or bottom edge, when a click lock is active,
     * or when the delta is purely horizontal.
     */
    const handleWheel = (e: WheelEvent) => {
      if (clickLock.current) return
      if (e.deltaY === 0) return
      if (
        (container.scrollTop <= 0 && e.deltaY < 0) ||
        (container.scrollTop + container.clientHeight >=
          container.scrollHeight - 1 &&
          e.deltaY > 0)
      ) {
        return
      }

      accumulatedDelta.current += e.deltaY

      if (ticking.current) return
      ticking.current = true

      rafId.current = requestAnimationFrame(() => {
        if (Math.abs(accumulatedDelta.current) >= threshold) {
          setHidden(accumulatedDelta.current > 0)
          accumulatedDelta.current = 0
        }

        ticking.current = false
      })
    }

    /** Forces the header to become visible when the container is scrolled back to the very top. */
    const handleScroll = () => {
      if (suppressScrollShow.current) return
      if (container.scrollTop <= 0) {
        setHidden(false)
        accumulatedDelta.current = 0
      }
    }

    /** Hides the header when the cursor-centering plugin triggers a centering scroll. */
    const handleCentering = () => {
      if (container.scrollTop > 0) {
        setHidden(true)
      }
    }

    container.addEventListener('mousedown', handleMouseDown, { passive: true })
    container.addEventListener('wheel', handleWheel, { passive: true })
    container.addEventListener('scroll', handleScroll, { passive: true })
    document.addEventListener(CENTERING_EVENT, handleCentering)
    return () => {
      container.removeEventListener('mousedown', handleMouseDown)
      container.removeEventListener('wheel', handleWheel)
      container.removeEventListener('scroll', handleScroll)
      document.removeEventListener(CENTERING_EVENT, handleCentering)
      cancelAnimationFrame(rafId.current)
      clearTimeout(clickTimer.current)
      clearTimeout(suppressTimer.current)
    }
  }, [containerRef, threshold, setHidden])

  /**
   * Forces the header to become visible and clears all internal
   * accumulated state (wheel delta, suppress timer, etc.).
   *
   * Call this when the scroll context changes fundamentally (e.g.
   * switching to a different note) so the header is not left in a
   * stale hidden state.
   */
  const resetHeader = useCallback(() => {
    suppressScrollShow.current = false
    accumulatedDelta.current = 0
    clearTimeout(suppressTimer.current)
    setHidden(false)
  }, [setHidden])

  return { isHidden, resetHeader }
}
