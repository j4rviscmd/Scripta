import { LazyStore } from '@tauri-apps/plugin-store'
import {
  restoreStateCurrent,
  StateFlags,
} from '@tauri-apps/plugin-window-state'
import { createContext, type ReactNode, use, useContext } from 'react'
import type { Theme } from '@/app/providers/theme-provider'
import {
  DEFAULT_TOOLBAR_CONFIG,
  TOOLBAR_CONFIG_STORE_KEY,
  type ToolbarItemConfig,
  validateToolbarConfig,
} from '@/features/settings/lib/toolbarConfig'
import {
  DEFAULT_WINDOW_STATE_RESTORE,
  WINDOW_STATE_STORE_KEY,
} from '@/features/settings/lib/windowStateConfig'

/**
 * Module-scoped singleton store instances.
 *
 * - `configStore` — persistent application settings (e.g. theme, UI preferences).
 * - `editorStateStore` — transient editor state such as scroll positions and header visibility.
 */
const configStore = new LazyStore('config.json')
const editorStateStore = new LazyStore('editor-state.json')

/**
 * Pre-fetched config defaults, populated during store initialization.
 *
 * Because these values are loaded inside {@link initPromise} (which is
 * awaited by {@link StoreProvider} via `React.use()`), any component
 * rendered below the `<Suspense>` boundary can read them synchronously
 * in their `useState` initializers — avoiding the flash of a wrong
 * default value.
 */
export const configDefaults = {
  /** Whether the sidebar is open. Falls back to `true` if not persisted. */
  sidebarOpen: true,
  /** Whether to restore window position & size on launch. Falls back to `true` if not persisted. */
  windowStateRestoreEnabled: DEFAULT_WINDOW_STATE_RESTORE,
  /** User-selected theme. Falls back to `"system"` if not persisted. */
  theme: 'system' as Theme,
  /** Toolbar item order and visibility. Falls back to all-visible canonical order. */
  toolbarConfig: DEFAULT_TOOLBAR_CONFIG as ToolbarItemConfig[],
}

/**
 * Promise that resolves when all stores have been loaded from disk and
 * config defaults have been pre-fetched.
 *
 * Consumed internally by {@link StoreProvider} via `React.use()` and
 * externally by the splash screen to coordinate its dismissal timing.
 */
export const storeInitPromise = Promise.all([
  configStore.init(),
  editorStateStore.init(),
]).then(async () => {
  const [storedSidebarOpen, storedWindowRestore, storedTheme, storedToolbar] =
    await Promise.all([
      configStore.get<boolean>('sidebarOpen'),
      configStore.get<boolean>(WINDOW_STATE_STORE_KEY),
      configStore.get<string>('theme'),
      configStore.get<ToolbarItemConfig[]>(TOOLBAR_CONFIG_STORE_KEY),
    ])
  if (storedSidebarOpen != null) {
    configDefaults.sidebarOpen = storedSidebarOpen
  }
  const validThemes = new Set<Theme>(['dark', 'light', 'system'])
  if (storedTheme && validThemes.has(storedTheme as Theme)) {
    configDefaults.theme = storedTheme as Theme
  }
  if (storedToolbar && Array.isArray(storedToolbar)) {
    configDefaults.toolbarConfig = validateToolbarConfig(storedToolbar)
  }
  const restoreEnabled = storedWindowRestore ?? DEFAULT_WINDOW_STATE_RESTORE
  configDefaults.windowStateRestoreEnabled = restoreEnabled
  if (restoreEnabled) {
    try {
      await restoreStateCurrent(StateFlags.POSITION | StateFlags.SIZE)
    } catch (err) {
      console.error('Failed to restore window state:', err)
    }
  }
})

/**
 * React context holding initialized store instances.
 *
 * @internal Use {@link useAppStore} to consume this context.
 */
const StoreContext = createContext<{
  config: LazyStore
  editorState: LazyStore
} | null>(null)

/**
 * Provides initialized store instances to the component tree.
 *
 * Internally uses `React.use()` to suspend rendering until all store
 * files have been loaded from disk. Wrap this component with a
 * `<Suspense>` boundary to handle the loading state.
 *
 * @param props - Component props.
 * @param props.children - The component subtree that needs access to the stores.
 *
 * @example
 * ```tsx
 * <Suspense fallback={<Loading />}>
 *   <StoreProvider>
 *     <App />
 *   </StoreProvider>
 * </Suspense>
 * ```
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  use(storeInitPromise)

  return (
    <StoreContext.Provider
      value={{ config: configStore, editorState: editorStateStore }}
    >
      {children}
    </StoreContext.Provider>
  )
}

/**
 * Returns the map of initialized store instances.
 *
 * Must be called from a component rendered inside a `{@link StoreProvider}`.
 * Throws if the context is unavailable.
 *
 * @returns An object with `config` and `editorState` store instances.
 * @throws {Error} If used outside of a `<StoreProvider>`.
 *
 * @example
 * ```tsx
 * const { config, editorState } = useAppStore();
 * const theme = await config.get<string>("theme");
 * ```
 */
export function useAppStore() {
  const stores = useContext(StoreContext)
  if (!stores) {
    throw new Error('useAppStore must be used within a StoreProvider')
  }
  return stores
}
