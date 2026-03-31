import type { BlockNoteEditor } from '@blocknote/core'
import { Check, Copy } from 'lucide-react'
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
 * Displays a read-only file path with a copy-to-clipboard button.
 *
 * Matches the copy-button pattern used in the export toast
 * (3 s checkmark confirmation).  The path is visually truncated
 * with an ellipsis when it overflows.
 */
function PathRow({ path }: { path: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      try {
        await navigator.clipboard.writeText(path)
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), 3000)
      } catch {
        // clipboard access failed
      }
    },
    [path]
  )

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <div className="flex min-w-0 select-text items-center gap-1.5 overflow-hidden">
      <button
        type="button"
        onClick={handleCopy}
        onMouseDown={(e) => e.preventDefault()}
        className="shrink-0 select-none"
      >
        {copied ? (
          <Check className="size-3.5" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
      <span
        className="min-w-0 truncate text-muted-foreground text-xs select-text"
        title={path}
      >
        {path}
      </span>
    </div>
  )
}

/**
 * Props for the {@link RenameDialog} component.
 *
 * @property editor - The BlockNote editor instance (passed as prop so the
 *   dialog can live outside BlockNoteView's React context).
 * @property state - The rename dialog state. When non-null the dialog is open;
 *   when null it is closed.
 * @property onDismiss - Callback invoked when the dialog is dismissed (cancel or backdrop click).
 */
interface RenameDialogProps {
  editor: BlockNoteEditor
  state: RenameDialogState | null
  onDismiss: () => void
}

/**
 * Dialog for renaming image/file blocks.
 *
 * Rendered outside {@link BlockNoteView} to avoid ProseMirror focus management
 * interfering with the dialog's focus trap.
 */
export const RenameDialog = ({
  editor,
  state,
  onDismiss,
}: RenameDialogProps) => {
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

  /** Closes the dialog without saving. */
  const handleDismiss = useCallback(() => {
    onDismiss()
  }, [onDismiss])

  /** Persists the updated name to the block and syncs caption to match. */
  const handleSave = useCallback(() => {
    if (state) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      editor.updateBlock(state.blockId, {
        props: { name, caption: name },
      } as any)
    }
    onDismiss()
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Rename</DialogTitle>
        </DialogHeader>
        {state?.url && <PathRow path={state.url} />}
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
