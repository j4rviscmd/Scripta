/** Default values used when no persisted setting exists. */
export const DEFAULT_CURSOR_CENTERING = {
  enabled: true,
  targetRatio: 0.6,
};

/**
 * Mutable configuration for the cursor-centering extension.
 *
 * The ProseMirror plugin reads from this object on every keystroke,
 * so writing to these properties takes effect immediately without
 * re-registering the extension.
 *
 * @remarks
 * Updated via the {@link useCursorCentering} hook, which also
 * persists the values to `configStore`.
 */
export const cursorCenteringConfig = { ...DEFAULT_CURSOR_CENTERING };

/** Store key names for persistence via `configStore`. */
export const CURSOR_CENTERING_STORE_KEYS = {
  enabled: "cursorCenteringEnabled",
  ratio: "cursorCenteringRatio",
} as const;
