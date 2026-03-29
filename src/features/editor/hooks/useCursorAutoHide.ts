/**
 * Hooks for the cursor auto-hide feature.
 *
 * The feature is split into two cooperating hooks:
 *
 * - {@link useCursorAutoHide} — Settings hook that manages the `enabled`
 *   and `delay` state, persists them to `configStore`, and syncs the
 *   mutable {@link cursorAutoHideConfig} object.
 * - {@link useCursorAutoHideEffect} — Runtime hook that registers global
 *   mouse event listeners and actually hides / shows the cursor.
 *
 * Both hooks communicate through the shared
 * {@link cursorAutoHideConfig} object so the effect hook can read the
 * latest settings on every event without requiring a React re-render.
 *
 * @module features/editor/hooks/useCursorAutoHide
 */

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

  /**
   * Toggles the cursor auto-hide feature and persists the new value.
   *
   * Updates React state, the mutable {@link cursorAutoHideConfig} object,
   * and the persisted `configStore` entry in a single synchronous pass
   * (persistence is fire-and-forget).
   *
   * @param value - `true` to enable auto-hide, `false` to disable.
   */
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

  /**
   * Updates the inactivity delay and persists the new value.
   *
   * The raw value is clamped to
   * [{@link CURSOR_AUTO_HIDE_MIN_DELAY}, {@link CURSOR_AUTO_HIDE_MAX_DELAY}]
   * (i.e. 1–30 s) and rounded to the nearest integer before being stored.
   *
   * @param value - Desired delay in seconds (will be clamped and rounded).
   */
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
 *
 * ### 3-layer hide approach
 *
 * Hiding is governed by three independent layers that all must agree
 * before the cursor disappears:
 *
 * 1. **Idle timer** — A `setTimeout` schedules {@link hideCursor} after
 *    `delay` seconds of no mouse movement.
 * 2. **Mouse-button guard** (`mouseHeldRef`) — While any mouse button is
 *    held down (e.g. during text selection or drag), the timer is
 *    suspended and `hideCursor` is a no-op. The timer resumes on the
 *    next `mousemove` after `mouseup`.
 * 3. **Always-visible zones** — If the pointer is over an element
 *    matching {@link CURSOR_ALWAYS_VISIBLE_SELECTORS}, the timer is
 *    cancelled and the cursor stays visible.
 *
 * ### Mousedown / mouseup protection
 *
 * Hiding the cursor mid-drag or mid-selection causes visual glitches and
 * disrupts the user's sense of control. To prevent this:
 *
 * - `mousedown` sets `mouseHeldRef` and clears any pending timer.
 * - `mouseup` resets `mouseHeldRef`; the next `mousemove` will restart
 *   the idle timer from scratch.
 * - `window.blur` also resets `mouseHeldRef` to handle the case where
 *   the mouse button is released outside the application window.
 */
export function useCursorAutoHideEffect() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hiddenRef = useRef(false)
  const mouseHeldRef = useRef(false)

  /**
   * Removes {@link CURSOR_HIDDEN_CLASS} from `<html>` to restore the
   * cursor. Skips redundant DOM operations via `hiddenRef`.
   */
  const showCursor = useCallback(() => {
    if (!hiddenRef.current) return
    document.documentElement.classList.remove(CURSOR_HIDDEN_CLASS)
    hiddenRef.current = false
  }, [])

  /**
   * Adds {@link CURSOR_HIDDEN_CLASS} to `<html>` (called when the idle
   * timer fires). Bails out when `mouseHeldRef` is `true` to avoid
   * hiding the cursor during active drag / text-selection operations.
   */
  const hideCursor = useCallback(() => {
    // Never hide while mouse button is held (e.g. during text selection).
    if (mouseHeldRef.current) return
    document.documentElement.classList.add(CURSOR_HIDDEN_CLASS)
    hiddenRef.current = true
  }, [])

  /**
   * Checks whether `target` lives inside an always-visible overlay
   * (e.g. suggestion menus, dialogs) by testing against
   * {@link CURSOR_ALWAYS_VISIBLE_SELECTORS}.
   *
   * @param target - The `EventTarget` from a mouse event.
   * @returns `true` if the cursor should remain visible.
   */
  const isOverAlwaysVisible = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) return false
    return CURSOR_ALWAYS_VISIBLE_SELECTORS.some((sel) => target.closest(sel))
  }, [])

  /**
   * Core `mousemove` handler — resets the idle timer on every movement.
   *
   * 1. If the feature is disabled, ensures the cursor is visible and
   *    returns early (no timer scheduled).
   * 2. Shows the cursor immediately (it may have been hidden).
   * 3. Skips timer scheduling when the pointer is over an always-visible
   *    zone or while a mouse button is held down.
   * 4. Otherwise, (re)starts the idle timer with the configured delay.
   *
   * @param e - The native `mousemove` event.
   */
  const resetTimer = useCallback(
    (e: MouseEvent) => {
      if (!cursorAutoHideConfig.enabled) {
        // Feature was just disabled — ensure cursor is visible.
        showCursor()
        return
      }

      showCursor()

      if (isOverAlwaysVisible(e.target)) return

      // Don't schedule the timer while a mouse button is held.
      if (mouseHeldRef.current) return

      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(
        hideCursor,
        cursorAutoHideConfig.delay * 1000
      )
    },
    [showCursor, hideCursor, isOverAlwaysVisible]
  )

  /**
   * `mouseover` handler — cancels the timer when the pointer enters an
   * always-visible overlay so the cursor stays visible as long as the
   * pointer remains inside.
   *
   * @param e - The native `mouseover` event.
   */
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

  /**
   * `mousedown` handler — activates the mouse-button guard.
   *
   * Sets `mouseHeldRef` to `true` and clears any pending idle timer so
   * that the cursor cannot be hidden while the user is dragging or
   * selecting text.
   */
  const handleMouseDown = useCallback(() => {
    mouseHeldRef.current = true
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  /**
   * `mouseup` handler — deactivates the mouse-button guard.
   *
   * The idle timer is **not** restarted here; the next `mousemove` event
   * will take care of that, keeping the logic centralised in
   * {@link resetTimer}.
   */
  const handleMouseUp = useCallback(() => {
    mouseHeldRef.current = false
  }, [])

  /**
   * `window.blur` handler — safety net for the mouse-button guard.
   *
   * If the user presses a mouse button inside the app and releases it
   * outside (or switches to another window), the `mouseup` event is
   * never received. Resetting `mouseHeldRef` on `blur` prevents the
   * guard from being stuck in the "held" state indefinitely.
   */
  const handleWindowBlur = useCallback(() => {
    mouseHeldRef.current = false
  }, [])

  useEffect(() => {
    document.addEventListener('mousemove', resetTimer)
    document.addEventListener('mouseover', handleMouseOver)
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      document.removeEventListener('mousemove', resetTimer)
      document.removeEventListener('mouseover', handleMouseOver)
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('blur', handleWindowBlur)
      showCursor()
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [
    resetTimer,
    handleMouseOver,
    handleMouseDown,
    handleMouseUp,
    handleWindowBlur,
    showCursor,
  ])
}
