import { createExtension } from '@blocknote/core'
import { Plugin, PluginKey } from 'prosemirror-state'

const PLUGIN_KEY = new PluginKey('imeCompositionGuard')

/** Whether an IME composition session is currently active. */
let composing = false

/** Reference to the ProseMirror editor view, set during plugin initialization. */
let pmView: any = null

/**
 * Flag indicating that a structural transaction was blocked during
 * composition. When true, the immediately following non-structural
 * transaction (the duplicate text insertion caused by position mismatch)
 * is also blocked.
 */
let blockedStructural = false

/**
 * IDs of all `blockContainer` nodes that existed before composition
 * started. Used in the `compositionend` handler to identify and remove
 * orphaned DOM block elements created by WebKit's intermediate DOM
 * mutations.
 */
let preCompositionBlockIds = new Set<string>()

/**
 * BlockNote extension that prevents unwanted line breaks during IME
 * composition on Tauri's WKWebView.
 *
 * **Root cause:** On WebKit, when the user commits IME text without
 * conversion on an empty list item, the browser temporarily removes
 * the composition text (`deleteCompositionText`), which empties the
 * paragraph.  WebKit then splits the list item (exiting an empty
 * list item).  When the committed text is re-inserted
 * (`insertFromComposition`), it lands in the new block.
 *
 * ProseMirror's DOM observer turns these DOM mutations into
 * structural transactions (`ReplaceStep` with `structure: true` and
 * `ReplaceAroundStep`), causing an unwanted block split.
 *
 * **Fix (layered):**
 * 1. `filterTransaction` blocks structural steps during composition
 *    and also blocks the duplicate text insertion that follows
 *    (caused by position mismatch from the blocked structural step).
 * 2. On `compositionend`, orphaned DOM block elements are removed
 *    and ProseMirror re-renders the DOM from its state.
 * 3. `contentEditable = 'plaintext-only'` during composition
 *    prevents block-level element creation (covers "with conversion").
 * 4. `keydown` capture and `handleKeyDown` prop block Enter during
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
       */
      filterTransaction(tr) {
        if (!composing) {
          blockedStructural = false
          return true
        }

        const hasStructural = tr.steps.some(
          (step) => 'gapFrom' in step || (step as any).structure === true,
        )
        if (hasStructural) {
          blockedStructural = true
          return false
        }

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
        return { update() {}, destroy() { pmView = null } }
      },
    }),
  ],
  mount({ dom, signal }) {
    /**
     * Prepares the editor for an IME composition session.
     *
     * Records the set of existing block container IDs so that orphaned
     * DOM nodes can be detected on `compositionend`, and switches the
     * editor to `plaintext-only` contentEditable mode to prevent
     * WebKit from creating block-level elements during composition.
     */
    dom.addEventListener('compositionstart', () => {
      composing = true
      blockedStructural = false
      if (!pmView) return

      preCompositionBlockIds.clear()
      pmView.state.doc.descendants((node: any) => {
        if (node.type.name === 'blockContainer' && node.attrs.id) {
          preCompositionBlockIds.add(node.attrs.id)
        }
      })
      pmView.dom.contentEditable = 'plaintext-only'
    }, { signal })

    /**
     * Cleans up after an IME composition session ends.
     *
     * Removes any DOM block container elements that were created by
     * WebKit's intermediate DOM mutations (i.e., elements whose IDs
     * were not present before composition started). Then forces
     * ProseMirror to re-render the DOM from its authoritative state
     * and restores `contentEditable` to `'true'`.
     *
     * A 500ms delay resets the `composing` flag to allow any late
     * browser events from the composition to settle before normal
     * transaction processing resumes.
     */
    dom.addEventListener('compositionend', () => {
      if (!pmView) return

      const domBlocks = Array.from<Element>(
        pmView.dom.querySelectorAll('[data-node-type="blockContainer"]'),
      )
      for (const el of domBlocks) {
        const id = el.getAttribute('data-id')
        if (!id || !preCompositionBlockIds.has(id)) {
          el.remove()
        }
      }
      pmView.updateState(pmView.state)
      pmView.dom.contentEditable = 'true'

      setTimeout(() => {
        composing = false
        blockedStructural = false
      }, 500)
    }, { signal })

    /**
     * Prevents `insertLineBreak` input events during composition.
     *
     * This is captured in the bubble phase to intercept WebKit's
     * programmatic line break insertion that occurs when the browser
     * splits an empty list item during IME text commitment.
     */
    dom.addEventListener(
      'beforeinput',
      (e: InputEvent) => {
        if (e.inputType === 'insertLineBreak' && composing) {
          e.preventDefault()
        }
      },
      { capture: true, signal },
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
      { capture: true, signal },
    )
  },
})
