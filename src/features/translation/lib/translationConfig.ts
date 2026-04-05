/** Store key for persisting the default source language in `configStore`. */
export const TRANSLATION_SOURCE_LANG_KEY = 'translationSourceLang' as const

/** Store key for persisting the default target language in `configStore`. */
export const TRANSLATION_TARGET_LANG_KEY = 'translationTargetLang' as const

/** Default source language — "auto" enables Apple Intelligence auto-detection. */
export const DEFAULT_SOURCE_LANG = 'auto'

/** Default target language (BCP-47 code). */
export const DEFAULT_TARGET_LANG = 'ja'
