/**
 * Configuration for the cursor auto-hide behaviour.
 *
 * When enabled, the mouse cursor is hidden after a period of inactivity
 * and reappears on the next mouse movement.
 *
 * @module features/editor/lib/cursorAutoHideConfig
 */

/** Default values used when no persisted setting exists. */
export const DEFAULT_CURSOR_AUTO_HIDE = {
  /** Whether cursor auto-hide is enabled. */
  enabled: false,
  /**
   * Seconds of inactivity before the cursor is hidden.
   * Must be in the range [1, 30].
   */
  delay: 3,
}

/**
 * Mutable runtime configuration for the cursor auto-hide feature.
 *
 * The `useCursorAutoHide` hook reads from and writes to this object so
 * that the behaviour takes effect immediately without re-mounting.
 *
 * @remarks
 * Updated via {@link useCursorAutoHide}, which also persists values to
 * `configStore`.
 */
export const cursorAutoHideConfig = { ...DEFAULT_CURSOR_AUTO_HIDE }

/** Store key names for persistence via `configStore`. */
export const CURSOR_AUTO_HIDE_STORE_KEYS = {
  enabled: 'cursorAutoHideEnabled',
  delay: 'cursorAutoHideDelay',
} as const

/** Minimum allowed delay value in seconds. */
export const CURSOR_AUTO_HIDE_MIN_DELAY = 1
/** Maximum allowed delay value in seconds. */
export const CURSOR_AUTO_HIDE_MAX_DELAY = 30

/**
 * CSS class applied to `<html>` when the cursor should be hidden.
 *
 * The actual `cursor: none` rule is defined in `src/styles/global.css`.
 */
export const CURSOR_HIDDEN_CLASS = 'cursor-autohide-hidden'

/**
 * CSS selectors for UI overlays (e.g. input palettes, dropdowns) that
 * should always show the cursor regardless of the auto-hide state.
 *
 * When the pointer enters any of these elements the hidden class is
 * temporarily removed.
 */
export const CURSOR_ALWAYS_VISIBLE_SELECTORS = [
  '.bn-suggestion-menu',
  '.bn-link-toolbar',
  '.bn-color-picker-dropdown',
  '.bn-formatting-toolbar',
  '.bn-table-handle-menu',
  '[data-slot="select-content"]',
  '[data-slot="dropdown-menu-content"]',
  '[role="dialog"]',
  '[role="menu"]',
  '[role="listbox"]',
]
