import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import { configDefaults, useAppStore } from '@/app/providers/store-provider'
import { WINDOW_TITLE_PREFIX_STORE_KEY } from '@/features/settings/lib/windowTitleConfig'

interface WindowTitlePrefixState {
  enabled: boolean
  setEnabled: (value: boolean) => void
}

const WindowTitlePrefixContext = createContext<
  WindowTitlePrefixState | undefined
>(undefined)

/**
 * Provides the window-title prefix toggle state to the component tree.
 *
 * Reads the initial value from the pre-fetched {@link configDefaults}
 * and persists changes to `configStore` immediately. All consumers
 * sharing this context see the same value in real time.
 *
 * @param props.children - The component subtree that needs access.
 * @param props.defaultEnabled - Initial value from pre-fetched config.
 */
export function WindowTitlePrefixProvider({
  children,
  defaultEnabled = configDefaults.windowTitlePrefixEnabled,
}: {
  children: ReactNode
  defaultEnabled?: boolean
}) {
  const { config: configStore } = useAppStore()
  const [enabled, setEnabledState] = useState(defaultEnabled)

  const setEnabled = useCallback(
    (value: boolean) => {
      setEnabledState(value)
      configStore.set(WINDOW_TITLE_PREFIX_STORE_KEY, value).catch((err) => {
        console.error('Failed to persist windowTitlePrefixEnabled:', err)
      })
    },
    [configStore]
  )

  const value = useMemo(
    () => ({ enabled, setEnabled }),
    [enabled, setEnabled]
  )

  return (
    <WindowTitlePrefixContext.Provider value={value}>
      {children}
    </WindowTitlePrefixContext.Provider>
  )
}

/**
 * Returns the window-title prefix toggle state.
 *
 * Must be called from a component inside a {@link WindowTitlePrefixProvider}.
 *
 * @returns An object containing:
 *   - `enabled` — Whether the "Scripta - " prefix is shown.
 *   - `setEnabled` — Toggles the flag and persists the change.
 */
export function useWindowTitlePrefix() {
  const ctx = useContext(WindowTitlePrefixContext)
  if (!ctx) {
    throw new Error(
      'useWindowTitlePrefix must be used within a WindowTitlePrefixProvider'
    )
  }
  return ctx
}
