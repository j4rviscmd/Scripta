import { createExtension } from "@blocknote/core";
import { Plugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { cursorCenteringConfig } from "./cursorCenteringConfig";
import { CENTERING_EVENT } from "@/shared/lib/events";

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
 * the configured target ratio from the top of the visible area.
 *
 * Does nothing when the cursor is already above the target or when
 * the calculated scroll offset is within 2 px of the current one.
 *
 * @param view - The current ProseMirror editor view.
 * @returns `true` if a scroll was scheduled, `false` otherwise.
 */
function centerCursorIfBelowTarget(view: EditorView): boolean {
  const container = findScrollContainer(view.dom);
  if (!container) return false;

  const { from, to } = view.state.selection;
  if (from !== to) return false; // text selection in progress

  const coords = view.coordsAtPos(from);
  const rect = container.getBoundingClientRect();

  const targetY = rect.top + rect.height * cursorCenteringConfig.targetRatio;
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
 * BlockNote extension that keeps the text cursor at the configured
 * position from the top of the scroll container **only during typing**.
 *
 * Cursor-only moves (arrow keys, clicks) and manual scrolling do
 * not trigger centering. The feature can be disabled entirely via
 * {@link cursorCenteringConfig.enabled}.
 *
 * **How it works:**
 * - Plugin state `apply()` records `tr.docChanged` into a module-level
 *   flag. This runs inside `state.applyTransaction` — before
 *   `handleScrollToSelection` is called.
 * - `handleScrollToSelection` checks the flag: only proceeds when
 *   the document actually changed (i.e. the user typed something).
 * - The scroll offset is clamped to `[0, maxScroll]` so that short
 *   documents keep the cursor near the top (no centre-jump).
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
          if (!cursorCenteringConfig.enabled) return false;
          if (!docChangedInLastTr) return false;
          docChangedInLastTr = false;
          document.dispatchEvent(new CustomEvent(CENTERING_EVENT));
          return centerCursorIfBelowTarget(view);
        },
      },
    }),
  ],
});
