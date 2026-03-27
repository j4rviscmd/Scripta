/** Default value: show the "Scripta - " prefix in the window title. */
export const DEFAULT_WINDOW_TITLE_PREFIX = true

/**
 * Store key name for persistence via `configStore`.
 *
 * When `true`, the window title is formatted as `"Scripta - {note title}"`.
 * When `false`, only the note title is shown (e.g. `"My Note"`).
 */
export const WINDOW_TITLE_PREFIX_STORE_KEY =
  'windowTitlePrefixEnabled' as const
