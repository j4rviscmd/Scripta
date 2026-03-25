/** Default value used when no persisted setting exists. */
export const DEFAULT_WINDOW_STATE_RESTORE = true;

/**
 * Store key name for persistence via `configStore`.
 *
 * When `true`, the app restores the last-saved window position and size
 * on startup. When `false`, the window opens at the default 1200×800
 * dimensions (as specified in `tauri.conf.json`).
 *
 * @remarks
 * The window-state plugin always saves position/size on close regardless
 * of this setting. This key only controls whether restore is performed
 * at startup.
 */
export const WINDOW_STATE_STORE_KEY = "windowStateRestoreEnabled" as const;
