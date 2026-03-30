import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { useAppStore } from '@/app/providers/store-provider'
import { splashFadingPromise } from '@/features/splash'

/** Supported theme modes. `"system"` resolves to the OS preference at runtime. */
export type Theme = 'dark' | 'light' | 'system'

/** Props for the {@link ThemeProvider} component. */
type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
}

/**
 * State exposed by the {@link ThemeProviderContext}.
 *
 * Consumed via the `{@link useTheme}` hook.
 */
type ThemeProviderState = {
  theme: Theme
  resolvedTheme: 'dark' | 'light'
  setTheme: (theme: Theme) => void
}

/**
 * React context holding the current theme state.
 *
 * @internal Use the `{@link useTheme}` hook instead of accessing this directly.
 */
const ThemeProviderContext = createContext<ThemeProviderState | undefined>(
  undefined
)

/**
 * Provides theme state (light / dark / system) to the component tree.
 *
 * Applies the resolved theme as a `.dark` or `.light` class on the
 * document root element and persists the user's preference in
 * tauri-plugin-store.  Listens for OS-level `prefers-color-scheme` changes
 * so the resolved theme stays in sync when `"system"` is selected.
 *
 * Also synchronises the Tauri native window decoration (title bar) via
 * `getCurrentWindow().setTheme()`.  When the user selects `"system"`, `null`
 * is passed so the OS controls the window chrome directly; explicit
 * `"light"` or `"dark"` selections override the OS for the window as well.
 *
 * @param props - Component props.
 * @param props.children - The component subtree that needs theme context.
 * @param props.defaultTheme - The initial theme value before a persisted preference is loaded. Defaults to `"system"`.
 *
 * @example
 * ```tsx
 * <ThemeProvider defaultTheme="system">
 *   <App />
 * </ThemeProvider>
 * ```
 */
export function ThemeProvider({
  children,
  defaultTheme = 'system',
}: ThemeProviderProps) {
  const { config: configStore } = useAppStore()
  const [theme, setThemeState] = useState<Theme>(defaultTheme)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  const [canApplyTheme, setCanApplyTheme] = useState(false)

  // Wait for the splash screen to start fading before applying theme to DOM.
  // <html class="dark"> is set in index.html, so the splash always renders
  // with a dark background regardless of the user's theme preference.
  useEffect(() => {
    splashFadingPromise.finally(() => setCanApplyTheme(true))
  }, [])

  // Load persisted theme from the store on first mount.
  useEffect(() => {
    configStore
      .get<string>('theme')
      .then((stored) => {
        if (stored) setThemeState(stored as Theme)
      })
      .catch((err) => {
        console.error('Failed to load theme:', err)
      })
  }, [configStore])

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  const resolvedTheme =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    if (!canApplyTheme) return
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolvedTheme)

    // Sync the Tauri native window decoration (title bar) to match.
    // Pass null for "system" so the OS controls the window chrome directly;
    // explicit light/dark selections override it.
    getCurrentWindow()
      .setTheme(theme === 'system' ? null : resolvedTheme)
      .catch((err) => {
        console.error('Failed to set window theme:', err)
      })
  }, [theme, resolvedTheme, canApplyTheme])

  const handleSetTheme = useCallback(
    (t: Theme) => {
      setThemeState(t)
      configStore.set('theme', t).catch((err) => {
        console.error('Failed to persist theme:', err)
      })
    },
    [configStore]
  )

  const value = { theme, resolvedTheme, setTheme: handleSetTheme }

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

/**
 * Hook to access the current theme, resolved theme, and change it.
 *
 * Must be called from a component rendered inside a `{@link ThemeProvider}`.
 *
 * @returns An object containing:
 *   - `theme` — The user-selected theme (`"dark"`, `"light"`, or `"system"`).
 *   - `resolvedTheme` — The effective theme after system resolution (`"dark"` or `"light"`).
 *   - `setTheme` — Callback to update the theme preference (persisted to store automatically).
 *
 * @throws {Error} If used outside of a `<ThemeProvider>`.
 *
 * @example
 * ```tsx
 * const { theme, resolvedTheme, setTheme } = useTheme();
 * setTheme("dark");
 * ```
 */
export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider')

  return context
}
