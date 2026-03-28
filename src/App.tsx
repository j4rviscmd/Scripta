import { getCurrentWindow } from '@tauri-apps/api/window'
import { open, save } from '@tauri-apps/plugin-dialog'
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
import { TooltipProvider } from '@/components/ui/tooltip'
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
  readTextFile,
  togglePinNote,
  useCommandPaletteScroll,
  useCursorAutoHideEffect,
  writeTextFile,
} from '@/features/editor'
import { commandPaletteScrollConfig } from '@/features/editor/lib/commandPaletteScrollConfig'
import { NoteSidebar } from '@/features/sidebar'
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
  const { enabled: titlePrefixEnabled } = useWindowTitlePrefix()
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  // True once the persisted lastNoteId has been loaded from the store.
  // Prevents the window title from flashing "Untitled" before the stored
  // note ID is available.
  const [noteIdInitialized, setNoteIdInitialized] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(configDefaults.sidebarOpen)
  const [refreshKey, setRefreshKey] = useState(0)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
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
  }, [onCursorLoaded, onScrollLoaded])
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
      persistLastNoteId(id)
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
  const handleNoteSaved = useCallback((id: string) => {
    setSelectedNoteId((current) => (current === null ? id : current))
    setRefreshKey((v) => v + 1)
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
      const blocks = editor.tryParseMarkdownToBlocks(markdown)
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
          onDuplicateNote={handleDuplicateNote}
          onExportNote={handleExportNote}
          onImportNote={handleImportNote}
          refreshKey={refreshKey}
          onRefresh={() => setRefreshKey((v) => v + 1)}
        />
        <SidebarInset className="overflow-hidden">
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
            <ModeToggle />
          </header>
          <div
            ref={scrollContainerRef}
            className="custom-scrollbar flex-1 overflow-y-auto overscroll-none"
          >
            <div className="pointer-events-none sticky top-5 z-10 flex justify-end pr-7">
              <SaveStatusIndicator status={saveStatus} />
            </div>
            <Editor
              ref={editorRef}
              key={selectedNoteId ?? 'new'}
              noteId={selectedNoteId}
              onNoteSaved={handleNoteSaved}
              onStatusChange={setSaveStatus}
              onContentLoaded={handleContentLoaded}
              onSuggestionMenuOpen={scrollCursorToTop}
            />
            <div className="pointer-events-none sticky bottom-5 z-10 flex justify-end pr-7">
              <ScrollToTopButton
                visible={isScrolledDown}
                onClick={scrollToTop}
              />
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
      <Toaster position="bottom-right" />
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
  return (
    <ThemeProvider defaultTheme={configDefaults.theme}>
      <FontSizeProvider>
        <EditorFontProvider>
          <ToolbarConfigProvider>
            <WindowTitlePrefixProvider>
              <AppContent />
            </WindowTitlePrefixProvider>
          </ToolbarConfigProvider>
        </EditorFontProvider>
      </FontSizeProvider>
    </ThemeProvider>
  )
}

export default App
