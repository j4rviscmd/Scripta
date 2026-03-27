import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/app/providers/store-provider'
import { CENTERING_EVENT } from '@/shared/lib/events'

/**
 * Configuration options for {@link useScrollDirection}.
 */
type HeaderHiddenMap = Record<string, boolean>

interface ScrollDirectionOptions {
  /** Minimum accumulated scroll delta (px) before toggling header visibility. Defaults to `10`. */
  threshold?: number
  /** The currently active note ID, or `null` when no note is selected. */
  noteId?: string | null
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
 */
export function useScrollDirection(
  containerRef: React.RefObject<HTMLElement | null>,
  options: ScrollDirectionOptions = {}
) {
  const { threshold = 10, noteId = null } = options
  const { editorState: editorStore } = useAppStore()
  const [isHidden, setIsHidden] = useState(false)
  const noteIdRef = useRef(noteId)
  const mapRef = useRef<HeaderHiddenMap>({})
  const mapLoadedRef = useRef(false)

  useEffect(() => {
    noteIdRef.current = noteId
  }, [noteId])

  // Load persisted header hidden map from the store on first mount.
  // Also migrates the legacy `headerHidden` boolean key.
  useEffect(() => {
    editorStore
      .get<HeaderHiddenMap>('headerHiddenMap')
      .then((map) => {
        if (map) mapRef.current = map
        return editorStore.get<boolean>('headerHidden')
      })
      .then((legacy) => {
        // One-time migration: promote legacy boolean to the current note.
        if (legacy != null) {
          if (noteIdRef.current) {
            mapRef.current[noteIdRef.current] = legacy
          }
          editorStore.delete('headerHidden').catch(() => {})
        }
        mapLoadedRef.current = true
        if (noteIdRef.current) {
          const saved = mapRef.current[noteIdRef.current]
          if (saved !== undefined) setIsHidden(saved)
        }
      })
      .catch((err) => {
        console.error('Failed to load headerHiddenMap:', err)
        mapLoadedRef.current = true
      })
  }, [editorStore])

  /** Persists the in-memory map to the store (fire-and-forget). */
  const persistMap = useCallback(() => {
    editorStore.set('headerHiddenMap', { ...mapRef.current }).catch((err) => {
      console.error('Failed to persist headerHiddenMap:', err)
    })
  }, [editorStore])

  /** Updates the hidden state and persists it per-note to the store. */
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
      const currentNoteId = noteIdRef.current
      if (currentNoteId) {
        mapRef.current[currentNoteId] = value
        persistMap()
      }
    },
    [persistMap]
  )

  // --- Refs for wheel-event throttling and edge guards ---
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

  // --- Refs for the suppress-scroll-show guard ---
  // Suppresses the scroll-to-top auto-show for a short period after hiding
  // the header, preventing the feedback loop where header collapse -> container
  // resize -> scrollTop clamp to 0 -> header re-shown -> repeat.
  const suppressScrollShow = useRef(false)
  const suppressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )

  // Restore header state when noteId changes.
  // If the store hasn't loaded yet, defer restoration to the load effect.
  useEffect(() => {
    if (!noteId) {
      setIsHidden(false)
      return
    }
    if (!mapLoadedRef.current) return
    const saved = mapRef.current[noteId]
    suppressScrollShow.current = false
    accumulatedDelta.current = 0
    clearTimeout(suppressTimer.current)
    setIsHidden(saved ?? false)
  }, [noteId])

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

  return { isHidden }
}
