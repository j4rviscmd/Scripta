/** Default value used when no persisted setting exists. */
export const DEFAULT_WINDOW_STATE_RESTORE = true

/**
 * Store key name for persistence via `configStore`.
 *
 * When `true`, the Rust backend restores the last-saved window position
 * and size before creating the main window frame. When `false`, the
 * window opens at the default 1200×800 dimensions.
 *
 * @remarks
 * Window geometry is always saved to `config.json` on close regardless
 * of this setting. This key only controls whether the saved geometry is
 * applied when the window is created at startup.
 */
export const WINDOW_STATE_STORE_KEY = 'windowStateRestoreEnabled' as const
