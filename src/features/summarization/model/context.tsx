import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useReducer,
} from 'react'
import { useAutoSummarize } from '../hooks/useAutoSummarize'
import { useSummarization } from '../hooks/useSummarization'
import { summarizationReducer } from './reducer'
import {
  initialState,
  type SummarizationAction,
  type SummarizationState,
} from './types'

/** Actions exposed by SummarizationManager for connected UI components. */
export interface SummarizationActions {
  /** Triggers summarization. When `manual` is true, the accordion auto-expands on success. */
  summarize: (options?: { manual?: boolean }) => Promise<void>
  /** Marks the existing summary as stale (content changed). */
  markStale: () => void
  /** Controls the expanded/collapsed state of the summary accordion. */
  setExpanded: (expanded: boolean) => void
  /** ID of the currently active note, or `null`. */
  noteId: string | null
}

const StateContext = createContext<SummarizationState | null>(null)
const DispatchContext = createContext<Dispatch<SummarizationAction> | null>(
  null
)
const ActionsContext = createContext<SummarizationActions | null>(null)

/**
 * Provides the summarization state and dispatch contexts to the component tree.
 * Must wrap any component that uses {@link useSummarizationState} or
 * {@link useSummarizationDispatch}.
 */
export function SummarizationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(summarizationReducer, initialState)
  return (
    <StateContext value={state}>
      <DispatchContext value={dispatch}>{children}</DispatchContext>
    </StateContext>
  )
}

/** Props for the {@link SummarizationManager} component. */
interface SummarizationManagerProps {
  /** ID of the currently active note, or `null` when none is selected. */
  noteId: string | null
  /** Counter incremented each time the note is saved; drives auto-summarization. */
  saveCount: number
  /** Character length of the current note content. */
  contentLength: number
  children: ReactNode
}

/**
 * Renderless orchestrator that wires summarization hooks inside the Provider.
 * Provides action functions to descendant UI components via ActionsContext.
 */
export function SummarizationManager({
  noteId,
  saveCount,
  contentLength,
  children,
}: SummarizationManagerProps) {
  const { summarize, markStale, setExpanded, ...state } = useSummarization({
    noteId,
    contentLength,
  })

  useAutoSummarize({
    saveCount,
    enabled: !!noteId,
    available: state.available,
    isSummarizing: state.status === 'summarizing',
    onTrigger: summarize,
    onContentChange: markStale,
  })

  return (
    <ActionsContext value={{ summarize, markStale, setExpanded, noteId }}>
      {children}
    </ActionsContext>
  )
}

/**
 * Returns the current {@link SummarizationState} from context.
 *
 * @throws {Error} If called outside of a {@link SummarizationProvider}.
 */
export function useSummarizationState(): SummarizationState {
  const ctx = useContext(StateContext)
  if (!ctx)
    throw new Error(
      'useSummarizationState must be inside SummarizationProvider'
    )
  return ctx
}

/**
 * Returns the dispatch function for {@link SummarizationAction} from context.
 *
 * @throws {Error} If called outside of a {@link SummarizationProvider}.
 */
export function useSummarizationDispatch(): Dispatch<SummarizationAction> {
  const ctx = useContext(DispatchContext)
  if (!ctx)
    throw new Error(
      'useSummarizationDispatch must be inside SummarizationProvider'
    )
  return ctx
}

/**
 * Returns the {@link SummarizationActions} provided by {@link SummarizationManager}.
 *
 * @throws {Error} If called outside of a {@link SummarizationManager}.
 */
export function useSummarizationActions(): SummarizationActions {
  const ctx = useContext(ActionsContext)
  if (!ctx)
    throw new Error(
      'useSummarizationActions must be inside SummarizationManager'
    )
  return ctx
}
