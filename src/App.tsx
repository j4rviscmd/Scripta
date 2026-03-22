import { useState, useCallback, useRef } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Editor, createNote, deleteNote, listNotes, DEFAULT_CONTENT, extractTitle } from "@/features/editor";
import type { SaveStatus } from "@/features/editor";
import { NoteSidebar } from "@/features/sidebar";
import { ThemeProvider } from "@/app/providers/theme-provider";
import { ModeToggle } from "@/shared/ui/ModeToggle";
import { SaveStatusIndicator } from "@/shared/ui/SaveStatusIndicator";
import { useScrollDirection } from "@/shared/hooks/useScrollDirection";
import { cn } from "@/lib/utils";

/** localStorage key used to persist the last opened note ID across sessions. */
const LAST_NOTE_KEY = "scripta:lastNoteId";

function updateStoredNoteId(id: string | null): void {
  if (id) {
    localStorage.setItem(LAST_NOTE_KEY, id);
  } else {
    localStorage.removeItem(LAST_NOTE_KEY);
  }
}

/**
 * Root component of the application.
 *
 * Manages the selected note state and renders the sidebar alongside
 * the editor.  A shared `refreshKey` counter ensures the sidebar
 * re-fetches its note list whenever a note is saved.  The last opened
 * note ID is persisted in localStorage so it can be restored on startup.
 *
 * @returns The rendered application tree.
 */
function App() {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(() =>
    localStorage.getItem(LAST_NOTE_KEY),
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isHeaderHidden = useScrollDirection(scrollContainerRef);

  const selectNote = useCallback((id: string | null) => {
    setSelectedNoteId(id);
    updateStoredNoteId(id);
  }, []);

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

  return (
    <ThemeProvider defaultTheme="system" storageKey="scripta:theme">
      <TooltipProvider>
        <SidebarProvider className="h-svh">
          <NoteSidebar
            selectedNoteId={selectedNoteId}
            onSelectNote={selectNote}
            onNewNote={handleNewNote}
            onDeleteNote={handleDeleteNote}
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
              />
            </div>
          </SidebarInset>
        </SidebarProvider>
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
