/** Default editor font family. Uses Geist Variable when no custom font is selected. */
export const DEFAULT_EDITOR_FONT = "'Geist Variable', sans-serif"

/** Default display label shown when no custom font is selected. */
export const DEFAULT_EDITOR_FONT_LABEL = 'Geist Variable'

/**
 * Store key for persisting the selected editor font family in `configStore`.
 *
 * The stored value is the raw CSS `font-family` string (e.g. `"Noto Sans JP"`).
 * An empty string or missing key means the default font is used.
 */
export const EDITOR_FONT_STORE_KEY = 'editorFontFamily' as const

/**
 * Google Fonts CSS API base URL (no API key required).
 *
 * Usage: `${GOOGLE_FONTS_CSS_BASE}?family=Font+Name:wght@400;700&display=swap`
 */
export const GOOGLE_FONTS_CSS_BASE =
  'https://fonts.googleapis.com/css2' as const
