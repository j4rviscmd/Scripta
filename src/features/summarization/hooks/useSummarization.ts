import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import {
  getNoteSummary,
  isSummarizationAvailable,
  summarizeNote,
} from '../api/summarize'
import { MIN_CHARS } from '../lib/constants'
import {
  useSummarizationDispatch,
  useSummarizationState,
} from '../model/context'

/** Options for the {@link useSummarization} hook. */
interface UseSummarizationOptions {
  /** ID of the currently selected note, or `null` when none is selected. */
  noteId: string | null
  /** Character length of the current note content, used to determine if the note is too short. */
  contentLength?: number
}

/**
 * Core summarization hook that manages availability checks, cache loading,
 * manual trigger, staleness marking, and accordion state.
 *
 * @param options - Configuration for the hook.
 * @param options.noteId - The ID of the note to summarize.
 * @param options.contentLength - Character length of the note, used to detect too-short content.
 * @returns The current {@link SummarizationState} merged with action callbacks
 *   (`summarize`, `markStale`, `setExpanded`).
 */
export function useSummarization({
  noteId,
  contentLength,
}: UseSummarizationOptions) {
  const state = useSummarizationState()
  const dispatch = useSummarizationDispatch()
  const abortRef = useRef(false)

  // Check availability on mount
  useEffect(() => {
    isSummarizationAvailable()
      .then((available) =>
        dispatch({ type: 'SET_AVAILABLE', payload: available })
      )
      .catch(() => dispatch({ type: 'SET_AVAILABLE', payload: false }))
  }, [dispatch])

  // Load cached summary when noteId changes
  useEffect(() => {
    if (!noteId || !state.available) {
      dispatch({ type: 'RESET' })
      return
    }
    let stale = false
    getNoteSummary(noteId)
      .then((cached) => {
        if (!stale) {
          dispatch({
            type: 'LOAD_CACHED_SUCCESS',
            payload: { summary: cached },
          })
        }
      })
      .catch(() => {
        if (!stale)
          dispatch({
            type: 'LOAD_CACHED_SUCCESS',
            payload: { summary: null },
          })
      })
    return () => {
      stale = true
    }
  }, [noteId, state.available, dispatch])

  // Manual trigger
  /**
   * Triggers summarization for the current note.
   *
   * Ensures a minimum 500 ms loading state for UI smoothness. Handles
   * `CONTENT_TOO_SHORT` and safety-filter errors with user-facing toasts.
   *
   * @param options - Optional flags.
   * @param options.manual - When `true`, auto-expands the summary accordion on success.
   */
  const summarize = useCallback(
    async (options?: { manual?: boolean }) => {
      if (!noteId) return

      const expand = options?.manual ?? false
      abortRef.current = false
      dispatch({ type: 'SUMMARIZE_START' })
      const startTime = Date.now()

      const ensureMinLoading = async () => {
        const elapsed = Date.now() - startTime
        if (elapsed < 500) {
          await new Promise((r) => setTimeout(r, 500 - elapsed))
        }
      }

      try {
        const result = await summarizeNote(noteId)
        await ensureMinLoading()
        if (!abortRef.current) {
          dispatch({
            type: 'SUMMARIZE_SUCCESS',
            payload: { summary: result, expand },
          })
        }
      } catch (e) {
        await ensureMinLoading()
        if (abortRef.current) return
        const msg = String(e)
        console.error('[Summarization]', msg)
        if (msg.includes('CONTENT_TOO_SHORT')) {
          dispatch({ type: 'SUMMARIZE_SKIPPED' })
          toast.info('Note is too short to summarize')
        } else if (msg.includes('unsafe')) {
          dispatch({ type: 'SUMMARIZE_SKIPPED' })
          toast.info('Unable to summarize this content')
        } else {
          dispatch({ type: 'SUMMARIZE_ERROR', payload: msg })
          toast.error('Summarization failed', { description: msg })
        }
      }
    },
    [noteId, dispatch]
  )

  /** Marks the current summary as stale when note content has changed since the last summarization. */
  const markStale = useCallback(() => {
    if (state.status === 'done' && state.summary) {
      dispatch({ type: 'MARK_STALE' })
    }
  }, [state.status, state.summary, dispatch])

  /** Sets the expanded/collapsed state of the summary accordion panel. */
  const setExpanded = useCallback(
    (expanded: boolean) => {
      dispatch({ type: 'SET_EXPANDED', payload: expanded })
    },
    [dispatch]
  )

  // Track content-too-short state
  useEffect(() => {
    dispatch({
      type: 'SET_CONTENT_TOO_SHORT',
      payload: (contentLength ?? 0) < MIN_CHARS,
    })
  }, [contentLength, dispatch])

  // Cleanup on unmount / note switch
  useEffect(() => {
    return () => {
      abortRef.current = true
    }
  }, [noteId])

  return {
    ...state,
    summarize,
    markStale,
    setExpanded,
  }
}
