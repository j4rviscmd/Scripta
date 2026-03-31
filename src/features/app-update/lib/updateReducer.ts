/**
 * Pure reducer and type definitions for the app-update state machine.
 *
 * The lifecycle is linear with a few branches:
 * idle → checking → available | upToDate | error
 * available → downloading → installing → restarting
 *
 * @module features/app-update/lib/updateReducer
 */

/**
 * Discriminated union of all possible update lifecycle phases.
 *
 * Used as the `status` field in {@link UpdateState} to drive the UI
 * and guard state transitions in the reducer.
 */
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'upToDate'
  | 'downloading'
  | 'installing'
  | 'restarting'
  | 'error'

/**
 * Discriminated union representing the complete update state.
 *
 * Each variant carries only the data relevant to its phase—e.g.
 * `available` includes `version`, `body`, and `date`, while
 * `downloading` tracks byte progress.
 */
export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string; body: string; date: string }
  | { status: 'upToDate' }
  | {
      status: 'downloading'
      version: string
      body: string
      downloaded: number
      total: number
    }
  | { status: 'installing'; version: string }
  | { status: 'restarting' }
  | { status: 'error'; message: string }

/**
 * Union of all actions the update reducer can process.
 *
 * Each action triggers a guarded state transition—dispatching an
 * action from an unexpected state is a no-op (the reducer returns
 * the current state unchanged).
 */
export type UpdateAction =
  | { type: 'CHECK_START' }
  | { type: 'UPDATE_AVAILABLE'; version: string; body: string; date: string }
  | { type: 'UP_TO_DATE' }
  | { type: 'DOWNLOAD_START' }
  | { type: 'DOWNLOAD_PROGRESS'; downloaded: number; total: number }
  | { type: 'INSTALL_START' }
  | { type: 'RESTART' }
  | { type: 'ERROR'; message: string }
  | { type: 'DISMISS' }

/** Starting state for the update state machine (no check in progress). */
export const INITIAL_STATE: UpdateState = { status: 'idle' }

/**
 * Pure reducer that drives the app-update state machine.
 *
 * All transitions are guarded: an action dispatched from an
 * unexpected state returns the current state unchanged, making
 * the reducer safe to call at any time.
 *
 * @param state  - The current update state.
 * @param action - The action describing the requested transition.
 * @returns The next update state.
 */
export function updateReducer(
  state: UpdateState,
  action: UpdateAction
): UpdateState {
  switch (action.type) {
    case 'CHECK_START':
      if (state.status === 'idle' || state.status === 'error') {
        return { status: 'checking' }
      }
      return state

    case 'UPDATE_AVAILABLE':
      if (state.status === 'checking') {
        return {
          status: 'available',
          version: action.version,
          body: action.body,
          date: action.date,
        }
      }
      return state

    case 'UP_TO_DATE':
      if (state.status === 'checking') {
        return { status: 'upToDate' }
      }
      return state

    case 'DOWNLOAD_START':
      if (state.status === 'available') {
        return {
          status: 'downloading',
          version: state.version,
          body: state.body,
          downloaded: 0,
          total: 0,
        }
      }
      return state

    case 'DOWNLOAD_PROGRESS':
      if (state.status === 'downloading') {
        return {
          ...state,
          downloaded: action.downloaded,
          total: action.total,
        }
      }
      return state

    case 'INSTALL_START':
      if (state.status === 'downloading') {
        return { status: 'installing', version: state.version }
      }
      return state

    case 'RESTART':
      if (state.status === 'installing') {
        return { status: 'restarting' }
      }
      return state

    case 'ERROR':
      if (
        state.status === 'checking' ||
        state.status === 'downloading' ||
        state.status === 'installing'
      ) {
        return { status: 'error', message: action.message }
      }
      return state

    case 'DISMISS':
      if (
        state.status === 'checking' ||
        state.status === 'available' ||
        state.status === 'upToDate' ||
        state.status === 'error'
      ) {
        return { status: 'idle' }
      }
      return state

    default:
      return state
  }
}
