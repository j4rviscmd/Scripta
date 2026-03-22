import { useState, useCallback, useEffect } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Editor, createNote, deleteNote, listNotes, DEFAULT_CONTENT } from "@/features/editor";
import { NoteSidebar } from "@/features/sidebar";
import { ThemeProvider } from "@/app/providers/theme-provider";
import { ModeToggle } from "@/shared/ui/ModeToggle";

/** localStorage key used to persist the last opened note ID across sessions. */
const LAST_NOTE_KEY = "scripta:lastNoteId";

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

  /**
   * Persists or clears the last opened note ID in localStorage.
   *
   * This effect ensures the selected note survives page reloads.
   * When the user deselects all notes (selectedNoteId becomes null),
   * the stored key is removed so the next session starts fresh.
   */
  useEffect(() => {
    if (selectedNoteId) {
      localStorage.setItem(LAST_NOTE_KEY, selectedNoteId);
    } else {
      localStorage.removeItem(LAST_NOTE_KEY);
    }
  }, [selectedNoteId]);

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

  /** Selects a note to display in the editor, forwarding directly to state. */
  const handleSelectNote = useCallback(setSelectedNoteId, []);

  /** Creates a brand-new note via the API and selects it immediately. */
  const handleNewNote = useCallback(async () => {
    try {
      const note = await createNote("Untitled", DEFAULT_CONTENT);
      setSelectedNoteId(note.id);
      setRefreshKey((v) => v + 1);
    } catch {
      toast.error("Failed to create note");
    }
  }, []);

  /** Deletes a note and selects the most recent remaining note if the deleted one was active. */
  const handleDeleteNote = useCallback(
    async (noteId: string) => {
      try {
        await deleteNote(noteId);
        if (selectedNoteId === noteId) {
          const notes = await listNotes();
          setSelectedNoteId(notes.length > 0 ? notes[0].id : null);
        }
        setRefreshKey((v) => v + 1);
        toast.success("Note deleted");
      } catch {
        toast.error("Failed to delete note");
      }
    },
    [selectedNoteId],
  );

  return (
    <ThemeProvider defaultTheme="system" storageKey="scripta:theme">
      <TooltipProvider>
        <SidebarProvider>
          <NoteSidebar
            selectedNoteId={selectedNoteId}
            onSelectNote={handleSelectNote}
            onNewNote={handleNewNote}
            onDeleteNote={handleDeleteNote}
            refreshKey={refreshKey}
          />
          <SidebarInset>
            <header className="flex h-12 items-center gap-2 border-b px-4">
              <SidebarTrigger className="-ml-1" />
              <div className="flex-1" />
              <ModeToggle />
            </header>
            <Editor
              key={selectedNoteId ?? "new"}
              noteId={selectedNoteId}
              onNoteSaved={handleNoteSaved}
            />
          </SidebarInset>
        </SidebarProvider>
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
