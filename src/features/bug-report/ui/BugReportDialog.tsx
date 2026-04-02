/**
 * Bug Report Dialog component.
 *
 * Renders a modal form that allows users to describe a bug and submit the
 * report anonymously to GitHub Issues.
 *
 * @module features/bug-report/ui/BugReportDialog
 */

import { openUrl } from '@tauri-apps/plugin-opener'
import { ExternalLink, Loader2 } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useBugReport } from '../hooks/useBugReport'

/**
 * Props for the {@link BugReportDialog} component.
 *
 * @property open - Whether the dialog is visible.
 * @property onOpenChange - Callback invoked when the dialog open state changes.
 */
interface BugReportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Modal dialog for submitting an anonymous bug report.
 *
 * Collects a required title and description from the user.
 * App version and OS information are collected automatically on submit.
 */
export function BugReportDialog({ open, onOpenChange }: BugReportDialogProps) {
  const { status, errorMessage, issueUrl, submit, reset } = useBugReport()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const isSubmitting = status === 'submitting'
  const isSuccess = status === 'success'

  /** Resets all local state and the hook state. */
  const handleClose = useCallback(
    (value: boolean) => {
      if (!value) {
        setTitle('')
        setDescription('')
        reset()
      }
      onOpenChange(value)
    },
    [onOpenChange, reset]
  )

  /** Submits the bug report. */
  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !description.trim()) return
    await submit({
      title: title.trim(),
      description: description.trim(),
    })
  }, [title, description, submit])

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Report a Bug</DialogTitle>
          <DialogDescription>
            Your report is submitted anonymously. No personal data is collected.
          </DialogDescription>
        </DialogHeader>

        {isSuccess ? (
          <SuccessView issueUrl={issueUrl} onClose={() => handleClose(false)} />
        ) : (
          <FormView
            title={title}
            onTitleChange={setTitle}
            description={description}
            onDescriptionChange={setDescription}
            isSubmitting={isSubmitting}
            errorMessage={errorMessage}
            onSubmit={handleSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface FormViewProps {
  title: string
  onTitleChange: (value: string) => void
  description: string
  onDescriptionChange: (value: string) => void
  isSubmitting: boolean
  errorMessage: string | null
  onSubmit: () => void
}

function FormView({
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  isSubmitting,
  errorMessage,
  onSubmit,
}: FormViewProps) {
  return (
    <div className="flex flex-col gap-4 overflow-y-auto pr-1">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="bug-title"
          className="font-medium text-muted-foreground text-xs"
        >
          Title
          <span className="ml-1 text-destructive">*</span>
        </label>
        <Input
          id="bug-title"
          placeholder="Short summary of the bug"
          className="text-sm"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          disabled={isSubmitting}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="bug-description"
          className="font-medium text-muted-foreground text-xs"
        >
          Description
          <span className="ml-1 text-destructive">*</span>
        </label>
        <Textarea
          id="bug-description"
          placeholder="Describe the bug — what happened, what you expected, and steps to reproduce…"
          className="min-h-[200px] resize-none text-sm"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          disabled={isSubmitting}
        />
      </div>

      {errorMessage && (
        <p className="select-text rounded-md bg-destructive/10 px-3 py-2 text-destructive text-xs">
          {errorMessage}
        </p>
      )}

      <Button
        onClick={onSubmit}
        disabled={isSubmitting || !title.trim() || !description.trim()}
        className="w-full"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Submitting…
          </>
        ) : (
          'Submit Report'
        )}
      </Button>
    </div>
  )
}

interface SuccessViewProps {
  issueUrl: string | null
  onClose: () => void
}

function SuccessView({ issueUrl, onClose }: SuccessViewProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <div>
        <p className="font-medium text-sm">Thank you for your report!</p>
        <p className="mt-1 text-muted-foreground text-xs">
          Your bug report has been submitted anonymously.
        </p>
      </div>
      {issueUrl && (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
          onClick={() => openUrl(issueUrl)}
        >
          <ExternalLink className="h-3 w-3" />
          View on GitHub
        </button>
      )}
      <Button variant="outline" size="sm" onClick={onClose}>
        Close
      </Button>
    </div>
  )
}
