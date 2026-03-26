import { useCallback, useState } from 'react'
import { configDefaults, useAppStore } from '@/app/providers/store-provider'
import { WINDOW_STATE_STORE_KEY } from '../lib/windowStateConfig'

/**
 * Manages the window-state restore toggle setting.
 *
 * Reads the initial value from the pre-fetched {@link configDefaults}
 * (populated during store initialization) and persists changes to
 * `configStore` immediately.
 *
 * The setting only takes effect on the **next** app launch — toggling
 * it does not move or resize the current window.
 *
 * @returns An object containing:
 *   - `enabled` — Whether window position/size restore is active.
 *   - `setEnabled` — Toggles the flag and persists the change.
 */
export function useWindowState() {
  const { config: configStore } = useAppStore()
  const [enabled, setEnabledState] = useState(
    configDefaults.windowStateRestoreEnabled
  )

  const setEnabled = useCallback(
    (value: boolean) => {
      setEnabledState(value)
      configStore.set(WINDOW_STATE_STORE_KEY, value).catch((err) => {
        console.error('Failed to persist windowStateRestoreEnabled:', err)
      })
    },
    [configStore]
  )

  return { enabled, setEnabled }
}
