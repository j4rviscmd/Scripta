import { useState, useCallback, useRef, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Editor, createNote, deleteNote, listNotes, togglePinNote, getNote, DEFAULT_CONTENT, extractTitle } from "@/features/editor";
import type { SaveStatus } from "@/features/editor";
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
 * Inner application content.
 *
 * Separated from the root {@link App} component so that hooks that require
 * {@link FontSizeProvider} (e.g. {@link useFontSize}) can be called here,
 * inside the provider boundary.
 */
function AppContent() {
  const { config: configStore, editorState: editorStore } = useAppStore();
  const { increase: increaseFontSize, decrease: decreaseFontSize } = useFontSize();
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

  const scrollToTop = useCallback(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Restore the last opened note ID from the store on first mount.
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

  /** Persists sidebar open state to the store. */
  const handleSidebarOpenChange = useCallback((open: boolean) => {
    setSidebarOpen(open);
    configStore.set("sidebarOpen", open).catch((err) => {
      console.error("Failed to persist sidebarOpen:", err);
    });
  }, [configStore]);

  /** Persists or clears the last opened note ID in the store. */
  const persistLastNoteId = useCallback((id: string | null) => {
    const action = id
      ? editorStore.set("lastNoteId", id)
      : editorStore.delete("lastNoteId");
    action.catch((err) => {
      console.error(`Failed to ${id ? "persist" : "delete"} lastNoteId:`, err);
    });
  }, [editorStore]);

  /**
   * Selects a note by ID, saving the current scroll position first.
   *
   * When a different note is already selected, the scroll position of
   * that note is persisted before switching. The new note ID is also
   * saved as the last opened note for restoration on next launch.
   *
   * @param id - The ID of the note to select, or `null` to deselect.
   */
  const selectNote = useCallback((id: string | null) => {
    if (selectedNoteId) {
      saveScrollPosition(selectedNoteId);
    }
    setSelectedNoteId(id);
    persistLastNoteId(id);
  }, [selectedNoteId, saveScrollPosition, persistLastNoteId]);

  // Updates the native window title to reflect the currently selected note.
  // Uses a stale guard to prevent race conditions when the selected note changes
  // while a title fetch is still in flight.
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

  /** Updates the selected note and bumps the sidebar refresh counter after a save. */
  const handleNoteSaved = useCallback((id: string) => {
    setSelectedNoteId((current) => {
      // 別のノートが既に選択されている場合は上書きしない。
      // アンマウント時の遅延saveコールバックが、
      // 切り替え先のノートIDを意図せず書き換えるのを防ぐ。
      if (current === null || current === id) return id;
      return current;
    });
    setRefreshKey((v) => v + 1);
  }, []);

  /** Creates a brand-new note via the API and selects it immediately. */
  const handleNewNote = useCallback(async () => {
    try {
      const note = await createNote(extractTitle(DEFAULT_CONTENT), DEFAULT_CONTENT);
      selectNote(note.id);
      setRefreshKey((v) => v + 1);
    } catch {
      toast.error("Failed to create note");
    }
  }, [selectNote]);

  /** Deletes a note and selects the most recent remaining note if the deleted one was active. */
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

  /** Toggles the pinned state of a note. */
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
