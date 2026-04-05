/**
 * @module features/translation
 *
 * Public API for the translation feature module.
 *
 * Provides Apple Intelligence-powered translation via the on-device
 * Translation framework (macOS 26.0+).
 */

export {
  checkLanguagePairStatus,
  detectLanguage,
  getSupportedLanguages,
  isMacos,
  isTranslationAvailable,
  type SupportedLanguage,
  translateBlocks,
  translateNote,
  translateText,
} from './api/translate'

export {
  type TranslatedBlock,
  type TranslationStreamEvent,
  translateBlocksStreaming,
} from './api/translateStreaming'
export {
  collectTranslatableBlockIds,
  commitTranslation,
  StyleCounters,
  updateBlockTextByIndex,
} from './lib/blockUpdater'
export {
  DEFAULT_SOURCE_LANG,
  DEFAULT_TARGET_LANG,
  TRANSLATION_SOURCE_LANG_KEY,
  TRANSLATION_TARGET_LANG_KEY,
} from './lib/translationConfig'
export { TranslationDialog } from './ui/TranslationDialog'
export { TranslationIndicator } from './ui/TranslationIndicator'
