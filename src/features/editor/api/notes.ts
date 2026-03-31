import { invoke } from '@tauri-apps/api/core'

/**
 * Represents a single note persisted in the local SQLite database.
 *
 * Field names follow camelCase to match the `#[serde(rename_all = "camelCase")]`
 * annotation on the Rust-side `Note` struct.
 */
export interface Note {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
  isPinned: boolean
  groupId: string | null
  isLocked: boolean
}

/**
 * Retrieves a single note by its UUID.
 *
 * @param id - The UUID of the note to fetch.
 * @returns The matching note, or `null` if no note with the given ID exists.
 */
export async function getNote(id: string): Promise<Note | null> {
  return invoke<Note | null>('get_note', { id })
}

/**
 * Returns all notes sorted by most recently updated first.
 *
 * @returns An array of notes in descending `updatedAt` order.
 */
export async function listNotes(): Promise<Note[]> {
  return invoke<Note[]>('list_notes')
}

/**
 * Creates a new note with a generated UUID and the current timestamp.
 *
 * @param title - The display title for the new note.
 * @param content - The raw BlockNote document JSON content.
 * @returns The newly created note with all fields populated.
 */
export async function createNote(
  title: string,
  content: string
): Promise<Note> {
  return invoke<Note>('create_note', { title, content })
}

/**
 * Updates an existing note's title, content, and timestamp.
 *
 * @param id - The UUID of the note to update.
 * @param title - The new display title.
 * @param content - The new raw BlockNote document JSON content.
 * @returns The updated note as it exists in the database after the write.
 * @throws Throws an error string if the note is not found or the update fails.
 */
export async function updateNote(
  id: string,
  title: string,
  content: string
): Promise<Note> {
  return invoke<Note>('update_note', { id, title, content })
}

/**
 * Permanently deletes a note by its UUID.
 *
 * @param id - The UUID of the note to delete.
 */
export async function deleteNote(id: string): Promise<void> {
  return invoke<void>('delete_note', { id })
}

/**
 * Toggles the pinned state of a note.
 *
 * @param id - The UUID of the note to pin or unpin.
 * @param pinned - `true` to pin, `false` to unpin.
 * @returns The updated note as it exists in the database after the write.
 */
export async function togglePinNote(
  id: string,
  pinned: boolean
): Promise<Note> {
  return invoke<Note>('toggle_pin', { id, pinned })
}

/**
 * Toggles the locked (read-only) state of a note.
 *
 * @param id - The UUID of the note to lock or unlock.
 * @param locked - `true` to lock, `false` to unlock.
 * @returns The updated note as it exists in the database after the write.
 */
export async function toggleLockNote(
  id: string,
  locked: boolean
): Promise<Note> {
  return invoke<Note>('toggle_lock', { id, locked })
}

/**
 * Duplicates an existing note.
 *
 * Creates a new note with the same content and group as the original.
 * The title is suffixed with " (copy)" and the pin state is not inherited.
 *
 * @param id - The UUID of the note to duplicate.
 * @returns The newly created duplicate note.
 */
export async function duplicateNote(id: string): Promise<Note> {
  return invoke<Note>('duplicate_note', { id })
}

/**
 * Reads a text file and returns its content.
 *
 * @param path - Absolute path to the file.
 * @returns The file content as a string.
 */
export async function readTextFile(path: string): Promise<string> {
  return invoke<string>('read_text_file', { path })
}

/**
 * Writes content to a text file, creating parent directories as needed.
 *
 * @param path - Absolute path to the file.
 * @param content - The text content to write.
 */
export async function writeTextFile(
  path: string,
  content: string
): Promise<void> {
  return invoke<void>('write_text_file', { path, content })
}
