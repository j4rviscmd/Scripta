/**
 * Centralized CSS selectors for Scripta E2E tests.
 *
 * BlockNote uses `data-content-type` for block identification and
 * `.bn-*` classes for its UI widgets. These selectors are stable
 * across minor BlockNote versions.
 */

// ── App Shell ──

/** CSS selector for the splash-screen overlay element. */
export const SPLASH_SELECTOR =
  ".fixed.inset-0.z-50.flex.items-center.justify-center";
export const SIDEBAR_HEADER = '[data-slot="sidebar-header"]';
export const SIDEBAR_MENU_BUTTON = '[data-slot="sidebar-menu-button"]';
export const SIDEBAR_MENU_ITEM = '[data-slot="sidebar-menu-item"]';

// ── Editor ──

/** CSS selector for the editor root container. */
export const EDITOR_ROOT = "[data-editor-root]";
/** CSS selector for the ProseMirror contenteditable element within the editor root. */
export const PROSEMIRROR = "[data-editor-root] .ProseMirror";

// ── Block types (data-content-type) ──
export const BLOCK_HEADING = '[data-content-type="heading"]';
export const BLOCK_PARAGRAPH = '[data-content-type="paragraph"]';
export const BLOCK_BULLET = '[data-content-type="bulletListItem"]';
export const BLOCK_NUMBERED = '[data-content-type="numberedListItem"]';
export const BLOCK_CHECKLIST = '[data-content-type="checkListItem"]';
export const BLOCK_CODE = '[data-content-type="codeBlock"]';
export const BLOCK_TABLE = '[data-content-type="table"]';
export const BLOCK_COLUMN_LIST = '[data-node-type="columnList"]';
export const BLOCK_IMAGE = '[data-content-type="image"]';

/**
 * Build a CSS selector for a heading block at the specified level.
 *
 * BlockNote omits the `data-level` attribute when the level equals the
 * default (1), so H1 is matched using `:not([data-level])`.
 *
 * @param n - The heading level (1, 2, or 3)
 * @returns A CSS selector string that matches headings of the given level
 */
export function headingLevel(n: 1 | 2 | 3): string {
  // BlockNote omits data-level when it equals the default (1),
  // so H1 headings have no data-level attribute.
  if (n === 1) {
    return `${BLOCK_HEADING}:not([data-level])`;
  }
  return `${BLOCK_HEADING}[data-level="${n}"]`;
}

// ── Inline styles (inside .bn-inline-content) ──
export const INLINE_CONTENT = ".bn-inline-content";
export const INLINE_BOLD = ".bn-inline-content strong";
export const INLINE_ITALIC = ".bn-inline-content em";
export const INLINE_UNDERLINE = ".bn-inline-content u";
export const INLINE_STRIKE = ".bn-inline-content s";
export const INLINE_CODE = ".bn-inline-content code";
export const INLINE_LINK = ".bn-inline-content a";

// ── Slash menu ──
export const SUGGESTION_MENU = ".bn-suggestion-menu";
export const SUGGESTION_ITEM = '.bn-suggestion-menu [role="option"]';

// ── Side menu / drag handle ──
export const SIDE_MENU = ".bn-side-menu";
export const DRAG_HANDLE = ".bn-drag-handle";
/** CSS selector for the drag-handle dropdown menu (Mantine Menu). */
export const DRAG_HANDLE_MENU =
  '.bn-menu-dropdown[class*="mantine-Menu-dropdown"]';

// ── Formatting toolbar ──
export const FORMATTING_TOOLBAR = ".bn-formatting-toolbar";

// ── Link toolbar / dialog ──
export const LINK_TOOLBAR = ".bn-link-toolbar";
export const EDIT_LINK_URL = "#edit-link-url";
export const EDIT_LINK_TEXT = "#edit-link-text";

// ── Search & Replace ──
export const SEARCH_PANEL = ".search-panel";
export const SEARCH_MATCH = ".search-match";
export const SEARCH_MATCH_CURRENT = ".search-match-current";

// ── Image / File Panel ──
export const IMAGE_ADD_BUTTON = ".bn-add-file-button";
export const FILE_PANEL = ".bn-panel";
/** CSS selector for the URL input within the embed tab of the file panel. */
export const EMBED_TAB_INPUT = '[data-test="embed-input"]';
/** CSS selector for the submit button within the embed tab of the file panel. */
export const EMBED_TAB_BUTTON = '.bn-tab-panel button[type="submit"]';
export const IMAGE_ELEMENT = '[data-content-type="image"] img.bn-visual-media';
export const IMAGE_CAPTION = ".bn-file-caption";
