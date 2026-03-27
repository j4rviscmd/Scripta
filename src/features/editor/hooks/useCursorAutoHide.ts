import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/app/providers/store-provider'
import {
  CURSOR_ALWAYS_VISIBLE_SELECTORS,
  CURSOR_AUTO_HIDE_MAX_DELAY,
  CURSOR_AUTO_HIDE_MIN_DELAY,
  CURSOR_AUTO_HIDE_STORE_KEYS,
  CURSOR_HIDDEN_CLASS,
  cursorAutoHideConfig,
  DEFAULT_CURSOR_AUTO_HIDE,
} from '../lib/cursorAutoHideConfig'

/**
 * Manages cursor auto-hide settings with immediate persistence.
 *
 * On mount, loads persisted values from `configStore` and syncs them to
 * the mutable {@link cursorAutoHideConfig}. Subsequent changes persist
 * immediately and update the config object in the same tick so that the
 * runtime effect hook (see {@link useCursorAutoHideEffect}) picks them up
 * without needing a re-render.
 *
 * @returns An object containing the current settings and their setters:
 *   - `enabled` - Whether cursor auto-hide is active.
 *   - `delay` - Inactivity delay in seconds before the cursor hides.
 *   - `setEnabled` - Toggles the feature and persists the change.
 *   - `setDelay` - Updates the delay (clamped to [1, 30]) and persists.
 */
export function useCursorAutoHide() {
  const { config: configStore } = useAppStore()
  const [enabled, setEnabledState] = useState(DEFAULT_CURSOR_AUTO_HIDE.enabled)
  const [delay, setDelayState] = useState(DEFAULT_CURSOR_AUTO_HIDE.delay)

  // ─── Persistence ────────────────────────────────────────────────────────

  // Load persisted values on mount.
  useEffect(() => {
    Promise.all([
      configStore.get<boolean>(CURSOR_AUTO_HIDE_STORE_KEYS.enabled),
      configStore.get<number>(CURSOR_AUTO_HIDE_STORE_KEYS.delay),
    ])
      .then(([storedEnabled, storedDelay]) => {
        const resolvedEnabled =
          storedEnabled ?? DEFAULT_CURSOR_AUTO_HIDE.enabled
        const resolvedDelay = storedDelay ?? DEFAULT_CURSOR_AUTO_HIDE.delay
        setEnabledState(resolvedEnabled)
        setDelayState(resolvedDelay)
        cursorAutoHideConfig.enabled = resolvedEnabled
        cursorAutoHideConfig.delay = resolvedDelay
      })
      .catch((err) => {
        console.error('Failed to load cursor auto-hide settings:', err)
      })
  }, [configStore])

  const setEnabled = useCallback(
    (value: boolean) => {
      setEnabledState(value)
      cursorAutoHideConfig.enabled = value
      configStore
        .set(CURSOR_AUTO_HIDE_STORE_KEYS.enabled, value)
        .catch((err) => {
          console.error('Failed to persist cursorAutoHideEnabled:', err)
        })
    },
    [configStore]
  )

  const setDelay = useCallback(
    (value: number) => {
      const clamped = Math.max(
        CURSOR_AUTO_HIDE_MIN_DELAY,
        Math.min(CURSOR_AUTO_HIDE_MAX_DELAY, Math.round(value))
      )
      setDelayState(clamped)
      cursorAutoHideConfig.delay = clamped
      configStore
        .set(CURSOR_AUTO_HIDE_STORE_KEYS.delay, clamped)
        .catch((err) => {
          console.error('Failed to persist cursorAutoHideDelay:', err)
        })
    },
    [configStore]
  )

  return { enabled, delay, setEnabled, setDelay }
}

/**
 * Registers global mouse event listeners that hide the cursor after a
 * period of inactivity.
 *
 * This hook should be called **once** at the application root (e.g.
 * `App.tsx`) so that the listeners remain active for the full lifetime of
 * the app.  It reads {@link cursorAutoHideConfig} directly on every event
 * so that changes made by {@link useCursorAutoHide} (the settings hook)
 * take effect immediately without any re-render.
 *
 * The cursor is hidden by adding {@link CURSOR_HIDDEN_CLASS} to the
 * `<html>` element and reappears on the next mouse movement.  When the
 * pointer enters an element matching one of
 * {@link CURSOR_ALWAYS_VISIBLE_SELECTORS} the pending timer is cancelled
 * and the cursor is shown immediately.
 */
export function useCursorAutoHideEffect() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hiddenRef = useRef(false)

  /** Removes the hidden class. */
  const showCursor = useCallback(() => {
    if (!hiddenRef.current) return
    document.documentElement.classList.remove(CURSOR_HIDDEN_CLASS)
    hiddenRef.current = false
  }, [])

  /** Adds the hidden class (called when the idle timer fires). */
  const hideCursor = useCallback(() => {
    document.documentElement.classList.add(CURSOR_HIDDEN_CLASS)
    hiddenRef.current = true
  }, [])

  /** Returns true if `target` is inside an always-visible overlay. */
  const isOverAlwaysVisible = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) return false
    return CURSOR_ALWAYS_VISIBLE_SELECTORS.some((sel) => target.closest(sel))
  }, [])

  /** Resets the idle timer; called on every `mousemove`. */
  const resetTimer = useCallback(
    (e: MouseEvent) => {
      if (!cursorAutoHideConfig.enabled) {
        // Feature was just disabled — ensure cursor is visible.
        showCursor()
        return
      }

      showCursor()

      if (isOverAlwaysVisible(e.target)) return

      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(
        hideCursor,
        cursorAutoHideConfig.delay * 1000
      )
    },
    [showCursor, hideCursor, isOverAlwaysVisible]
  )

  /** Cancels the timer while the pointer is inside an always-visible element. */
  const handleMouseOver = useCallback(
    (e: MouseEvent) => {
      if (!cursorAutoHideConfig.enabled) return
      if (!isOverAlwaysVisible(e.target)) return
      showCursor()
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    },
    [showCursor, isOverAlwaysVisible]
  )

  useEffect(() => {
    document.addEventListener('mousemove', resetTimer)
    document.addEventListener('mouseover', handleMouseOver)

    return () => {
      document.removeEventListener('mousemove', resetTimer)
      document.removeEventListener('mouseover', handleMouseOver)
      showCursor()
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [resetTimer, handleMouseOver, showCursor])
}
