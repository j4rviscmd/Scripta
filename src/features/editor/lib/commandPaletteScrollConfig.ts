/** Default values used when no persisted setting exists. */
export const DEFAULT_COMMAND_PALETTE_SCROLL = {
  /** Whether the command-palette scroll behaviour is enabled. */
  enabled: true,
  /**
   * The vertical fraction (0–1) from the top of the scroll container
   * where the cursor should be positioned when the command palette opens.
   * A value of 0.25 means 25% from the top.
   */
  targetFraction: 0.25,
};

/**
 * Mutable configuration for the command-palette scroll behaviour.
 *
 * `App.tsx` reads from this object when the suggestion menu opens,
 * so writing to these properties takes effect immediately without
 * re-mounting the editor.
 *
 * @remarks
 * Updated via the {@link useCommandPaletteScroll} hook, which also
 * persists the values to `configStore`.
 */
export const commandPaletteScrollConfig = { ...DEFAULT_COMMAND_PALETTE_SCROLL };

/** Store key names for persistence via `configStore`. */
export const COMMAND_PALETTE_SCROLL_STORE_KEYS = {
  enabled: "commandPaletteScrollEnabled",
  targetFraction: "commandPaletteScrollFraction",
} as const;
