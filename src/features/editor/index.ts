/**
 * @module features/editor
 * BlockNote-based rich-text editor feature with SQLite auto-save.
 */

export type { ImageUploadResult } from './api/imageUpload'
export { resolveImageUrl, uploadImage } from './api/imageUpload'
export type { Note } from './api/notes'
export {
  createNote,
  deleteNote,
  getNote,
  listNotes,
  readTextFile,
  togglePinNote,
  updateNote,
  writeTextFile,
} from './api/notes'
export type { SaveStatus } from './hooks/useAutoSave'
export { useCommandPaletteScroll } from './hooks/useCommandPaletteScroll'
export {
  useCursorAutoHide,
  useCursorAutoHideEffect,
} from './hooks/useCursorAutoHide'
export { useCursorCentering } from './hooks/useCursorCentering'
export { useEditorFontSize } from './hooks/useEditorFontSize'
export type { UseSearchReplaceReturn } from './hooks/useSearchReplace'
export { useSearchReplace } from './hooks/useSearchReplace'
export { DEFAULT_BLOCKS, DEFAULT_CONTENT, extractTitle } from './lib/constants'
export { cursorCenteringExtension } from './lib/cursorCentering'
export { cursorVimKeysExtension } from './lib/cursorVimKeys'
export {
  DEFAULT_FONT_SIZE,
  FONT_SIZE_STEP,
  FONT_SIZE_STORE_KEY,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
} from './lib/fontSizeConfig'
export {
  ALLOWED_IMAGE_TYPES,
  IMAGE_DIR,
  MAX_IMAGE_SIZE_BYTES,
} from './lib/imageUploadConfig'
export {
  exportToMarkdown,
  fixBlockNoteTableExport,
} from './lib/markdown-export'
export { checklistSplitFixExtension } from './lib/checklistSplitFix'
export { rangeCheckToggleExtension } from './lib/rangeCheckToggle'
export { searchExtension } from './lib/searchExtension'
export { slashMenuEmacsKeysExtension } from './lib/slashMenuEmacsKeys'
export type { EditorHandle } from './ui/Editor'
export { Editor } from './ui/Editor'
