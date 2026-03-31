/**
 * @module features/translation
 *
 * Public API for the translation feature module.
 *
 * Provides Apple Intelligence-powered translation via the on-device
 * Translation framework (macOS 15.0+ Sequoia).
 */

export {
  isTranslationAvailable,
  getSupportedLanguages,
  translateNote,
  translateBlocks,
  translateText,
  detectLanguage,
  checkLanguagePairStatus,
  type SupportedLanguage,
} from './api/translate'

export {
  translateBlocksStreaming,
  type TranslationStreamEvent,
  type TranslatedBlock,
} from './api/translateStreaming'

export { TranslationDialog } from './ui/TranslationDialog'

export {
  DEFAULT_SOURCE_LANG,
  DEFAULT_TARGET_LANG,
  TRANSLATION_SOURCE_LANG_KEY,
  TRANSLATION_TARGET_LANG_KEY,
} from './lib/translationConfig'
