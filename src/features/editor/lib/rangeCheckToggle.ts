import { createExtension } from "@blocknote/core";
import { Plugin } from "prosemirror-state";

/**
 * BlockNote extension that enables "range check toggle" behavior.
 *
 * When the user has a text selection spanning multiple checkListItem blocks
 * and clicks a checkbox on any one of them, ALL checkListItem blocks in the
 * selection are toggled to the same checked state.
 *
 * Selection tracking uses ProseMirror's `doc.nodesBetween()` inside a
 * plugin's `view.update()` callback.  This detects nested/child blocks
 * that `editor.getSelection()` collapses into their parent.
 *
 * `event.preventDefault()` on `mousedown` suppresses the native checkbox
 * toggle, which prevents BlockNote's built-in `change` handler from firing.
 *
 * All block updates are wrapped in `editor.transact()` so the batch
 * toggle is a single undo step.
 */
export const rangeCheckToggleExtension = createExtension(({ editor }) => {
  /** Block IDs of checkListItem blocks in the most recent multi-block selection. */
  let lastCheckListIds: string[] | null = null;

  /**
   * Returns true when `el` is a checkbox input inside a checkListItem.
   */
  function isCheckListCheckbox(el: EventTarget | null): el is HTMLInputElement {
    return (
      el instanceof HTMLInputElement &&
      el.type === "checkbox" &&
      el.closest('[data-content-type="checkListItem"]') !== null
    );
  }

  return {
    key: "rangeCheckToggle",
    prosemirrorPlugins: [
      new Plugin({
        view() {
          return {
            update(view) {
              const { from, to } = view.state.selection;
              if (from === to) return;

              const ids: string[] = [];
              view.state.doc.nodesBetween(from, to, (node, pos) => {
                if (
                  node.type.name === "blockContainer" &&
                  node.firstChild?.type.name === "checkListItem"
                ) {
                  // Only include this block if its checkListItem content
                  // actually overlaps with the selection range.
                  // Without this check, ancestor blockContainers (whose
                  // children are in the selection but whose own content
                  // is outside) would be incorrectly included.
                  const contentStart = pos + 1;
                  const contentEnd = pos + 1 + node.firstChild.nodeSize;
                  if (contentStart < to && contentEnd > from) {
                    const id = node.attrs.id as string | undefined;
                    if (id) ids.push(id);
                  }
                }
              });

              if (ids.length >= 2) {
                lastCheckListIds = ids;
              }
            },
          };
        },
      }),
    ],
    mount({ dom, signal }) {
      dom.addEventListener(
        "mousedown",
        (event: Event) => {
          const target = (event as MouseEvent).target;
          if (!isCheckListCheckbox(target)) {
            lastCheckListIds = null;
            return;
          }

          const ids = lastCheckListIds;
          if (!ids || ids.length < 2) return;

          // Verify the clicked checkbox belongs to the saved range.
          // This guards against stale IDs from a previous selection that
          // was changed via keyboard without triggering a mousedown clear.
          const blockContainer = target.closest(
            '[data-node-type="blockContainer"]',
          );
          const clickedBlockId = blockContainer?.getAttribute("data-id");
          if (!clickedBlockId || !ids.includes(clickedBlockId)) return;

          const newChecked = !target.checked;

          event.preventDefault();

          editor.transact(() => {
            for (const id of ids) {
              editor.updateBlock(id, {
                props: { checked: newChecked },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any);
            }
          });
        },
        { capture: true, signal },
      );
    },
  };
});
