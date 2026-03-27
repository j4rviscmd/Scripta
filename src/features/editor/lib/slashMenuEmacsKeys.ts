import { createExtension } from '@blocknote/core'

/**
 * BlockNote extension that adds Emacs-style Ctrl+N / Ctrl+P keyboard
 * navigation to the slash menu (command palette).
 *
 * When the slash menu is open (`triggerCharacter === "/"`), pressing
 * Ctrl+N moves the selection down and Ctrl+P moves it up by translating
 * these key combinations into synthetic ArrowDown/ArrowUp events that
 * the built-in keyboard handler already processes.
 *
 * Only activates for the slash menu — other suggestion menus (e.g. emoji
 * picker with ":") are unaffected. Only responds to the Ctrl modifier
 * (not Cmd), preserving macOS Cmd+N/P system shortcuts.
 */
export const slashMenuEmacsKeysExtension = createExtension(({ editor }) => {
  return {
    key: 'slashMenuEmacsKeys',
    mount({ dom, signal }) {
      dom.addEventListener(
        'keydown',
        (event: Event) => {
          const e = event as KeyboardEvent
          // Require exactly the Ctrl modifier — preserve Cmd+N/P on macOS.
          if (!e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return

          // Map Ctrl+N → ArrowDown, Ctrl+P → ArrowUp; ignore all other keys.
          const arrowKey =
            e.key === 'n' ? 'ArrowDown' : e.key === 'p' ? 'ArrowUp' : null
          if (!arrowKey) return

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ext = editor.getExtension('suggestionMenu') as
            | {
                store: {
                  state:
                    | { show?: boolean; triggerCharacter?: string }
                    | undefined
                }
              }
            | undefined
          const state = ext?.store?.state
          // Only intercept when the slash ("/") menu is visible.
          if (!state?.show || state.triggerCharacter !== '/') return

          // Swallow the original event and re-dispatch as an arrow key
          // so the built-in suggestion-menu handler moves the selection.
          e.preventDefault()
          e.stopImmediatePropagation()

          dom.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: arrowKey,
              bubbles: true,
              cancelable: true,
            })
          )
        },
        { capture: true, signal }
      )
    },
  }
})
