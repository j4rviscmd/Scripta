/**
 * @module features/editor
 * BlockNote-based rich-text editor feature with SQLite auto-save.
 */

export { Editor } from "./ui/Editor";
export type { Note } from "./api/notes";
export {
  getNote,
  listNotes,
  createNote,
  updateNote,
  deleteNote,
} from "./api/notes";
export { DEFAULT_BLOCKS, DEFAULT_CONTENT } from "./lib/constants";
