import { createExtension } from '@blocknote/core'
import { Plugin, PluginKey } from 'prosemirror-state'

/**
 * Plugin key used to identify the read-only guard plugin.
 */
const PLUGIN_KEY = new PluginKey('readOnlyGuard')

/**
 * Module-level flag that controls whether the editor should block all
 * editing transactions.  Set by the React component via {@link setReadOnly}.
 *
 * Using a module-level variable (instead of React state) allows the
 * ProseMirror plugin's `filterTransaction` to read it synchronously
 * without requiring the plugin to be recreated on every state change.
 */
let readOnly = false

/**
 * Updates the read-only flag.  Called from the Editor React component
 * whenever the `locked` prop changes.
 */
export function setReadOnly(value: boolean): void {
  readOnly = value
}

/**
 * BlockNote extension that blocks all editing transactions when the
 * read-only flag is `true`.
 *
 * Transactions with `addToHistory === false` meta are allowed through so
 * that programmatic content loads (e.g. `replaceBlocks` during note
 * switching) still work.  Selection-only transactions (cursor movement)
 * are also allowed so the user can position the cursor for copying.
 */
export const readOnlyGuardExtension = createExtension({
  key: 'readOnlyGuard',
  prosemirrorPlugins: [
    new Plugin({
      key: PLUGIN_KEY,
      filterTransaction: (tr) => {
        if (!readOnly) return true
        // Allow programmatic content loads that suppress history.
        if (tr.getMeta('addToHistory') === false) return true
        // Allow selection-only transactions (cursor movement, text selection).
        if (tr.docChanged) return false
        return true
      },
    }),
  ],
})
