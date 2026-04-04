import { getCurrentWindow } from '@tauri-apps/api/window'
import { open, save } from '@tauri-apps/plugin-dialog'
import { Languages } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { EditorFontProvider } from '@/app/providers/editor-font-provider'
import {
  FontSizeProvider,
  useFontSize,
} from '@/app/providers/font-size-provider'
import { configDefaults, useAppStore } from '@/app/providers/store-provider'
import { ThemeProvider } from '@/app/providers/theme-provider'
import { ToolbarConfigProvider } from '@/app/providers/toolbar-config-provider'
import { UpdateProvider } from '@/app/providers/update-provider'
import {
  useWindowTitlePrefix,
  WindowTitlePrefixProvider,
} from '@/app/providers/window-title-prefix-provider'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { UpdateDialog, useUpdateCheckOnLaunch } from '@/features/app-update'
import type { EditorHandle, SaveStatus } from '@/features/editor'
import {
  createNote,
  DEFAULT_CONTENT,
  deleteNote,
  duplicateNote,
  Editor,
  exportToMarkdown,
  extractTitle,
  fixBlockNoteTableExport,
  getNote,
  listNotes,
  parseMarkdownWithColumns,
  readTextFile,
  toggleLockNote,
  togglePinNote,
  useCommandPaletteScroll,
  useCursorAutoHideEffect,
  writeTextFile,
} from '@/features/editor'
import { commandPaletteScrollConfig } from '@/features/editor/lib/commandPaletteScrollConfig'
import { NoteSidebar } from '@/features/sidebar'
import {
  SummarizationManager,
  SummarizationProvider,
  SummarizeButton,
  SummaryAccordion,
} from '@/features/summarization'
import {
  collectTranslatableBlockIds,
  commitTranslation,
  DEFAULT_SOURCE_LANG,
  DEFAULT_TARGET_LANG,
  detectLanguage,
  isMacos,
  isTranslationAvailable,
  StyleCounters,
  TRANSLATION_SOURCE_LANG_KEY,
  TRANSLATION_TARGET_LANG_KEY,
  TranslationIndicator,
  type TranslationStreamEvent,
  translateBlocksStreaming,
  updateBlockTextByIndex,
} from '@/features/translation'
import { cn } from '@/lib/utils'
import { useBlockScrollMemory } from '@/shared/hooks/useBlockScrollMemory'
import { useCursorMemory } from '@/shared/hooks/useCursorMemory'
import { useScrollDirection } from '@/shared/hooks/useScrollDirection'
import { useScrollIsolation } from '@/shared/hooks/useScrollIsolation'
import { useScrollPosition } from '@/shared/hooks/useScrollPosition'
import { CopyablePath } from '@/shared/ui/CopyablePath'
import { ModeToggle } from '@/shared/ui/ModeToggle'
import { SaveStatusIndicator } from '@/shared/ui/SaveStatusIndicator'
import { ScrollToTopButton } from '@/shared/ui/ScrollToTopButton'

/** Computes approximate plaintext length from BlockNote editor document. */
function computeEditorTextLength(
  editorRef: React.RefObject<{ editor: { document: any[] } } | null>
): number {
  const editor = editorRef.current?.editor
  if (!editor) return 0
  let len = 0
  const walk = (blocks: typeof editor.document) => {
    for (const block of blocks) {
      if (block.content && Array.isArray(block.content)) {
        for (const inline of block.content) {
          if ('text' in inline && typeof inline.text === 'string') {
            len += inline.text.length
          }
        }
      }
      if (block.children?.length) walk(block.children)
    }
  }
  walk(editor.document)
  return len
}

/**
 * Root application component.
 *
 * Orchestrates note selection, CRUD operations, and the overall layout
 * including the sidebar, header, editor, and scroll management. Persists
 * the last-opened note ID and sidebar visibility to `tauri-plugin-store`.
 */
function AppContent() {
  const { config: configStore, editorState: editorStore } = useAppStore()
  const { increase: increaseFontSize, decrease: decreaseFontSize } =
    useFontSize()
  // Initialises commandPaletteScrollConfig from the persisted store on mount.
  useCommandPaletteScroll()
  // Registers global mouse listeners that hide the cursor after inactivity.
  // Reads cursorAutoHideConfig directly so settings changes from the UI
  // take effect immediately without re-mounting.
  useCursorAutoHideEffect()
  /** Whether the app is running on macOS. Determines visibility of translation UI. */
  const [isMacOS, setIsMacOS] = useState(false)
  /** Whether Apple Intelligence translation is available (requires macOS 26+). */
  const [translationAvailable, setTranslationAvailable] = useState(false)
  useEffect(() => {
    isMacos()
      .then(setIsMacOS)
      .catch(() => setIsMacOS(false))
    isTranslationAvailable()
      .then(setTranslationAvailable)
      .catch(() => setTranslationAvailable(false))
  }, [])
  useUpdateCheckOnLaunch()
  const { enabled: titlePrefixEnabled } = useWindowTitlePrefix()
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  // True once the persisted lastNoteId has been loaded from the store.
  // Prevents the window title from flashing "Untitled" before the stored
  // note ID is available.
  const [noteIdInitialized, setNoteIdInitialized] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(configDefaults.sidebarOpen)
  const [refreshKey, setRefreshKey] = useState(0)
  /** Counter bumped on each auto-save so useAutoSummarize can debounce. */
  const [saveCount, setSaveCount] = useState(0)
  /** Approximate plaintext length of the current note, updated on each save. */
  const [contentLength, setContentLength] = useState(0)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  /**
   * Shared state for the in-place streaming translation feature.
   *
   * - `visible` — whether the {@link TranslationIndicator} overlay is shown.
   * - `originalBlocks` — a deep-clone of the editor document captured before
   *   translation; used as the base for re-translation with different languages.
   * - `sourceLang` — BCP-47 code of the source language used in the last run.
   * - `targetLang` — BCP-47 code of the target language used in the last run.
   * - `detectedLang` — language code detected by {@link detectLanguage} when
   *   `sourceLang` is `"auto"`; empty string when detection has not run.
   * - `progress` — current streaming progress (`completed`/`total` block count),
   *   or `null` when no translation is in progress.
   */
  const [translationState, setTranslationState] = useState<{
    visible: boolean
    originalBlocks: any[] | null
    sourceLang: string
    targetLang: string
    detectedLang: string
    progress: { completed: number; total: number } | null
  }>({
    visible: false,
    originalBlocks: null,
    sourceLang: DEFAULT_SOURCE_LANG,
    targetLang: DEFAULT_TARGET_LANG,
    detectedLang: '',
    progress: null,
  })
  /**
   * The ID of a note that is queued for translation but whose editor content
   * has not yet been loaded.  When set, {@link handleContentLoaded} will
   * trigger `handleTranslateNote` via a microtask immediately after the editor
   * has finished rendering the note, ensuring translation is the first entry
   * on the ProseMirror undo stack.
   */
  const [pendingTranslationId, setPendingTranslationId] = useState<
    string | null
  >(null)
  /**
   * Stable ref kept in sync with the latest `handleTranslateNote` callback.
   * Allows {@link handleContentLoaded} to call the handler without capturing
   * a stale closure, avoiding forward-declaration issues between the two hooks.
   */
  const translateNoteHandlerRef = useRef<
    ((noteId: string) => Promise<void>) | undefined
  >(undefined)
  const [isNoteLocked, setIsNoteLocked] = useState(false)
  const editorRef = useRef<EditorHandle>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const { isHidden: isHeaderHidden } = useScrollDirection(scrollContainerRef, {
    noteId: selectedNoteId,
  })
  const isScrolledDown = useScrollPosition(scrollContainerRef)
  const { onContentLoaded: onScrollLoaded, saveScrollPosition } =
    useBlockScrollMemory({
      containerRef: scrollContainerRef,
      noteId: selectedNoteId,
    })
  const { onContentLoaded: onCursorLoaded, saveCursorPosition } =
    useCursorMemory({
      editorRef,
      noteId: selectedNoteId,
    })

  /**
   * Combined content-loaded callback that restores both scroll position
   * and cursor position after editor content has been loaded for a note.
   *
   * @remarks
   * This delegates to {@link useBlockScrollMemory.onContentLoaded} and
   * {@link useCursorMemory.onContentLoaded} so that the editor returns
   * to the exact visual state the user last saw.
   */
  const handleContentLoaded = useCallback(() => {
    onCursorLoaded()
    onScrollLoaded()
    setContentLength(computeEditorTextLength(editorRef))

    // Execute pending translation synchronously so that the translation is the
    // first undo-stack entry after the editor has loaded.  Using requestAnimationFrame
    // would allow intermediate onChange → backfillImageCaptions transactions to be
    // recorded first, making the user press Ctrl+Z multiple times.
    if (pendingTranslationId && pendingTranslationId === selectedNoteId) {
      const id = pendingTranslationId
      setPendingTranslationId(null)
      // Use queueMicrotask to avoid calling setState during render while still
      // executing before any other effects or RAF callbacks.
      queueMicrotask(() => {
        translateNoteHandlerRef.current?.(id)
      })
    }
  }, [
    onCursorLoaded,
    onScrollLoaded,
    pendingTranslationId,
    selectedNoteId,
    editorRef,
  ])
  useScrollIsolation(scrollContainerRef, {
    selectors: [
      '.bn-suggestion-menu',
      '.bn-link-toolbar',
      '.bn-color-picker-dropdown',
      '.bn-formatting-toolbar',
      '.bn-table-handle-menu',
      '[data-slot="select-content"]',
      '[data-slot="dropdown-menu-content"]',
    ],
  })

  /**
   * Smoothly scrolls the editor content area back to the top.
   *
   * @remarks
   * No-op when the scroll container ref is not attached.
   */
  const scrollToTop = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    el.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  /**
   * Scrolls the container so that the cursor is positioned near the top of
   * the visible area (approximately 25% from the top).  Called when the
   * suggestion menu opens so the command palette has more room to display.
   */
  const scrollCursorToTop = useCallback((cursorClientY: number) => {
    const el = scrollContainerRef.current
    if (!el) return
    // Skip if the feature is disabled by the user.
    if (!commandPaletteScrollConfig.enabled) return
    const containerRect = el.getBoundingClientRect()
    // Target: cursor should sit at the user-configured fraction from the top.
    const targetFraction = commandPaletteScrollConfig.targetFraction
    const targetY = containerRect.top + containerRect.height * targetFraction
    const delta = cursorClientY - targetY
    // Only scroll down if the cursor is already below the target position.
    if (delta <= 10) return
    el.scrollBy({ top: delta, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    editorStore
      .get<string>('lastNoteId')
      .then((id) => {
        if (id) setSelectedNoteId(id)
      })
      .catch((err) => {
        console.error('Failed to load lastNoteId:', err)
      })
      .finally(() => {
        setNoteIdInitialized(true)
      })
  }, [editorStore])

  // Register keyboard shortcuts for editor font size (Cmd/Alt + Plus/Minus).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isModifier = e.metaKey || e.altKey
      if (!isModifier) return
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        increaseFontSize()
      } else if (e.key === '-') {
        e.preventDefault()
        decreaseFontSize()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [increaseFontSize, decreaseFontSize])

  /**
   * Persists the sidebar open/close state to the config store
   * and updates the local UI state.
   *
   * @param open - `true` to open the sidebar, `false` to close it.
   */
  const handleSidebarOpenChange = useCallback(
    (open: boolean) => {
      setSidebarOpen(open)
      configStore.set('sidebarOpen', open).catch((err) => {
        console.error('Failed to persist sidebarOpen:', err)
      })
    },
    [configStore]
  )

  /**
   * Persists the given note ID (or removes it when `null`) to the
   * editor store so it can be restored on next app launch.
   *
   * @param id - The note ID to persist, or `null` to clear the stored value.
   */
  const persistLastNoteId = useCallback(
    (id: string | null) => {
      const action = id
        ? editorStore.set('lastNoteId', id)
        : editorStore.delete('lastNoteId')
      action.catch((err) => {
        console.error(`Failed to ${id ? 'persist' : 'delete'} lastNoteId:`, err)
      })
    },
    [editorStore]
  )

  /**
   * Switches the active note. Saves the scroll position for the
   * previously selected note and persists the new selection.
   *
   * @param id - The ID of the note to select, or `null` to deselect.
   */
  const selectNote = useCallback(
    (id: string | null) => {
      if (selectedNoteId) {
        saveScrollPosition(selectedNoteId)
        saveCursorPosition(selectedNoteId)
      }
      setSelectedNoteId(id)
      setIsNoteLocked(false)
      persistLastNoteId(id)
      setTranslationState({
        visible: false,
        originalBlocks: null,
        sourceLang: DEFAULT_SOURCE_LANG,
        targetLang: DEFAULT_TARGET_LANG,
        detectedLang: '',
        progress: null,
      })
    },
    [selectedNoteId, saveScrollPosition, saveCursorPosition, persistLastNoteId]
  )

  useEffect(() => {
    // Wait until the persisted lastNoteId has been loaded before updating the
    // window title to avoid a flash of "Untitled".
    if (!noteIdInitialized) return
    const appWindow = getCurrentWindow()
    const formatTitle = (title: string) =>
      titlePrefixEnabled ? `Scripta - ${title}` : title
    if (!selectedNoteId) {
      appWindow.setTitle(formatTitle('Untitled'))
      return
    }
    let stale = false
    getNote(selectedNoteId)
      .then((note) => {
        if (stale) return
        appWindow.setTitle(formatTitle(note ? note.title : 'Untitled'))
      })
      .catch(() => {
        if (!stale) console.error('Failed to load note for window title')
      })
    return () => {
      stale = true
    }
  }, [selectedNoteId, noteIdInitialized, titlePrefixEnabled])

  /**
   * Callback invoked after a note is auto-saved.
   * Bumps the refresh key so the sidebar reflects the updated title.
   *
   * @param id - The ID of the note that was saved.
   */
  const handleNoteSaved = useCallback(
    (id: string) => {
      setSelectedNoteId((current) => (current === null ? id : current))
      setRefreshKey((v) => v + 1)
      setSaveCount((v) => v + 1)
      setContentLength(computeEditorTextLength(editorRef))
    },
    [editorRef]
  )

  /**
   * Callback invoked when the lock state of the loaded note is determined.
   *
   * @param locked - `true` if the note is locked, `false` otherwise.
   */
  const handleLockStateChange = useCallback((locked: boolean) => {
    setIsNoteLocked(locked)
  }, [])

  /**
   * Creates a new note with default content and selects it.
   *
   * @throws Shows an error toast if note creation fails.
   */
  const handleNewNote = useCallback(async () => {
    try {
      const note = await createNote(
        extractTitle(DEFAULT_CONTENT),
        DEFAULT_CONTENT
      )
      selectNote(note.id)
      setRefreshKey((v) => v + 1)
    } catch {
      toast.error('Failed to create note')
    }
  }, [selectNote])

  /**
   * Deletes the specified note. If the deleted note was currently
   * selected, falls back to the first remaining note or `null`.
   *
   * @param noteId - The ID of the note to delete.
   * @throws Shows an error toast if deletion fails.
   */
  const handleDeleteNote = useCallback(
    async (noteId: string) => {
      try {
        await deleteNote(noteId)
        if (selectedNoteId === noteId) {
          const notes = await listNotes()
          selectNote(notes.length > 0 ? notes[0].id : null)
        }
        setRefreshKey((v) => v + 1)
        toast.success('Note deleted')
      } catch {
        toast.error('Failed to delete note')
      }
    },
    [selectedNoteId, selectNote]
  )

  /**
   * Toggles the pinned state of the given note and refreshes the sidebar.
   *
   * @param noteId - The ID of the note whose pin state should be toggled.
   * @param pinned - The new pinned state to apply.
   * @throws Shows an error toast if the toggle operation fails.
   */
  const handleTogglePin = useCallback(
    async (noteId: string, pinned: boolean) => {
      try {
        await togglePinNote(noteId, pinned)
        setRefreshKey((v) => v + 1)
      } catch {
        toast.error('Failed to toggle pin')
      }
    },
    []
  )

  /**
   * Toggles the locked state of the given note.
   *
   * @param noteId - The ID of the note whose lock state should be toggled.
   * @param locked - The new locked state to apply.
   * @throws Shows an error toast if the toggle operation fails.
   */
  const handleToggleLock = useCallback(
    async (noteId: string, locked: boolean) => {
      try {
        await toggleLockNote(noteId, locked)
        if (selectedNoteId === noteId) {
          setIsNoteLocked(locked)
        }
        setRefreshKey((v) => v + 1)
      } catch {
        toast.error('Failed to toggle lock')
      }
    },
    [selectedNoteId]
  )

  /**
   * Duplicates the specified note and selects the newly created copy.
   *
   * @param noteId - The ID of the note to duplicate.
   * @throws Shows an error toast if duplication fails.
   */
  const handleDuplicateNote = useCallback(
    async (noteId: string) => {
      try {
        const duplicated = await duplicateNote(noteId)
        selectNote(duplicated.id)
        setRefreshKey((v) => v + 1)
        toast.success('Note duplicated')
      } catch {
        toast.error('Failed to duplicate note')
      }
    },
    [selectNote]
  )

  /**
   * Translates the specified note in-place using Apple Intelligence.
   * Uses the default language pair from settings. The original content
   * can be restored with Ctrl+Z (undo) via the editor's history stack.
   *
   * @param noteId - The ID of the note to translate.
   */
  const handleTranslateNote = useCallback(
    async (noteId: string) => {
      // If the note is not currently selected, switch to it first and defer
      // the actual translation until the editor has loaded the new content.
      if (selectedNoteId !== noteId) {
        setPendingTranslationId(noteId)
        selectNote(noteId)
        return
      }

      const editor = editorRef.current?.editor
      if (!editor) return
      try {
        const [src, tgt] = await Promise.all([
          configStore.get<string>(TRANSLATION_SOURCE_LANG_KEY),
          configStore.get<string>(TRANSLATION_TARGET_LANG_KEY),
        ])
        const sourceLang = src ?? DEFAULT_SOURCE_LANG
        const targetLang = tgt ?? DEFAULT_TARGET_LANG
        // Save original blocks for re-translation
        const originalBlocks = structuredClone(editor.document)
        const content = JSON.stringify(editor.document)
        const blockIds = collectTranslatableBlockIds(editor)

        // Show indicator with progress immediately
        setTranslationState({
          visible: true,
          originalBlocks,
          sourceLang,
          targetLang,
          detectedLang: '',
          progress: { completed: 0, total: blockIds.length },
        })

        // Track whether any blocks were actually translated so that
        // commitTranslation is only called when the undo entry is meaningful.
        let anyTranslated = false
        let streamParamMap: string[] = []
        let streamCounters = new StyleCounters()

        await translateBlocksStreaming(
          content,
          sourceLang,
          targetLang,
          (event: TranslationStreamEvent) => {
            switch (event.event) {
              case 'started':
                streamParamMap = event.data.paramMap
                streamCounters = new StyleCounters(
                  0,
                  event.data.paramCodeCount,
                  event.data.paramCodeCount + event.data.paramTcCount,
                  event.data.paramCodeCount +
                    event.data.paramTcCount +
                    event.data.paramBcCount
                )
                setTranslationState((prev) => ({
                  ...prev,
                  progress: { completed: 0, total: event.data.totalBlocks },
                }))
                break
              case 'chunkCompleted': {
                anyTranslated = true
                const { startIndex, translatedTexts } = event.data
                for (let i = 0; i < translatedTexts.length; i++) {
                  updateBlockTextByIndex(
                    editor,
                    startIndex + i,
                    translatedTexts[i],
                    blockIds,
                    streamParamMap,
                    streamCounters
                  )
                }
                setTranslationState((prev) => ({
                  ...prev,
                  progress: prev.progress
                    ? {
                        ...prev.progress,
                        completed:
                          prev.progress.completed + translatedTexts.length,
                      }
                    : null,
                }))
                break
              }
              case 'error':
                toast.error('Translation chunk failed', {
                  description: event.data.message,
                })
                break
              // Do NOT call setRefreshKey here.  The Editor component uses
              // refreshKey as its React key, so incrementing it would remount
              // the entire editor and destroy the ProseMirror undo history
              // (making Cmd+Z unable to restore the pre-translation content).
              case 'finished':
                break
            }
          }
        )

        // Only consolidate undo entry when blocks were actually translated.
        // Without this guard, a failed translation (e.g. same-language error)
        // would create a no-op undo entry, causing Cmd+Z to require an extra
        // press before restoring the original content.
        if (anyTranslated) {
          commitTranslation(editor, originalBlocks)
        }

        // Detect source language for indicator display
        let detectedLang = ''
        if (anyTranslated && sourceLang === 'auto') {
          const textContent = originalBlocks
            .map((b: any) =>
              (b.content ?? []).map((n: any) => n.text ?? '').join('')
            )
            .filter(Boolean)
            .join(' ')
          detectedLang = await detectLanguage(textContent)
        }

        setTranslationState((prev) => ({
          ...prev,
          detectedLang,
          progress: null,
        }))
      } catch (e) {
        console.error('Translation error:', e)
        const msg = String(e)
        toast.error('Failed to translate note', {
          description: msg.includes('not downloaded')
            ? 'Download the language model from System Settings > General > Language & Region > Translation Languages'
            : msg,
        })
        setTranslationState((prev) => ({ ...prev, progress: null }))
      }
    },
    [configStore, selectedNoteId, selectNote]
  )

  // Keep ref in sync so handleContentLoaded can call it without forward-declaration issues.
  translateNoteHandlerRef.current = handleTranslateNote

  /**
   * Exports the given note as a Markdown file via a native save dialog.
   *
   * @param noteId - The ID of the note to export.
   * @throws Shows an error toast if the note is not found or export fails.
   */
  const handleExportNote = useCallback(async (noteId: string) => {
    const editor = editorRef.current?.editor
    if (!editor) return

    try {
      const note = await getNote(noteId)
      if (!note) {
        toast.error('Note not found')
        return
      }

      const safeName = note.title.replace(/[/\\?%*:|"<>]/g, '_') || 'untitled'
      const filePath = await save({
        defaultPath: `${safeName}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })
      if (!filePath) return

      const markdown = fixBlockNoteTableExport(exportToMarkdown(editor))
      await writeTextFile(filePath, markdown)
      toast.success('Exported as Markdown', {
        description: <CopyablePath path={filePath} />,
      })
    } catch {
      toast.error('Failed to export note')
    }
  }, [])

  /**
   * Imports a Markdown file as a new note via a native open dialog.
   *
   * @throws Shows an error toast if the file cannot be read or parsed.
   */
  const handleImportNote = useCallback(async () => {
    const editor = editorRef.current?.editor
    if (!editor) return

    try {
      const filePath = await open({
        multiple: false,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })
      if (!filePath || typeof filePath !== 'string') return

      const markdown = await readTextFile(filePath)
      const blocks = await parseMarkdownWithColumns(markdown, editor)
      const content = JSON.stringify(blocks)
      const title = extractTitle(content)

      const note = await createNote(title, content)
      selectNote(note.id)
      setRefreshKey((v) => v + 1)
      toast.success('Imported Markdown file')
    } catch {
      toast.error('Failed to import file')
    }
  }, [selectNote])

  /**
   * Re-translates the current note from its saved original content using a
   * new language pair, updating the editor in place via the streaming API.
   *
   * The editor is first restored to the pre-translation blocks captured in
   * `translationState.originalBlocks`, then translation streams are applied
   * block-by-block.  If any blocks are translated, {@link commitTranslation}
   * consolidates all changes into a single undo entry so the user can press
   * Cmd+Z once to revert the entire re-translation.
   *
   * When `newSourceLang` is `"auto"`, the detected language is updated
   * asynchronously after streaming completes and stored in `translationState`.
   *
   * @param newSourceLang - BCP-47 language tag for the new source language, or
   *   `"auto"` to enable automatic detection.
   * @param newTargetLang - BCP-47 language tag for the new target language.
   */
  const handleRetranslate = useCallback(
    async (newSourceLang: string, newTargetLang: string) => {
      const editor = editorRef.current?.editor
      if (!editor || !translationState.originalBlocks) return
      try {
        const originalContent = JSON.stringify(translationState.originalBlocks)
        const blockIds = collectTranslatableBlockIds(editor)

        // Restore original blocks first so re-translation starts from clean state
        editor.replaceBlocks(
          editor.document,
          translationState.originalBlocks as any[]
        )

        setTranslationState((prev) => ({
          ...prev,
          sourceLang: newSourceLang,
          targetLang: newTargetLang,
          progress: { completed: 0, total: blockIds.length },
        }))

        // Track whether any blocks were actually translated so that
        // commitTranslation is only called when the undo entry is meaningful.
        let anyTranslated = false
        let streamParamMap: string[] = []
        let streamCounters = new StyleCounters()

        await translateBlocksStreaming(
          originalContent,
          newSourceLang,
          newTargetLang,
          (event: TranslationStreamEvent) => {
            switch (event.event) {
              case 'started':
                streamParamMap = event.data.paramMap
                streamCounters = new StyleCounters(
                  0,
                  event.data.paramCodeCount,
                  event.data.paramCodeCount + event.data.paramTcCount,
                  event.data.paramCodeCount +
                    event.data.paramTcCount +
                    event.data.paramBcCount
                )
                setTranslationState((prev) => ({
                  ...prev,
                  progress: { completed: 0, total: event.data.totalBlocks },
                }))
                break
              case 'chunkCompleted': {
                anyTranslated = true
                const { startIndex, translatedTexts } = event.data
                for (let i = 0; i < translatedTexts.length; i++) {
                  updateBlockTextByIndex(
                    editor,
                    startIndex + i,
                    translatedTexts[i],
                    blockIds,
                    streamParamMap,
                    streamCounters
                  )
                }
                setTranslationState((prev) => ({
                  ...prev,
                  progress: prev.progress
                    ? {
                        ...prev.progress,
                        completed:
                          prev.progress.completed + translatedTexts.length,
                      }
                    : null,
                }))
                break
              }
              case 'error':
                toast.error('Translation chunk failed', {
                  description: event.data.message,
                })
                break
              // Do NOT call setRefreshKey here — see handleTranslateNote for details.
              case 'finished':
                break
            }
          }
        )

        // Only consolidate undo entry when blocks were actually translated.
        if (anyTranslated) {
          commitTranslation(editor, translationState.originalBlocks)
        }

        // Re-detect language when source is "auto"
        let detectedLang = translationState.detectedLang
        if (anyTranslated && newSourceLang === 'auto') {
          const textContent = translationState.originalBlocks
            .map((b: any) =>
              (b.content ?? []).map((n: any) => n.text ?? '').join('')
            )
            .filter(Boolean)
            .join(' ')
          detectedLang = await detectLanguage(textContent)
        }
        setTranslationState((prev) => ({
          ...prev,
          detectedLang,
          progress: null,
        }))
      } catch (e) {
        console.error('Re-translation error:', e)
        const msg = String(e)
        toast.error('Failed to re-translate note', {
          description: msg.includes('not downloaded')
            ? 'Download the language model from System Settings > General > Language & Region > Translation Languages'
            : msg,
        })
        setTranslationState((prev) => ({ ...prev, progress: null }))
      }
    },
    [translationState.originalBlocks, translationState.detectedLang]
  )

  /**
   * Hides the {@link TranslationIndicator} overlay without discarding the
   * saved original blocks, so the user can still undo via Cmd+Z.
   */
  const handleDismissTranslation = useCallback(() => {
    setTranslationState((prev) => ({ ...prev, visible: false }))
  }, [])

  return (
    <TooltipProvider>
      <SidebarProvider
        className="h-svh"
        open={sidebarOpen}
        onOpenChange={handleSidebarOpenChange}
      >
        <NoteSidebar
          selectedNoteId={selectedNoteId}
          onSelectNote={selectNote}
          onNewNote={handleNewNote}
          onDeleteNote={handleDeleteNote}
          onTogglePin={handleTogglePin}
          onToggleLock={handleToggleLock}
          onDuplicateNote={handleDuplicateNote}
          onTranslate={handleTranslateNote}
          onExportNote={handleExportNote}
          onImportNote={handleImportNote}
          refreshKey={refreshKey}
          onRefresh={() => setRefreshKey((v) => v + 1)}
        />
        <SidebarInset className="overflow-hidden">
          <SummarizationProvider>
            <SummarizationManager
              noteId={selectedNoteId}
              saveCount={saveCount}
              contentLength={contentLength}
            >
              <header
                className={cn(
                  'flex h-12 shrink-0 items-center gap-2 border-b px-4',
                  'overflow-hidden transition-[max-height,opacity,padding,border-width] duration-200 ease-in-out',
                  'max-h-12 opacity-100',
                  isHeaderHidden && '!border-b-0 max-h-0 py-0 opacity-0'
                )}
              >
                <SidebarTrigger className="-ml-1" />
                <div className="flex-1" />
                {isMacOS && (
                  <Tooltip>
                    <TooltipTrigger
                      render={(props) => (
                        <button
                          {...props}
                          type="button"
                          disabled={
                            !translationAvailable ||
                            !selectedNoteId ||
                            (translationState.visible &&
                              translationState.progress != null)
                          }
                          onClick={() =>
                            selectedNoteId &&
                            handleTranslateNote(selectedNoteId)
                          }
                          className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                        >
                          <Languages className="h-4 w-4" />
                        </button>
                      )}
                    />
                    <TooltipContent>
                      {!translationAvailable
                        ? 'Translation requires macOS 26 or later'
                        : !selectedNoteId
                          ? 'Select a note to translate'
                          : translationState.visible &&
                              translationState.progress != null
                            ? 'Translation in progress…'
                            : 'Translate note'}
                    </TooltipContent>
                  </Tooltip>
                )}
                <SummarizeButton />
                <ModeToggle />
              </header>
              <div
                ref={scrollContainerRef}
                className="custom-scrollbar relative flex-1 overflow-y-auto overscroll-none"
              >
                <div className="pointer-events-none sticky top-5 z-10 flex flex-col items-end gap-1 pr-7">
                  <SaveStatusIndicator
                    status={saveStatus}
                    locked={isNoteLocked}
                  />
                  {translationState.visible && (
                    <div className="pointer-events-auto">
                      <TranslationIndicator
                        sourceLang={translationState.sourceLang}
                        targetLang={translationState.targetLang}
                        detectedLang={translationState.detectedLang}
                        progress={translationState.progress}
                        onRetranslate={handleRetranslate}
                        onDismiss={handleDismissTranslation}
                      />
                    </div>
                  )}
                </div>
                <SummaryAccordion />
                <Editor
                  ref={editorRef}
                  key={selectedNoteId ?? 'new'}
                  noteId={selectedNoteId}
                  locked={isNoteLocked}
                  onNoteSaved={handleNoteSaved}
                  onStatusChange={setSaveStatus}
                  onContentLoaded={handleContentLoaded}
                  onSuggestionMenuOpen={scrollCursorToTop}
                  onTranslate={
                    selectedNoteId
                      ? () => handleTranslateNote(selectedNoteId)
                      : undefined
                  }
                  onLockStateChange={handleLockStateChange}
                />
                <div className="pointer-events-none sticky bottom-5 z-10 flex justify-end pr-7">
                  <ScrollToTopButton
                    visible={isScrolledDown}
                    onClick={scrollToTop}
                  />
                </div>
              </div>
            </SummarizationManager>
          </SummarizationProvider>
        </SidebarInset>
      </SidebarProvider>
      <Toaster position="bottom-right" />
      <UpdateDialog />
    </TooltipProvider>
  )
}

/**
 * Root component of the application.
 *
 * Wraps {@link AppContent} with the {@link ThemeProvider},
 * {@link FontSizeProvider}, {@link EditorFontProvider}, and
 * {@link ToolbarConfigProvider} so their context hooks are available
 * throughout the component tree.
 *
 * @returns The rendered application tree.
 */
function App() {
  const { config: configStore } = useAppStore()

  return (
    <ThemeProvider defaultTheme={configDefaults.theme}>
      <FontSizeProvider>
        <EditorFontProvider>
          <ToolbarConfigProvider>
            <WindowTitlePrefixProvider>
              <UpdateProvider configStore={configStore}>
                <AppContent />
              </UpdateProvider>
            </WindowTitlePrefixProvider>
          </ToolbarConfigProvider>
        </EditorFontProvider>
      </FontSizeProvider>
    </ThemeProvider>
  )
}

export default App
