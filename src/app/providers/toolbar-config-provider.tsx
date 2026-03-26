/**
 * Provider for the FormattingToolbar item configuration.
 *
 * Exposes reactive state for the toolbar item order and visibility,
 * consumed by both the Settings UI and the Editor component.
 * Persists changes to `config.json` via `tauri-plugin-store`.
 *
 * Follows the same pattern as {@link FontSizeProvider}.
 *
 * @module app/providers/toolbar-config-provider
 */

import { arrayMove } from '@dnd-kit/sortable'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { configDefaults, useAppStore } from '@/app/providers/store-provider'
import {
  DEFAULT_TOOLBAR_CONFIG,
  TOOLBAR_CONFIG_STORE_KEY,
  type ToolbarItemConfig,
  validateToolbarConfig,
} from '@/features/settings/lib/toolbarConfig'

/**
 * State exposed by the {@link ToolbarConfigContext}.
 *
 * Consumed via the {@link useToolbarConfig} hook.
 */
interface ToolbarConfigContextState {
  /** Current ordered list of toolbar items with visibility flags. */
  items: ToolbarItemConfig[]
  /** Reorder items by moving an item from one index to another. */
  reorder: (fromIndex: number, toIndex: number) => void
  /** Toggle visibility of a single item by key. */
  toggleVisibility: (key: string) => void
  /** Reset to default layout (all visible, canonical order). */
  reset: () => void
  /** Whether the current layout differs from the default. */
  isCustomized: boolean
}

/**
 * React context holding the toolbar configuration state.
 *
 * @internal Use the {@link useToolbarConfig} hook instead.
 */
const ToolbarConfigContext = createContext<
  ToolbarConfigContextState | undefined
>(undefined)

/**
 * Provides toolbar item configuration state to the component tree.
 *
 * Persists the user's preference in `tauri-plugin-store` under the
 * `formattingToolbarConfig` key.
 *
 * @param props - Component props.
 * @param props.children - The component subtree that needs access to the toolbar config.
 */
export function ToolbarConfigProvider({ children }: { children: ReactNode }) {
  const { config: configStore } = useAppStore()
  const [items, setItems] = useState<ToolbarItemConfig[]>(
    configDefaults.toolbarConfig
  )

  useEffect(() => {
    configStore
      .get<ToolbarItemConfig[]>(TOOLBAR_CONFIG_STORE_KEY)
      .then((stored) => {
        if (stored && Array.isArray(stored)) {
          setItems(validateToolbarConfig(stored))
        }
      })
      .catch((err) => {
        console.error('Failed to load toolbar config:', err)
      })
  }, [configStore])

  const persist = useCallback(
    (next: ToolbarItemConfig[]) => {
      setItems(next)
      configStore.set(TOOLBAR_CONFIG_STORE_KEY, next).catch((err) => {
        console.error('Failed to persist toolbar config:', err)
      })
    },
    [configStore]
  )

  const reorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      setItems((prev) => {
        const next = arrayMove(prev, fromIndex, toIndex)
        configStore.set(TOOLBAR_CONFIG_STORE_KEY, next).catch((err) => {
          console.error('Failed to persist toolbar config:', err)
        })
        return next
      })
    },
    [configStore]
  )

  const toggleVisibility = useCallback(
    (key: string) => {
      setItems((prev) => {
        const next = prev.map((item) =>
          item.key === key ? { ...item, visible: !item.visible } : item
        )
        configStore.set(TOOLBAR_CONFIG_STORE_KEY, next).catch((err) => {
          console.error('Failed to persist toolbar config:', err)
        })
        return next
      })
    },
    [configStore]
  )

  const reset = useCallback(() => {
    persist(DEFAULT_TOOLBAR_CONFIG.map((item) => ({ ...item })))
  }, [persist])

  const isCustomized = useMemo(
    () => JSON.stringify(items) !== JSON.stringify(DEFAULT_TOOLBAR_CONFIG),
    [items]
  )

  const value = useMemo(
    () => ({ items, reorder, toggleVisibility, reset, isCustomized }),
    [items, reorder, toggleVisibility, reset, isCustomized]
  )

  return (
    <ToolbarConfigContext.Provider value={value}>
      {children}
    </ToolbarConfigContext.Provider>
  )
}

/**
 * Hook to access the toolbar item configuration.
 *
 * Must be called from a component rendered inside a
 * {@link ToolbarConfigProvider}.
 *
 * @returns An object containing:
 *   - `items` — Current ordered list of toolbar items.
 *   - `reorder` — Moves an item from one position to another.
 *   - `toggleVisibility` — Toggles an item's visibility.
 *   - `reset` — Resets to the default layout.
 *   - `isCustomized` — Whether the layout differs from the default.
 *
 * @throws {Error} If used outside of a `<ToolbarConfigProvider>`.
 */
export function useToolbarConfig() {
  const context = useContext(ToolbarConfigContext)
  if (context === undefined) {
    throw new Error(
      'useToolbarConfig must be used within a ToolbarConfigProvider'
    )
  }
  return context
}
