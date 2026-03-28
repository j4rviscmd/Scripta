/**
 * Triggers an automatic update check on mount.
 *
 * Runs a non-blocking background network request immediately.
 * Suppresses UI feedback when no update is found.
 *
 * @module features/app-update/hooks
 */

import { useEffect } from 'react'
import { useAppUpdate } from '@/app/providers/update-provider'

/**
 * Fires a non-blocking update check when the component mounts.
 *
 * Intended to be called once from the root application component so
 * that available updates are detected at startup. The check runs in
 * "auto" mode (`manual: false`), which means:
 * - No UI feedback is shown when the app is already up to date.
 * - A skipped version is silently suppressed.
 * - Network errors are logged but not surfaced to the user.
 */
export function useUpdateCheckOnLaunch() {
  const { checkForUpdate } = useAppUpdate()

  useEffect(() => {
    checkForUpdate({ manual: false }).catch((err) => {
      console.error('Startup update check failed:', err)
    })
  }, [checkForUpdate])
}
