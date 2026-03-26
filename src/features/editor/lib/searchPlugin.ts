import type { Node as ProseMirrorNode } from 'prosemirror-model'
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { searchConfig } from './searchConfig'
import { findMatches } from './searchMatch'

/**
 * ProseMirror plugin key used to identify the search decoration state
 * and communicate between the React hook and the plugin via transactions.
 */
export const searchPluginKey = new PluginKey('searchReplace')

const CSS_MATCH = 'search-match'
const CSS_CURRENT = 'search-match-current'

/**
 * Creates the ProseMirror plugin that manages search decorations.
 *
 * Reads from {@link searchConfig} on every decoration pass. Does NOT
 * store any state itself — the single source of truth is the React hook
 * that writes to `searchConfig`.
 */
export function createSearchPlugin(): Plugin {
  return new Plugin({
    key: searchPluginKey,
    state: {
      init() {
        return DecorationSet.empty
      },
      apply(tr, oldDecoSet) {
        if (!searchConfig.isOpen || !searchConfig.query) {
          return DecorationSet.empty
        }

        if (tr.docChanged || tr.getMeta(searchPluginKey)) {
          const results = findMatches(tr.doc, searchConfig.query, {
            caseSensitive: searchConfig.caseSensitive,
            useRegex: searchConfig.useRegex,
          })
          searchConfig.results = results

          if (searchConfig.currentIndex >= results.length) {
            searchConfig.currentIndex =
              results.length > 0 ? results.length - 1 : -1
          }

          return buildDecorationSet(tr.doc, results, searchConfig.currentIndex)
        }

        return oldDecoSet.map(tr.mapping, tr.doc)
      },
    },
    props: {
      decorations(state) {
        return searchPluginKey.getState(state)
      },
    },
  })
}

/**
 * Builds a ProseMirror `DecorationSet` from an array of match positions.
 *
 * The match at `currentIndex` receives the `search-match-current` CSS
 * class; all other matches receive `search-match`.
 *
 * @param doc - The current ProseMirror document.
 * @param results - Array of `{ from, to }` match positions.
 * @param currentIndex - Index of the currently focused match (-1 for none).
 * @returns A `DecorationSet` ready to be returned from the plugin state.
 */
function buildDecorationSet(
  doc: ProseMirrorNode,
  results: { from: number; to: number }[],
  currentIndex: number
): DecorationSet {
  if (results.length === 0) return DecorationSet.empty

  const decorations = results.map((match, index) => {
    const cls = index === currentIndex ? CSS_CURRENT : CSS_MATCH
    return Decoration.inline(match.from, match.to, { class: cls })
  })

  return DecorationSet.create(doc, decorations)
}
