import { AlertCircle, Check, Lock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { SaveStatus } from '@/features/editor'
import { cn } from '@/lib/utils'

/** Duration in milliseconds to keep the "saved" indicator visible before fading out. */
const SAVED_DISPLAY_MS = 3000

/**
 * Compact save-status indicator for the editor header.
 *
 * Shows a subtle dot-based indicator reflecting the auto-save state:
 * - `locked` – lock icon (suppresses all other states)
 * - `saving` – pulsing dot
 * - `saved`  – check icon only (fades out after 3 s)
 * - `error`  – warning icon + "Save failed"
 * - `idle`   – hidden
 *
 * @param props - Component props.
 * @param props.status - The current save state to render.
 */
export function SaveStatusIndicator({
  status,
  locked = false,
}: {
  status: SaveStatus
  /** When `true`, a lock icon is displayed and save status is suppressed. */
  locked?: boolean
}) {
  const [display, setDisplay] = useState<SaveStatus | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )

  // Synchronise the local display state with the upstream save status.
  // Any previous auto-hide timer is cleared first to prevent stale callbacks.
  useEffect(() => {
    clearTimeout(savedTimerRef.current)

    // "idle" means no save activity – hide the indicator immediately.
    if (status === 'idle') {
      setDisplay(null)
      return
    }

    setDisplay(status)

    // After showing the "saved" check icon, start a timer to fade it out.
    if (status === 'saved') {
      savedTimerRef.current = setTimeout(() => {
        savedTimerRef.current = undefined
        setDisplay(null)
      }, SAVED_DISPLAY_MS)
    }

    return () => clearTimeout(savedTimerRef.current)
  }, [status])

  if (locked) {
    return (
      <span className="inline-flex h-4 items-center text-muted-foreground text-xs">
        <Lock className="h-3.5 w-3.5" />
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex h-4 items-center text-muted-foreground text-xs',
        !display && 'invisible'
      )}
      aria-hidden={!display}
    >
      {display === 'saving' && (
        <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground" />
      )}
      {display === 'saved' && <Check className="h-3.5 w-3.5 text-success" />}
      {display === 'error' && (
        <span className="inline-flex items-center gap-1 text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          Save failed
        </span>
      )}
    </span>
  )
}
