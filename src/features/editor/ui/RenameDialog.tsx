import { useBlockNoteEditor } from '@blocknote/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { RenameDialogState } from './RenameButton'

/**
 * Props for the {@link RenameDialog} component.
 *
 * @property state - The rename dialog state. When non-null the dialog is open;
 *   when null it is closed.
 * @property onDismiss - Callback invoked when the dialog is dismissed (cancel or backdrop click).
 */
interface RenameDialogProps {
  state: RenameDialogState | null
  onDismiss: () => void
}

/**
 * Dialog for renaming image/file blocks.
 *
 * Rendered at the Editor component level (outside the FormattingToolbar)
 * so it survives toolbar unmount cycles.
 */
export const RenameDialog = ({ state, onDismiss }: RenameDialogProps) => {
  const editor = useBlockNoteEditor()
  /** Current name text bound to the input field. */
  const [name, setName] = useState('')
  /**
   * Tracks whether an IME composition (e.g. Japanese input) is in progress.
   *
   * Prevents the `Enter` keydown handler from saving while the user is
   * mid-composition.  Chromium fires `compositionend` before the `keydown`
   * for the composition-confirming Enter, so a delayed reset via `setTimeout`
   * is used to keep the guard active long enough for the keydown handler to
   * see `composingRef.current === true` and skip.
   */
  const composingRef = useRef(false)

  useEffect(() => {
    if (state) {
      setName(state.name)
    }
  }, [state])

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback(() => {
    // Delay reset: in Chromium compositionend fires *before* the keydown
    // for the Enter that confirms the composition, so the ref must stay
    // true long enough for the subsequent keydown handler to see it.
    setTimeout(() => {
      composingRef.current = false
    }, 50)
  }, [])

  /** Closes the dialog without saving and returns focus to the editor. */
  const handleDismiss = useCallback(() => {
    onDismiss()
    editor.focus()
  }, [editor, onDismiss])

  /** Persists the updated name to the block and syncs caption to match. */
  const handleSave = useCallback(() => {
    if (state) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      editor.updateBlock(state.blockId, {
        props: { name, caption: name },
      } as any)
    }
    onDismiss()
    editor.focus()
  }, [editor, state, name, onDismiss])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !composingRef.current) {
        e.preventDefault()
        handleSave()
      }
    },
    [handleSave]
  )

  return (
    <Dialog
      open={state !== null}
      onOpenChange={(open) => {
        if (!open) void handleDismiss()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <DialogFooter>
          <Button variant="outline" onClick={handleDismiss}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
