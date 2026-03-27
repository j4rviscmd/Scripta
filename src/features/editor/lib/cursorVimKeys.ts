import { createExtension } from '@blocknote/core'
import { NodeSelection, Selection, TextSelection } from '@tiptap/pm/state'

/**
 * BlockNote extension that adds Vim-style cursor movement keyboard shortcuts
 * to the editor.
 *
 * When the BlockNote editor has focus, the following Ctrl+key combinations
 * move the cursor directly via ProseMirror's Selection API:
 *
 * | Shortcut | Direction                |
 * |----------|--------------------------|
 * | Ctrl+J   | Down (one line)          |
 * | Ctrl+K   | Up (one line)            |
 * | Ctrl+L   | Right (one character)    |
 * | Ctrl+H   | Left (one character)     |
 * | Ctrl+D   | Down (half page scroll)  |
 * | Ctrl+U   | Up (half page scroll)    |
 *
 * Only the Ctrl modifier is matched — macOS Cmd shortcuts are unaffected.
 */
export const cursorVimKeysExtension = createExtension(({ editor }) => {
  return {
    key: 'cursorVimKeys',
    mount({ dom, signal }) {
      dom.addEventListener(
        'keydown',
        (event: Event) => {
          const e = event as KeyboardEvent
          // Require exactly the Ctrl modifier — preserve Cmd+H/J/K/L/U/D on macOS.
          if (!e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return

          // Only handle h/j/k/l/u/d; ignore all other keys.
          if (!['h', 'j', 'k', 'l', 'u', 'd'].includes(e.key)) return

          // Swallow the original event.
          e.preventDefault()
          e.stopImmediatePropagation()

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const view = (editor as any)._tiptapEditor?.view
          if (!view) return

          const { state, dispatch } = view
          const { selection } = state
          const { $head } = selection

          if (e.key === 'l') {
            // Move one character forward
            const pos = Math.min($head.pos + 1, state.doc.content.size)
            const tr = state.tr.setSelection(
              TextSelection.create(state.doc, pos)
            )
            dispatch(tr.scrollIntoView())
            return
          }

          if (e.key === 'h') {
            // Move one character backward
            const pos = Math.max($head.pos - 1, 0)
            const tr = state.tr.setSelection(
              TextSelection.create(state.doc, pos)
            )
            dispatch(tr.scrollIntoView())
            return
          }

          // Ctrl+D / Ctrl+U: half-page scroll with cursor movement
          if (e.key === 'd' || e.key === 'u') {
            const scrollDir = e.key === 'd' ? 1 : -1
            // Find the scrollable container (the element that wraps the editor)
            const editorDom = view.dom as HTMLElement
            let scrollEl: HTMLElement | null = editorDom
            while (scrollEl && scrollEl !== document.body) {
              const style = window.getComputedStyle(scrollEl)
              if (
                style.overflowY === 'auto' ||
                style.overflowY === 'scroll' ||
                style.overflow === 'auto' ||
                style.overflow === 'scroll'
              ) {
                break
              }
              scrollEl = scrollEl.parentElement
            }

            const halfPage =
              (scrollEl ? scrollEl.clientHeight : window.innerHeight) / 2

            // Scroll the container first, then update cursor position.
            if (scrollEl) {
              scrollEl.scrollBy({
                top: scrollDir * halfPage,
                behavior: 'instant',
              })
            } else {
              window.scrollBy({
                top: scrollDir * halfPage,
                behavior: 'instant',
              })
            }

            // Check if we reached the document boundary after scrolling
            const isAtTop = scrollEl
              ? scrollEl.scrollTop === 0
              : window.scrollY === 0
            const isAtBottom = scrollEl
              ? scrollEl.scrollTop + scrollEl.clientHeight >=
                scrollEl.scrollHeight - 1
              : window.scrollY + window.innerHeight >=
                document.documentElement.scrollHeight - 1

            if (scrollDir < 0 && isAtTop) {
              // Reached the top: move cursor to document start
              const firstSel = Selection.findFrom(state.doc.resolve(0), 1)
              if (firstSel) {
                dispatch(state.tr.setSelection(firstSel).scrollIntoView())
              }
              return
            }

            if (scrollDir > 0 && isAtBottom) {
              // Reached the bottom: move cursor to document end
              const lastSel = Selection.findFrom(
                state.doc.resolve(state.doc.content.size),
                -1
              )
              if (lastSel) {
                dispatch(state.tr.setSelection(lastSel).scrollIntoView())
              }
              return
            }

            // After scrolling, find the position at the same X but at the
            // center of the viewport (or near the current cursor's X).
            const coords = view.coordsAtPos($head.pos)
            const containerRect = scrollEl
              ? scrollEl.getBoundingClientRect()
              : { top: 0, bottom: window.innerHeight }
            const centerY = (containerRect.top + containerRect.bottom) / 2

            const result = view.posAtCoords({
              left: coords.left,
              top: centerY,
            })

            if (result != null) {
              const newPos = Math.max(
                0,
                Math.min(result.pos, state.doc.content.size)
              )
              dispatch(
                state.tr
                  .setSelection(TextSelection.create(state.doc, newPos))
                  .scrollIntoView()
              )
            } else {
              // Fallback: jump to document start/end
              const fallbackPos = scrollDir > 0 ? state.doc.content.size : 0
              const fallbackSel = Selection.findFrom(
                state.doc.resolve(fallbackPos),
                scrollDir > 0 ? -1 : 1
              )
              if (fallbackSel) {
                dispatch(state.tr.setSelection(fallbackSel).scrollIntoView())
              }
            }
            return
          }

          // Vertical movement (j = down, k = up)
          const dir = e.key === 'j' ? 1 : -1

          // If the cursor is at the end/start of the current textblock,
          // move to the next/previous block (mirrors ProseMirror's selectVertically).
          const atBoundary = view.endOfTextblock(dir > 0 ? 'down' : 'up')
          const isNodeSel = selection instanceof NodeSelection
          if (atBoundary || isNodeSel || !$head.parent.inlineContent) {
            // For NodeSelection (e.g. image block) or non-inline blocks, resolve
            // a position just outside the current node so findFrom can jump to
            // the neighbour block. Using $head directly would re-select the same
            // node when scanning backward.
            const $start = isNodeSel
              ? state.doc.resolve(
                  dir > 0 ? $head.after($head.depth) : $head.before($head.depth)
                )
              : !$head.parent.inlineContent
                ? $head
                : $head.depth
                  ? state.doc.resolve(dir > 0 ? $head.after() : $head.before())
                  : null
            if ($start) {
              const next = Selection.findFrom($start, dir)
              if (next) {
                dispatch(state.tr.setSelection(next).scrollIntoView())
                return
              }
            }
          }

          // Inside a textblock: use coordsAtPos + posAtCoords to move one
          // visual line up or down.
          const coords = view.coordsAtPos($head.pos)
          const lineHeight = 20
          const targetY =
            dir > 0
              ? coords.bottom + lineHeight / 2
              : coords.top - lineHeight / 2

          const result = view.posAtCoords({
            left: coords.left,
            top: targetY,
          })
          if (result == null) return

          const newPos = Math.max(
            0,
            Math.min(result.pos, state.doc.content.size)
          )
          if (newPos === $head.pos) return

          const tr = state.tr.setSelection(
            TextSelection.create(state.doc, newPos)
          )
          dispatch(tr.scrollIntoView())
        },
        { capture: true, signal }
      )
    },
  }
})
