/**
 * Thin wrappers around Tauri updater and process plugins.
 *
 * Isolates native API calls for mockability and keeps plugin
 * imports in one place.
 *
 * @module features/app-update/api
 */

import { relaunch } from '@tauri-apps/plugin-process'
import { check } from '@tauri-apps/plugin-updater'

export type { Update } from '@tauri-apps/plugin-updater'

/** Maximum time (ms) to wait for the updater API before aborting. */
const CHECK_TIMEOUT_MS = 10_000

/**
 * Checks for available application updates with a timeout guard.
 *
 * Wraps the Tauri updater `check()` call in a `Promise.race` against
 * a timeout so the caller is never blocked indefinitely by a slow or
 * unreachable update server.
 *
 * @returns The `Update` object describing the available release, or
 *   `null` when the app is already up to date.
 * @throws {Error} If the check times out or the network request fails.
 */
export async function checkForAppUpdate() {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      check(),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Update check timed out')),
          CHECK_TIMEOUT_MS
        )
      }),
    ])
    return result
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

/**
 * Restarts the application after an update has been installed.
 *
 * Delegates to the Tauri process plugin's `relaunch()` command.
 */
export async function relaunchApp() {
  await relaunch()
}
