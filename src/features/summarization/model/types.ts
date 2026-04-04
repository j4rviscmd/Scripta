/** Summarization processing status. */
export type SummarizationStatus =
  | 'idle'
  | 'loading'
  | 'summarizing'
  | 'done'
  | 'error'
  | 'skipped'

/** Immutable state managed by the summarization reducer. */
export interface SummarizationState {
  /** The generated summary text, or `null` if none. */
  summary: string | null
  /** Current processing status. */
  status: SummarizationStatus
  /** Error message from the last failed attempt. */
  error: string | null
  /** Whether the cached summary is stale (content changed since summarization). */
  isStale: boolean
  /** Whether the feature is available on this system. */
  available: boolean
  /** Whether the accordion panel is expanded. */
  isExpanded: boolean
  /** Whether the note content is too short for summarization. */
  contentTooShort: boolean
}

/** Default initial state used when creating the summarization reducer. */
export const initialState: SummarizationState = {
  summary: null,
  status: 'idle',
  error: null,
  isStale: false,
  available: false,
  isExpanded: false,
  contentTooShort: true,
}

/** Discriminated union of all actions accepted by {@link summarizationReducer}. */
export type SummarizationAction =
  | { type: 'SET_AVAILABLE'; payload: boolean }
  | { type: 'LOAD_CACHED_SUCCESS'; payload: { summary: string | null } }
  | { type: 'SUMMARIZE_START' }
  | { type: 'SUMMARIZE_SUCCESS'; payload: { summary: string; expand: boolean } }
  | { type: 'SUMMARIZE_ERROR'; payload: string }
  | { type: 'SUMMARIZE_SKIPPED' }
  | { type: 'MARK_STALE' }
  | { type: 'RESET' }
  | { type: 'SET_EXPANDED'; payload: boolean }
  | { type: 'SET_CONTENT_TOO_SHORT'; payload: boolean }
