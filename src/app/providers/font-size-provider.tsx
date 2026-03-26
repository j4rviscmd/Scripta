import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { useAppStore } from '@/app/providers/store-provider'
import {
  DEFAULT_FONT_SIZE,
  FONT_SIZE_STEP,
  FONT_SIZE_STORE_KEY,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
} from '@/features/editor/lib/fontSizeConfig'

/**
 * State exposed by the {@link FontSizeContext}.
 *
 * Consumed via the {@link useFontSize} hook.
 */
type FontSizeContextState = {
  fontSize: number
  setFontSize: (value: number) => void
  increase: () => void
  decrease: () => void
  reset: () => void
}

/**
 * React context holding the current font size state.
 *
 * @internal Use the {@link useFontSize} hook instead of accessing this directly.
 */
const FontSizeContext = createContext<FontSizeContextState | undefined>(
  undefined
)

/**
 * Provides editor font size state to the component tree.
 *
 * Persists the user's preference in tauri-plugin-store.
 *
 * @param props - Component props.
 * @param props.children - The component subtree that needs font size context.
 */
export function FontSizeProvider({ children }: { children: ReactNode }) {
  const { config: configStore } = useAppStore()
  const [fontSize, setFontSizeState] = useState(DEFAULT_FONT_SIZE)

  // Load persisted value on mount
  useEffect(() => {
    configStore
      .get<number>(FONT_SIZE_STORE_KEY)
      .then((stored) => {
        if (stored != null) {
          setFontSizeState(
            Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, stored))
          )
        }
      })
      .catch((err) => {
        console.error('Failed to load editorFontSize:', err)
      })
  }, [configStore])

  const setFontSize = useCallback(
    (value: number) => {
      const clamped = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, value))
      setFontSizeState(clamped)
      configStore.set(FONT_SIZE_STORE_KEY, clamped).catch((err) => {
        console.error('Failed to persist editorFontSize:', err)
      })
    },
    [configStore]
  )

  const increase = useCallback(() => {
    setFontSizeState((prev) => {
      const next = Math.min(MAX_FONT_SIZE, prev + FONT_SIZE_STEP)
      configStore.set(FONT_SIZE_STORE_KEY, next).catch((err) => {
        console.error('Failed to persist editorFontSize:', err)
      })
      return next
    })
  }, [configStore])

  const decrease = useCallback(() => {
    setFontSizeState((prev) => {
      const next = Math.max(MIN_FONT_SIZE, prev - FONT_SIZE_STEP)
      configStore.set(FONT_SIZE_STORE_KEY, next).catch((err) => {
        console.error('Failed to persist editorFontSize:', err)
      })
      return next
    })
  }, [configStore])

  const reset = useCallback(() => {
    setFontSize(DEFAULT_FONT_SIZE)
  }, [setFontSize])

  const value = { fontSize, setFontSize, increase, decrease, reset }

  return (
    <FontSizeContext.Provider value={value}>
      {children}
    </FontSizeContext.Provider>
  )
}

/**
 * Hook to access the current editor font size and change it.
 *
 * Must be called from a component rendered inside a {@link FontSizeProvider}.
 *
 * @returns An object containing:
 *   - `fontSize` — Current font size in pixels.
 *   - `setFontSize` — Sets an arbitrary font size (clamped to the allowed range).
 *   - `increase` — Increments font size by one step.
 *   - `decrease` — Decrements font size by one step.
 *   - `reset` — Resets font size to the default value.
 *
 * @throws {Error} If used outside of a `<FontSizeProvider>`.
 */
export function useFontSize() {
  const context = useContext(FontSizeContext)
  if (context === undefined) {
    throw new Error('useFontSize must be used within a FontSizeProvider')
  }
  return context
}
