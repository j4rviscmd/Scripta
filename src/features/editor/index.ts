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
  togglePinNote,
} from "./api/notes";
export { DEFAULT_BLOCKS, DEFAULT_CONTENT, extractTitle } from "./lib/constants";
export { cursorCenteringExtension } from "./lib/cursorCentering";
export {
  DEFAULT_FONT_SIZE,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  FONT_SIZE_STEP,
  FONT_SIZE_STORE_KEY,
} from "./lib/fontSizeConfig";
export { useCursorCentering } from "./hooks/useCursorCentering";
export { useEditorFontSize } from "./hooks/useEditorFontSize";
export type { SaveStatus } from "./hooks/useAutoSave";
