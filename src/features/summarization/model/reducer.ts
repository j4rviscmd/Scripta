import type { SummarizationAction, SummarizationState } from './types'
import { initialState } from './types'

/**
 * Pure reducer for the summarization feature state machine.
 *
 * Handles transitions between idle, loading, summarizing, done, error,
 * and skipped states, as well as cache loading, staleness, and UI expansion.
 *
 * @param state - The current summarization state.
 * @param action - The dispatched action describing the state transition.
 * @returns The next immutable state.
 */
export function summarizationReducer(
  state: SummarizationState,
  action: SummarizationAction
): SummarizationState {
  switch (action.type) {
    case 'SET_AVAILABLE':
      return { ...state, available: action.payload }

    case 'LOAD_CACHED_SUCCESS':
      return {
        ...state,
        status: action.payload.summary ? 'done' : 'idle',
        summary: action.payload.summary,
        isStale: false,
        error: null,
      }

    case 'SUMMARIZE_START':
      return { ...state, status: 'summarizing', error: null }

    case 'SUMMARIZE_SUCCESS':
      return {
        ...state,
        status: 'done',
        summary: action.payload.summary,
        isStale: false,
        error: null,
        isExpanded: action.payload.expand ? true : state.isExpanded,
      }

    case 'SUMMARIZE_ERROR':
      return { ...state, status: 'error', error: action.payload }

    case 'SUMMARIZE_SKIPPED':
      return { ...state, status: 'skipped', summary: null, error: null }

    case 'MARK_STALE':
      return { ...state, isStale: true }

    case 'RESET':
      return { ...initialState, available: state.available }

    case 'SET_EXPANDED':
      return { ...state, isExpanded: action.payload }

    case 'SET_CONTENT_TOO_SHORT':
      return { ...state, contentTooShort: action.payload }

    default:
      return state
  }
}
