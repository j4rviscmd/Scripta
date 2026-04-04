import { useEffect, useRef } from 'react'
import { AUTO_SUMMARIZE_DEBOUNCE_MS } from '../lib/constants'

interface UseAutoSummarizeOptions {
  /** Counter incremented each time the note is saved. */
  saveCount: number
  /** Whether a note is selected. */
  enabled: boolean
  /** Whether the feature is available. */
  available: boolean
  /** Whether a summarization is already in progress. */
  isSummarizing: boolean
  /** Called when debounce expires and conditions are met. */
  onTrigger: () => void
  /** Called when content changes (to mark existing summary as stale). */
  onContentChange: () => void
}

/**
 * Auto-summarization hook that debounces note saves and triggers
 * summarization after {@link AUTO_SUMMARIZE_DEBOUNCE_MS} of inactivity.
 */
export function useAutoSummarize({
  saveCount,
  enabled,
  available,
  isSummarizing,
  onTrigger,
  onContentChange,
}: UseAutoSummarizeOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevCountRef = useRef(saveCount)
  const isFirstRender = useRef(true)
  const deferredRef = useRef(false)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      prevCountRef.current = saveCount
      return
    }

    if (prevCountRef.current === saveCount) {
      // Handle deferred trigger when summarization finishes
      if (deferredRef.current && !isSummarizing && enabled && available) {
        deferredRef.current = false
        timerRef.current = setTimeout(() => {
          onTrigger()
        }, AUTO_SUMMARIZE_DEBOUNCE_MS)
      }
      return
    }
    prevCountRef.current = saveCount

    if (!enabled || !available) return

    onContentChange()

    if (timerRef.current) clearTimeout(timerRef.current)

    if (isSummarizing) {
      deferredRef.current = true
      return
    }

    timerRef.current = setTimeout(() => {
      onTrigger()
    }, AUTO_SUMMARIZE_DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [saveCount, enabled, available, isSummarizing, onTrigger, onContentChange])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])
}
