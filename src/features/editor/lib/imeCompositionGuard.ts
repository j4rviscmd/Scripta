import { createExtension } from '@blocknote/core'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import { Plugin, PluginKey, TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'

/** ProseMirror plugin key used to tag and identify transactions originating from this guard. */
const PLUGIN_KEY = new PluginKey('imeCompositionGuard')

// ---------------------------------------------------------------------------
// Module-level state — shared between the ProseMirror plugin and the DOM
// event listeners registered in `mount()`.
// ---------------------------------------------------------------------------

/** Whether an IME composition session is currently active. */
let composing = false

/** Reference to the ProseMirror editor view, set during plugin initialization. */
let pmView: EditorView | null = null

/**
 * Flag indicating that a structural transaction was blocked during
 * composition. When true, the immediately following non-structural
 * transaction (the duplicate text insertion caused by position mismatch)
 * is also blocked.
 */
let blockedStructural = false

/**
 * The ProseMirror document snapshot taken before composition starts.
 * Used after composition to restore the document and apply only the
 * committed text, discarding any incorrect intermediate mutations that
 * ProseMirror's composition flush may have produced.
 */
let preCompositionDoc: ProseMirrorNode | null = null

/**
 * The selection position (from/to) saved before composition starts.
 * Used to insert the composed text at the correct position after
 * restoring the pre-composition document.
 */
let compositionFrom = -1
let compositionTo = -1

/**
 * The composed text from the compositionend event's data property.
 */
let composedText = ''

/**
 * IDs of all `blockContainer` nodes that existed before composition
 * started. Used in the `compositionend` handler to identify and remove
 * orphaned DOM block elements created by WebKit's intermediate DOM
 * mutations.
 */
const preCompositionBlockIds = new Set<string>()

/**
 * Input event types that must be suppressed during IME composition to
 * prevent unwanted line-break or paragraph insertion by WebKit.
 */
const BLOCKED_INPUT_TYPES: ReadonlySet<string> = new Set([
  'insertLineBreak',
  'insertParagraph',
])

/**
 * BlockNote extension that prevents unwanted line breaks during IME
 * composition on Tauri's WKWebView.
 *
 * **Root cause:** On WebKit, when the user commits IME text (with or
 * without conversion) on an empty list/checkbox item, the browser
 * temporarily removes the composition text, which empties the
 * paragraph. WebKit then splits the block. When the committed text
 * is re-inserted, it lands in the new block.
 *
 * For checkListItem blocks, ProseMirror's composition flush produces
 * incorrect transactions because the `contenteditable="false"` wrapper
 * around the checkbox confuses DOM-to-model position mapping. This
 * results in duplicate blocks and text being appended to the parent.
 *
 * **Fix (layered):**
 * 1. On `compositionstart`, save a ProseMirror document snapshot and
 *    cursor position for post-composition restoration.
 * 2. `filterTransaction` blocks structural steps during composition
 *    and the duplicate text insertion that follows.
 * 3. On `compositionend`, restore the document from the snapshot and
 *    insert only the committed text, discarding incorrect intermediate
 *    state. Orphaned DOM block elements are also removed.
 * 4. `contentEditable = 'plaintext-only'` during composition prevents
 *    block-level element creation.
 * 5. `keydown` capture and `handleKeyDown` prop block Enter during
 *    the composing window as additional safety.
 */
export const imeCompositionGuard = createExtension({
  key: 'imeCompositionGuard',
  prosemirrorPlugins: [
    new Plugin({
      key: PLUGIN_KEY,
      /**
       * Filters ProseMirror transactions during IME composition.
       *
       * Blocks two categories of transactions:
       * 1. Structural steps (`ReplaceStep` with `structure: true` or
       *    `ReplaceAroundStep`) that WebKit generates when it temporarily
       *    empties a list item during composition.
       * 2. The non-structural transaction immediately following a blocked
       *    structural one, which is a duplicate text insertion caused by
       *    the position mismatch introduced by blocking step 1.
       *
       * Any remaining incorrect state is cleaned up by the snapshot
       * restore in the compositionend handler.
       */
      filterTransaction(tr) {
        if (tr.getMeta(PLUGIN_KEY) === 'restore') return true
        if (!composing) {
          blockedStructural = false
          return true
        }

        // Block structural steps (ReplaceAroundStep or ReplaceStep with
        // `structure: true`) that WebKit produces when it temporarily
        // empties a list item during composition.
        const hasStructuralStep = tr.steps.some(
          (step) => 'gapFrom' in step || (step as any).structure === true
        )
        if (hasStructuralStep) {
          blockedStructural = true
          return false
        }

        // Also block the immediately following non-structural transaction,
        // which is a duplicate text insertion caused by the position
        // mismatch introduced by blocking the structural step above.
        if (blockedStructural) {
          blockedStructural = false
          return false
        }

        return true
      },
      props: {
        /** Suppresses Enter keydown events while an IME composition is active. */
        handleKeyDown(_view, event) {
          return event.key === 'Enter' && composing
        },
      },
      /** Stores the ProseMirror editor view reference for use in DOM event handlers. */
      view(editorView) {
        pmView = editorView
        return {
          destroy() {
            pmView = null
          },
        }
      },
    }),
  ],
  /**
   * Registers DOM event listeners on the editor element to manage the
   * full IME composition lifecycle.
   *
   * Listens for `compositionstart`, `compositionend`, `beforeinput`, and
   * `keydown` (capture phase) events. All listeners are automatically
   * removed when the extension is destroyed via the provided `AbortSignal`.
   *
   * @param dom - The BlockNote editor DOM element provided by the extension framework.
   * @param signal - An `AbortSignal` that aborts when the extension is destroyed.
   */
  mount({ dom, signal }) {
    /**
     * Prepares the editor for an IME composition session.
     *
     * Saves a snapshot of the current ProseMirror document and cursor
     * position, records the set of existing block container IDs, and
     * switches the editor to `plaintext-only` contentEditable mode.
     */
    dom.addEventListener(
      'compositionstart',
      () => {
        composing = true
        blockedStructural = false
        composedText = ''
        if (!pmView) return

        preCompositionDoc = pmView.state.doc
        compositionFrom = pmView.state.selection.from
        compositionTo = pmView.state.selection.to

        preCompositionBlockIds.clear()
        pmView.state.doc.descendants((node: ProseMirrorNode) => {
          if (node.type.name === 'blockContainer' && node.attrs.id) {
            preCompositionBlockIds.add(node.attrs.id as string)
          }
        })

        pmView.dom.contentEditable = 'plaintext-only'
      },
      { signal }
    )

    /**
     * Cleans up after an IME composition session ends.
     *
     * Saves the composed text, removes orphaned DOM block elements,
     * then restores the ProseMirror document from the pre-composition
     * snapshot and inserts only the committed text. This discards any
     * incorrect intermediate state that ProseMirror's composition flush
     * may have produced (e.g., duplicate blocks or text appended to
     * parent blocks in checkListItem).
     *
     * A 500ms delay resets the `composing` flag to allow any late
     * browser events from the composition to settle before normal
     * transaction processing resumes.
     */
    dom.addEventListener(
      'compositionend',
      (e: CompositionEvent) => {
        if (!pmView) return

        composedText = e.data || ''

        // Remove orphaned DOM block containers created by WebKit's
        // intermediate DOM mutations.
        const domBlocks = pmView.dom.querySelectorAll<Element>(
          '[data-node-type="blockContainer"]'
        )
        for (const el of domBlocks) {
          const id = el.getAttribute('data-id')
          if (!id || !preCompositionBlockIds.has(id)) {
            el.remove()
          }
        }

        pmView.dom.contentEditable = 'true'

        // After ProseMirror's composition flush completes, restore the
        // document from the pre-composition snapshot and apply only the
        // committed text. Using queueMicrotask ensures the restore runs
        // after all synchronous compositionend handlers but BEFORE the
        // browser paints, preventing a flash of broken state.
        queueMicrotask(() => {
          if (!pmView || !preCompositionDoc) return

          try {
            const tr = pmView.state.tr
            tr.replace(
              0,
              tr.doc.content.size,
              preCompositionDoc.slice(0, preCompositionDoc.content.size)
            )

            if (composedText) {
              tr.insertText(composedText, compositionFrom, compositionTo)
            }

            const newPos = compositionFrom + composedText.length
            tr.setSelection(TextSelection.create(tr.doc, newPos))
            tr.setMeta(PLUGIN_KEY, 'restore')
            pmView.dispatch(tr)
          } catch {
            // If restoration fails (e.g., schema mismatch), fall back
            // to a simple force update.
            pmView.dispatch(pmView.state.tr.setMeta(PLUGIN_KEY, 'forceUpdate'))
          }

          preCompositionDoc = null
        })

        setTimeout(() => {
          composing = false
          blockedStructural = false
        }, 500)
      },
      { signal }
    )

    /**
     * Prevents `insertLineBreak` and `insertParagraph` input events
     * during composition.
     *
     * Captured in the bubble phase to intercept WebKit's programmatic
     * line break insertion that occurs when the browser splits an empty
     * list item during IME text commitment.
     */
    dom.addEventListener(
      'beforeinput',
      (e: InputEvent) => {
        if (!composing) return
        if (BLOCKED_INPUT_TYPES.has(e.inputType)) {
          e.preventDefault()
        }
      },
      { capture: true, signal }
    )

    /**
     * Captures Enter keydown events during composition at the
     * capture phase.
     *
     * Calls both `preventDefault()` and `stopImmediatePropagation()`
     * to ensure the event never reaches ProseMirror's keydown
     * handler, which would otherwise create a new block.
     */
    dom.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        if (e.key === 'Enter' && composing) {
          e.preventDefault()
          e.stopImmediatePropagation()
        }
      },
      { capture: true, signal }
    )
  },
})
