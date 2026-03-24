import { useState, useCallback, useRef, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Editor, createNote, deleteNote, listNotes, togglePinNote, getNote, DEFAULT_CONTENT, extractTitle, useCommandPaletteScroll } from "@/features/editor";
import type { SaveStatus } from "@/features/editor";
import { commandPaletteScrollConfig } from "@/features/editor/lib/commandPaletteScrollConfig";
import { NoteSidebar } from "@/features/sidebar";
import { ThemeProvider } from "@/app/providers/theme-provider";
import { FontSizeProvider } from "@/app/providers/font-size-provider";
import { useFontSize } from "@/app/providers/font-size-provider";
import { useAppStore, configDefaults } from "@/app/providers/store-provider";
import { ModeToggle } from "@/shared/ui/ModeToggle";
import { SaveStatusIndicator } from "@/shared/ui/SaveStatusIndicator";
import { useScrollDirection } from "@/shared/hooks/useScrollDirection";
import { useScrollIsolation } from "@/shared/hooks/useScrollIsolation";
import { useScrollPosition } from "@/shared/hooks/useScrollPosition";
import { useBlockScrollMemory } from "@/shared/hooks/useBlockScrollMemory";
import { ScrollToTopButton } from "@/shared/ui/ScrollToTopButton";
import { cn } from "@/lib/utils";

/**
 * Root application component.
 *
 * Orchestrates note selection, CRUD operations, and the overall layout
 * including the sidebar, header, editor, and scroll management. Persists
 * the last-opened note ID and sidebar visibility to `tauri-plugin-store`.
 */
function AppContent() {
  const { config: configStore, editorState: editorStore } = useAppStore();
  const { increase: increaseFontSize, decrease: decreaseFontSize } = useFontSize();
  // Initialises commandPaletteScrollConfig from the persisted store on mount.
  useCommandPaletteScroll();
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(configDefaults.sidebarOpen);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isHeaderHidden = useScrollDirection(scrollContainerRef);
  const isScrolledDown = useScrollPosition(scrollContainerRef);
  const { onContentLoaded, saveScrollPosition } = useBlockScrollMemory({
    containerRef: scrollContainerRef,
    noteId: selectedNoteId,
  });
  useScrollIsolation(scrollContainerRef, {
    selectors: [
      ".bn-suggestion-menu",
      ".bn-link-toolbar",
      ".bn-color-picker-dropdown",
      ".bn-formatting-toolbar",
      ".bn-table-handle-menu",
      '[data-slot="select-content"]',
      '[data-slot="dropdown-menu-content"]',
    ],
  });

  /** Smoothly scrolls the editor content area back to the top. */
  const scrollToTop = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  /**
   * Scrolls the container so that the cursor is positioned near the top of
   * the visible area (approximately 25% from the top).  Called when the
   * suggestion menu opens so the command palette has more room to display.
   */
  const scrollCursorToTop = useCallback((cursorClientY: number) => {
    const el = scrollContainerRef.current;
    if (!el) return;
    // Skip if the feature is disabled by the user.
    if (!commandPaletteScrollConfig.enabled) return;
    const containerRect = el.getBoundingClientRect();
    // Target: cursor should sit at the user-configured fraction from the top.
    const targetFraction = commandPaletteScrollConfig.targetFraction;
    const targetY = containerRect.top + containerRect.height * targetFraction;
    const delta = cursorClientY - targetY;
    // Only scroll down if the cursor is already below the target position.
    if (delta <= 10) return;
    el.scrollBy({ top: delta, behavior: "smooth" });
  }, []);

  useEffect(() => {
    editorStore.get<string>("lastNoteId").then((id) => {
      if (id) setSelectedNoteId(id);
    }).catch((err) => {
      console.error("Failed to load lastNoteId:", err);
    });
  }, [editorStore]);

  // Register keyboard shortcuts for editor font size (Cmd/Alt + Plus/Minus).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isModifier = e.metaKey || e.altKey;
      if (!isModifier) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        increaseFontSize();
      } else if (e.key === "-") {
        e.preventDefault();
        decreaseFontSize();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [increaseFontSize, decreaseFontSize]);

  /**
   * Persists the sidebar open/close state to the config store
   * and updates the local UI state.
   */
  const handleSidebarOpenChange = useCallback((open: boolean) => {
    setSidebarOpen(open);
    configStore.set("sidebarOpen", open).catch((err) => {
      console.error("Failed to persist sidebarOpen:", err);
    });
  }, [configStore]);

  /**
   * Persists the given note ID (or removes it when `null`) to the
   * editor store so it can be restored on next app launch.
   */
  const persistLastNoteId = useCallback((id: string | null) => {
    const action = id
      ? editorStore.set("lastNoteId", id)
      : editorStore.delete("lastNoteId");
    action.catch((err) => {
      console.error(`Failed to ${id ? "persist" : "delete"} lastNoteId:`, err);
    });
  }, [editorStore]);

  /**
   * Switches the active note. Saves the scroll position for the
   * previously selected note and persists the new selection.
   */
  const selectNote = useCallback((id: string | null) => {
    if (selectedNoteId) {
      saveScrollPosition(selectedNoteId);
    }
    setSelectedNoteId(id);
    persistLastNoteId(id);
  }, [selectedNoteId, saveScrollPosition, persistLastNoteId]);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    if (!selectedNoteId) {
      appWindow.setTitle("Scripta - Untitled");
      return;
    }
    let stale = false;
    getNote(selectedNoteId)
      .then((note) => {
        if (stale) return;
        appWindow.setTitle(note ? `Scripta - ${note.title}` : "Scripta - Untitled");
      })
      .catch(() => {
        if (!stale) console.error("Failed to load note for window title");
      });
    return () => { stale = true; };
  }, [selectedNoteId, refreshKey]);

  /**
   * Callback invoked after a note is auto-saved.
   * Bumps the refresh key so the sidebar reflects the updated title.
   */
  const handleNoteSaved = useCallback((id: string) => {
    setSelectedNoteId((current) => {
      if (current === null || current === id) return id;
      return current;
    });
    setRefreshKey((v) => v + 1);
  }, []);

  /** Creates a new note with default content and selects it. */
  const handleNewNote = useCallback(async () => {
    try {
      const note = await createNote(extractTitle(DEFAULT_CONTENT), DEFAULT_CONTENT);
      selectNote(note.id);
      setRefreshKey((v) => v + 1);
    } catch {
      toast.error("Failed to create note");
    }
  }, [selectNote]);

  /**
   * Deletes the specified note. If the deleted note was currently
   * selected, falls back to the first remaining note or `null`.
   */
  const handleDeleteNote = useCallback(
    async (noteId: string) => {
      try {
        await deleteNote(noteId);
        if (selectedNoteId === noteId) {
          const notes = await listNotes();
          selectNote(notes.length > 0 ? notes[0].id : null);
        }
        setRefreshKey((v) => v + 1);
        toast.success("Note deleted");
      } catch {
        toast.error("Failed to delete note");
      }
    },
    [selectedNoteId, selectNote],
  );

  /** Toggles the pinned state of the given note and refreshes the sidebar. */
  const handleTogglePin = useCallback(
    async (noteId: string, pinned: boolean) => {
      try {
        await togglePinNote(noteId, pinned);
        setRefreshKey((v) => v + 1);
      } catch {
        toast.error("Failed to toggle pin");
      }
    },
    [],
  );

  return (
    <TooltipProvider>
      <SidebarProvider className="h-svh" open={sidebarOpen} onOpenChange={handleSidebarOpenChange}>
        <NoteSidebar
          selectedNoteId={selectedNoteId}
          onSelectNote={selectNote}
          onNewNote={handleNewNote}
          onDeleteNote={handleDeleteNote}
          onTogglePin={handleTogglePin}
          refreshKey={refreshKey}
        />
        <SidebarInset className="overflow-hidden">
          <header
            className={cn(
              "flex h-12 shrink-0 items-center gap-2 border-b px-4",
              "transition-[max-height,opacity,padding,border-width] duration-200 ease-in-out overflow-hidden",
              "max-h-12 opacity-100",
              isHeaderHidden && "max-h-0 !border-b-0 py-0 opacity-0",
            )}
          >
            <SidebarTrigger className="-ml-1" />
            <div className="flex-1" />
            <ModeToggle />
          </header>
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overscroll-none">
            <div className="sticky top-5 z-10 flex justify-end pr-7 pointer-events-none">
              <SaveStatusIndicator status={saveStatus} />
            </div>
            <Editor
              key={selectedNoteId ?? "new"}
              noteId={selectedNoteId}
              onNoteSaved={handleNoteSaved}
              onStatusChange={setSaveStatus}
              onContentLoaded={onContentLoaded}
              onSuggestionMenuOpen={scrollCursorToTop}
            />
            <div className="sticky bottom-5 z-10 flex justify-end pr-7 pointer-events-none">
              <ScrollToTopButton visible={isScrolledDown} onClick={scrollToTop} />
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}

/**
 * Root component of the application.
 *
 * Wraps {@link AppContent} with the {@link ThemeProvider} and
 * {@link FontSizeProvider} so their context hooks are available
 * throughout the component tree.
 *
 * @returns The rendered application tree.
 */
function App() {
  return (
    <ThemeProvider defaultTheme="system">
      <FontSizeProvider>
        <AppContent />
      </FontSizeProvider>
    </ThemeProvider>
  );
}

export default App;
