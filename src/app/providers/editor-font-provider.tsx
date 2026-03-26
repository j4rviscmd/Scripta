import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/app/providers/store-provider'
import type { GoogleFontEntry } from '@/data/googleFonts'
import {
  DEFAULT_EDITOR_FONT,
  DEFAULT_EDITOR_FONT_LABEL,
  EDITOR_FONT_STORE_KEY,
  GOOGLE_FONTS_CSS_BASE,
} from '@/features/settings/lib/editorFontConfig'

type EditorFontContextState = {
  fontFamily: string
  fontLabel: string
  setEditorFont: (font: GoogleFontEntry | null) => void
  reset: () => void
  isLoadingFont: boolean
}

const EditorFontContext = createContext<EditorFontContextState | undefined>(
  undefined
)

/**
 * Injects a `<link>` element for the given Google Fonts CSS URL into
 * `<head>`. If a link for the same URL already exists, does nothing.
 */
function injectFontLink(cssUrl: string) {
  if (document.querySelector(`link[href="${CSS.escape(cssUrl)}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = cssUrl
  document.head.appendChild(link)
}

/**
 * Builds the Google Fonts CSS API URL for a given font family.
 *
 * Includes regular (400) and bold (700) weights for the font.
 * Variable fonts are automatically handled by the API.
 */
function buildFontCssUrl(family: string): string {
  const encoded = family.replace(/ /g, '+')
  return `${GOOGLE_FONTS_CSS_BASE}?family=${encoded}:wght@400;700&display=swap`
}

/**
 * Provides editor font family state to the component tree.
 *
 * When a custom font is selected, it loads the font via the Google Fonts
 * CSS API and exposes the font family for the editor to consume via
 * the `--editor-font-family` CSS custom property.
 *
 * @param props - Component props.
 * @param props.children - The component subtree that needs font context.
 */
export function EditorFontProvider({ children }: { children: ReactNode }) {
  const { config: configStore } = useAppStore()
  const [fontFamily, setFontFamily] = useState(DEFAULT_EDITOR_FONT)
  const [fontLabel, setFontLabel] = useState(DEFAULT_EDITOR_FONT_LABEL)
  const [isLoadingFont, setIsLoadingFont] = useState(false)
  const prevFontRef = useRef({
    family: DEFAULT_EDITOR_FONT,
    label: DEFAULT_EDITOR_FONT_LABEL,
  })

  const updateFont = useCallback((family: string, label: string) => {
    setFontFamily(family)
    setFontLabel(label)
    prevFontRef.current = { family, label }
  }, [])

  const persistFont = useCallback(
    async (family: string) => {
      try {
        await configStore.set(EDITOR_FONT_STORE_KEY, family)
      } catch (err) {
        console.error('Failed to persist editorFontFamily:', err)
      }
    },
    [configStore]
  )

  const deleteFontStore = useCallback(async () => {
    try {
      await configStore.delete(EDITOR_FONT_STORE_KEY)
    } catch (err) {
      console.error('Failed to delete editorFontFamily:', err)
    }
  }, [configStore])

  useEffect(() => {
    ;(async () => {
      try {
        const stored = await configStore.get<string>(EDITOR_FONT_STORE_KEY)
        if (stored) {
          injectFontLink(buildFontCssUrl(stored))
          updateFont(`'${stored}', sans-serif`, stored)
        }
      } catch (err) {
        console.error('Failed to load editorFontFamily:', err)
      }
    })()
  }, [configStore, updateFont])

  const setEditorFont = useCallback(
    (font: GoogleFontEntry | null) => {
      if (!font) {
        updateFont(DEFAULT_EDITOR_FONT, DEFAULT_EDITOR_FONT_LABEL)
        deleteFontStore()
        return
      }

      const cssUrl = buildFontCssUrl(font.family)
      const prev = prevFontRef.current
      setIsLoadingFont(true)

      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = cssUrl
      link.onload = () => setIsLoadingFont(false)
      link.onerror = () => {
        setIsLoadingFont(false)
        updateFont(prev.family, prev.label)
        toast.error(`Failed to load font "${font.family}"`)
      }
      document.head.appendChild(link)

      updateFont(`'${font.family}', sans-serif`, font.family)
      persistFont(font.family)
    },
    [deleteFontStore, persistFont, updateFont]
  )

  const reset = useCallback(() => {
    setEditorFont(null)
  }, [setEditorFont])

  return (
    <EditorFontContext.Provider
      value={{ fontFamily, fontLabel, setEditorFont, reset, isLoadingFont }}
    >
      {children}
    </EditorFontContext.Provider>
  )
}

/**
 * Hook to access the current editor font state and change it.
 *
 * Must be called from a component rendered inside an {@link EditorFontProvider}.
 *
 * @returns An object containing:
 *   - `fontFamily` — Current CSS `font-family` value.
 *   - `fontLabel` — Human-readable font name for display in the UI.
 *   - `setEditorFont` — Selects a font (pass `null` to reset).
 *   - `reset` — Resets to the default Geist Variable font.
 *   - `isLoadingFont` — Whether a font is currently being loaded.
 *
 * @throws {Error} If used outside of an `<EditorFontProvider>`.
 */
export function useEditorFont() {
  const context = useContext(EditorFontContext)
  if (context === undefined) {
    throw new Error('useEditorFont must be used within an EditorFontProvider')
  }
  return context
}
