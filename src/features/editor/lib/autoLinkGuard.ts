import { createExtension } from '@blocknote/core'
import { Plugin } from 'prosemirror-state'

/**
 * BlockNote extension that prevents the Tiptap autolink plugin from
 * overwriting existing link marks with auto-detected domain-name links.
 *
 * **Problem**: When a link's display text contains a substring that looks
 * like a domain (e.g. "Amazon.co.jp"), the autolink plugin creates a new
 * link mark for that substring, splitting the original single link into
 * two adjacent links with different URLs.
 *
 * **Solution**: Reject transactions whose *only* steps are `addMark` steps
 * targeting a `link` mark on a range that already carries a `link` mark.
 * This targets the autolink plugin's output (pure mark-add transactions)
 * without interfering with legitimate `editLink` / `setLink` calls, which
 * always include other step types or set the `preventAutolink` meta.
 */
export const autoLinkGuardExtension = createExtension({
  key: 'autoLinkGuard',
  prosemirrorPlugins: [
    new Plugin({
      filterTransaction(tr, state) {
        if (tr.getMeta('preventAutolink')) return true
        if (tr.steps.length === 0) return true

        // Only inspect transactions that consist exclusively of addMark steps
        // (the pattern produced by the autolink appendTransaction plugin).
        // Uses toJSON() instead of instanceof for resilience across bundles.
        const onlyAddMark = tr.steps.every(
          (step) => step.toJSON().stepType === 'addMark'
        )
        if (!onlyAddMark) return true

        const linkType = state.schema.marks.link
        if (!linkType) return true

        for (const step of tr.steps) {
          const json = step.toJSON()
          if (
            json.stepType === 'addMark' &&
            json.mark?.type === 'link' &&
            state.doc.rangeHasMark(json.from, json.to, linkType)
          ) {
            return false
          }
        }

        return true
      },
    }),
  ],
})
