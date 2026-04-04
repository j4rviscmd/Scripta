import { invoke } from '@tauri-apps/api/core'
import type { Note } from '@/features/editor'

/** A supported translation language returned by the backend. */
export interface SupportedLanguage {
  code: string
  name: string
}

/**
 * Returns true if the app is running on macOS, false on other platforms.
 * Used to decide whether to show (but disable) or hide the translation UI
 * entirely on non-macOS systems.
 */
export async function isMacos(): Promise<boolean> {
  return invoke<boolean>('is_macos')
}

/**
 * Checks whether the Apple Translation framework is available on the
 * current system (macOS 26.0+ required).
 *
 * @returns `true` if translation is available, `false` otherwise.
 */
export async function isTranslationAvailable(): Promise<boolean> {
  return invoke<boolean>('is_translation_available')
}

/**
 * Returns the list of languages supported by the on-device translation
 * framework.
 */
export async function getSupportedLanguages(): Promise<SupportedLanguage[]> {
  const raw = await invoke<string>('get_supported_languages')
  return JSON.parse(raw) as SupportedLanguage[]
}

/**
 * Translates an entire note and creates a new note with the translated
 * content.
 *
 * The original note is never modified. The translated note inherits the
 * same group as the original and receives a title formatted as
 * `"{original_title} ({TARGET_LANG})"`.
 *
 * @param noteId - The UUID of the note to translate.
 * @param sourceLang - BCP-47 language tag for the source (e.g. "en") or "auto".
 * @param targetLang - BCP-47 language tag for the target (e.g. "ja").
 * @returns The newly created translated note.
 */
export async function translateNote(
  noteId: string,
  sourceLang: string,
  targetLang: string
): Promise<Note> {
  return invoke<Note>('translate_note', { noteId, sourceLang, targetLang })
}

/**
 * Translates a single text string using Apple's on-device Translation
 * framework.
 *
 * @param text - The source string to translate.
 * @param sourceLang - BCP-47 language tag for the source language or "auto".
 * @param targetLang - BCP-47 language tag for the target language.
 * @returns The translated string.
 */
export async function translateText(
  text: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  return invoke<string>('translate_text', { text, sourceLang, targetLang })
}

/**
 * Detects the dominant language of the given text.
 *
 * Returns a BCP-47 base code (e.g. "en", "ja") or empty string on failure.
 */
export async function detectLanguage(text: string): Promise<string> {
  return invoke<string>('detect_language', { text })
}

/**
 * Checks whether a language pair is installed, supported but not downloaded,
 * or unsupported.
 *
 * @returns "installed" | "supported" | "unsupported"
 */
export async function checkLanguagePairStatus(
  sourceLang: string,
  targetLang: string
): Promise<'installed' | 'supported' | 'unsupported'> {
  return invoke<'installed' | 'supported' | 'unsupported'>(
    'check_language_pair_status',
    { sourceLang, targetLang }
  )
}

/**
 * Translates BlockNote content JSON without persisting to DB.
 *
 * Used for re-translation from stored original content. The caller
 * is responsible for persisting the result via auto-save.
 *
 * @param content - BlockNote content JSON string.
 * @param sourceLang - BCP-47 language tag for the source or "auto".
 * @param targetLang - BCP-47 language tag for the target.
 * @returns Translated BlockNote content JSON string.
 */
export async function translateBlocks(
  content: string,
  sourceLang: string,
  targetLang: string
): Promise<string> {
  return invoke<string>('translate_blocks', { content, sourceLang, targetLang })
}
