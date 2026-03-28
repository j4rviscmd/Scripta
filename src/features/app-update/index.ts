/**
 * App-update feature public API.
 *
 * @module features/app-update
 */

export { useUpdateCheckOnLaunch } from './hooks'
export { SKIPPED_VERSION_STORE_KEY } from './lib/updateConfig'
export type {
  UpdateAction,
  UpdateState,
  UpdateStatus,
} from './lib/updateReducer'
export { UpdateDialog } from './ui/UpdateDialog'
