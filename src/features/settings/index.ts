/**
 * Settings feature public API.
 *
 * @module features/settings
 */

export { useWindowState } from './hooks/useWindowState'
export {
  DEFAULT_EDITOR_FONT,
  DEFAULT_EDITOR_FONT_LABEL,
  EDITOR_FONT_STORE_KEY,
} from './lib/editorFontConfig'
export type { ToolbarItemConfig } from './lib/toolbarConfig'
export {
  DEFAULT_TOOLBAR_CONFIG,
  TOOLBAR_CONFIG_STORE_KEY,
  TOOLBAR_ITEM_LABELS,
} from './lib/toolbarConfig'
export {
  DEFAULT_WINDOW_STATE_RESTORE,
  WINDOW_STATE_STORE_KEY,
} from './lib/windowStateConfig'
export { SettingsDialog } from './ui/SettingsDialog'
