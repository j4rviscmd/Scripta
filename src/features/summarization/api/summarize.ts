import { invoke } from '@tauri-apps/api/core'

/**
 * Checks whether Apple FoundationModels summarization is available
 * on the current system (macOS 26.0+ required).
 */
export async function isSummarizationAvailable(): Promise<boolean> {
  return invoke<boolean>('is_summarization_available')
}

/**
 * Retrieves a cached summary for a note if the content hasn't changed.
 * Returns `null` if no cached summary exists or it is stale.
 */
export async function getNoteSummary(noteId: string): Promise<string | null> {
  return invoke<string | null>('get_note_summary', { noteId })
}

/**
 * Summarizes a note's content using recursive chunk summarization.
 * The result is automatically cached in the database.
 *
 * @throws `"ERR::CONTENT_TOO_SHORT"` when note has < 100 characters.
 */
export async function summarizeNote(noteId: string): Promise<string> {
  return invoke<string>('summarize_note', { noteId })
}
