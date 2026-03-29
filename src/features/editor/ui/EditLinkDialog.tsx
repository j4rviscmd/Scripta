import {
  DEFAULT_LINK_PROTOCOL,
  LinkToolbarExtension,
  VALID_LINK_PROTOCOLS,
} from '@blocknote/core/extensions'
import { useBlockNoteEditor, useExtension } from '@blocknote/react'
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
import { Label } from '@/components/ui/label'
import type { EditLinkDialogState } from './EditLinkButton'

/**
 * Ensures the URL starts with a recognized protocol.
 *
 * @param url - The raw URL string entered by the user.
 * @returns The URL with a valid protocol prefix, prepending
 *   {@link DEFAULT_LINK_PROTOCOL} if none is found.
 */
function validateUrl(url: string): string {
  const trimmed = url.trim()
  for (const protocol of VALID_LINK_PROTOCOLS) {
    if (trimmed.startsWith(protocol)) {
      return trimmed
    }
  }
  return `${DEFAULT_LINK_PROTOCOL}://${trimmed}`
}

/**
 * Props for the {@link EditLinkDialog} component.
 */
interface EditLinkDialogProps {
  /** Current dialog state, or `null` when the dialog is closed. */
  state: EditLinkDialogState | null
  /** Callback invoked when the dialog should close (cancel or save). */
  onDismiss: () => void
}

/**
 * Dialog for editing link URL and display text.
 *
 * Rendered at the Editor level (outside the LinkToolbar) so it survives
 * toolbar unmount cycles. Follows the same "lifted dialog" pattern as
 * {@link RenameDialog}.
 *
 * @param props - Dialog state and dismiss callback. See {@link EditLinkDialogProps}.
 */
export function EditLinkDialog({ state, onDismiss }: EditLinkDialogProps) {
  const editor = useBlockNoteEditor()
  const { editLink } = useExtension(LinkToolbarExtension)

  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const composingRef = useRef(false)

  useEffect(() => {
    if (state) {
      setUrl(state.url)
      setText(state.text)
    }
  }, [state])

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback(() => {
    setTimeout(() => {
      composingRef.current = false
    }, 50)
  }, [])

  const handleDismiss = useCallback(() => {
    onDismiss()
    editor.focus()
  }, [editor, onDismiss])

  const handleSave = useCallback(() => {
    if (state) {
      editLink(validateUrl(url), text, state.rangeFrom)
    }
    onDismiss()
    editor.focus()
  }, [editor, editLink, state, url, text, onDismiss])

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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Link</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="edit-link-url">URL</Label>
            <Input
              id="edit-link-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              onKeyDown={handleKeyDown}
              placeholder="https://example.com"
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="edit-link-text">Text</Label>
            <Input
              id="edit-link-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              onKeyDown={handleKeyDown}
              placeholder="Link text"
            />
          </div>
        </div>
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
