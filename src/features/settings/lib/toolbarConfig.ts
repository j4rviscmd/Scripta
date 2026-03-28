/**
 * Configuration for the FormattingToolbar item order and visibility.
 *
 * Defines the canonical list of customizable toolbar items, their keys,
 * display labels, default order and visibility. Context-dependent items
 * (blockTypeSelect, tableCellMerge, file operations) are excluded — they
 * are always rendered and self-hide when irrelevant.
 *
 * @module features/settings/lib/toolbarConfig
 */

/** Represents a single toolbar item's persisted configuration. */
export interface ToolbarItemConfig {
  /** Unique key matching the JSX element's `key` prop. */
  key: string
  /** Whether the item is visible in the toolbar. */
  visible: boolean
}

/** Human-readable labels for each customizable toolbar item. */
export const TOOLBAR_ITEM_LABELS: Record<string, string> = {
  boldStyleButton: 'Bold',
  italicStyleButton: 'Italic',
  underlineStyleButton: 'Underline',
  strikeStyleButton: 'Strikethrough',
  textAlignLeftButton: 'Align Left',
  textAlignCenterButton: 'Align Center',
  textAlignRightButton: 'Align Right',
  colorStyleButton: 'Text Color',
  highlightButton: 'Highlight',
  nestBlockButton: 'Indent',
  unnestBlockButton: 'Outdent',
  createLinkButton: 'Create Link',
}

/** Default toolbar layout — all items visible, in canonical order. */
export const DEFAULT_TOOLBAR_CONFIG: ToolbarItemConfig[] = [
  { key: 'boldStyleButton', visible: true },
  { key: 'italicStyleButton', visible: true },
  { key: 'underlineStyleButton', visible: true },
  { key: 'strikeStyleButton', visible: true },
  { key: 'textAlignLeftButton', visible: true },
  { key: 'textAlignCenterButton', visible: true },
  { key: 'textAlignRightButton', visible: true },
  { key: 'colorStyleButton', visible: true },
  { key: 'highlightButton', visible: true },
  { key: 'nestBlockButton', visible: true },
  { key: 'unnestBlockButton', visible: true },
  { key: 'createLinkButton', visible: true },
]

/** Store key for persistence via configStore. */
export const TOOLBAR_CONFIG_STORE_KEY = 'formattingToolbarConfig' as const

/**
 * Validates and merges a persisted config against the current defaults.
 *
 * Handles schema evolution: keeps stored order and visibility for known
 * keys, drops keys that no longer exist, and appends new default items
 * at the end.
 *
 * @param stored - The toolbar configuration array loaded from the persistent store.
 * @returns A validated toolbar configuration containing all current default keys
 *   in the user's persisted order, with any newly added items appended at the end.
 */
export function validateToolbarConfig(
  stored: ToolbarItemConfig[]
): ToolbarItemConfig[] {
  const knownKeys = new Set(DEFAULT_TOOLBAR_CONFIG.map((i) => i.key))
  const filtered = stored.filter((item) => knownKeys.has(item.key))
  const existingKeys = new Set(filtered.map((i) => i.key))
  const missing = DEFAULT_TOOLBAR_CONFIG.filter((i) => !existingKeys.has(i.key))
  return [...filtered, ...missing]
}
