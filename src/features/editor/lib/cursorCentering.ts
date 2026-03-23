import { createExtension } from "@blocknote/core";
import { Plugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

/**
 * Ratio of the scroll-container height at which the cursor should be
 * positioned when centering is triggered (0.4 = 40 % from the top).
 *
 * Shared with {@link useBlockScrollMemory} so that both real-time
 * centering and position restoration target the same vertical offset.
 */
export const CURSOR_TARGET_RATIO = 0.6;

/** Custom event dispatched on `document` when centering is triggered. */
export const CENTERING_EVENT = "scripta:centering";

/**
 * Bottom scroll-margin (px) passed to ProseMirror so that
 * `handleScrollToSelection` fires before the cursor reaches the
 * viewport edge, giving us room to reposition it.
 */
const SCROLL_MARGIN_BOTTOM = 250;

/**
 * Walks up the DOM from `el` and returns the first ancestor whose
 * computed `overflow-y` is `auto` or `scroll`.
 *
 * @param el - The element from which to start the upward traversal.
 * @returns The nearest scrollable ancestor, or `null` if none is found.
 */
function findScrollContainer(el: HTMLElement): HTMLElement | null {
  let current: HTMLElement | null = el;
  while (current) {
    const style = getComputedStyle(current);
    if (style.overflowY === "auto" || style.overflowY === "scroll") {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * Smoothly scrolls the container so that the cursor sits at
 * {@link CURSOR_TARGET_RATIO} from the top of the visible area.
 *
 * Does nothing when the cursor is already above the target or when
 * the calculated scroll offset is within 2 px of the current one.
 *
 * @param view - The current ProseMirror editor view.
 * @returns `true` if a scroll was scheduled, `false` otherwise.
 *
 * @see findScrollContainer - used to locate the scrollable ancestor.
 */
function centerCursorIfBelowTarget(view: EditorView): boolean {
  const container = findScrollContainer(view.dom);
  if (!container) return false;

  const { from, to } = view.state.selection;
  if (from !== to) return false; // text selection in progress

  const coords = view.coordsAtPos(from);
  const rect = container.getBoundingClientRect();

  const targetY = rect.top + rect.height * CURSOR_TARGET_RATIO;
  const scrollTop = container.scrollTop;
  const desired = scrollTop + (coords.top - targetY);

  // Not enough content above the cursor to center — skip
  if (desired <= 0) return false;

  const maxScroll = container.scrollHeight - container.clientHeight;
  const clamped = Math.max(0, Math.min(desired, maxScroll));

  if (Math.abs(clamped - scrollTop) > 2) {
    requestAnimationFrame(() => {
      container.scrollTo({ top: clamped, behavior: "smooth" });
    });
    return true;
  }

  return false;
}

/**
 * Set to `true` inside `state.apply()` when the transaction changed
 * the document content (i.e. the user typed something).
 * Consumed (reset to `false`) each time `handleScrollToSelection` reads it.
 *
 * `state.apply()` is guaranteed to run before
 * `handleScrollToSelection` in ProseMirror's `updateStateInner`.
 */
let docChangedInLastTr = false;

/**
 * BlockNote extension that keeps the text cursor at approximately
 * 40 % from the top of the scroll container **only during typing**.
 *
 * Cursor-only moves (arrow keys, clicks) and manual scrolling do
 * not trigger centering.
 *
 * **How it works:**
 * - Plugin state `apply()` records `tr.docChanged` into a module-level
 *   flag. This runs inside `state.applyTransaction` — before
 *   `handleScrollToSelection` is called.
 * - `handleScrollToSelection` checks the flag: only proceeds when
 *   the document actually changed (i.e. the user typed something).
 * - The scroll offset is clamped to `[0, maxScroll]` so that short
 *   documents keep the cursor near the top (no centre-jump).
 *
 * @see CURSOR_TARGET_RATIO - vertical position ratio used for centering.
 * @see CENTERING_EVENT - custom event dispatched when centering fires.
 */
export const cursorCenteringExtension = createExtension({
  key: "cursorCentering",
  prosemirrorPlugins: [
    new Plugin({
      state: {
        init() {
          return {};
        },
        apply(tr) {
          docChangedInLastTr = tr.docChanged;
          return {};
        },
      },
      props: {
        scrollMargin: {
          top: 100,
          right: 0,
          bottom: SCROLL_MARGIN_BOTTOM,
          left: 0,
        },
        handleScrollToSelection(view: EditorView): boolean {
          if (!docChangedInLastTr) return false;
          docChangedInLastTr = false;
          document.dispatchEvent(new CustomEvent(CENTERING_EVENT));
          return centerCursorIfBelowTarget(view);
        },
      },
    }),
  ],
});
