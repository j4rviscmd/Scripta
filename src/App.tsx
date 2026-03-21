import { useState, useCallback, useEffect } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Editor } from "@/features/editor";
import { NoteSidebar } from "@/features/sidebar";
import { createNote, DEFAULT_CONTENT } from "@/features/editor";

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

  useEffect(() => {
    if (selectedNoteId) {
      localStorage.setItem(LAST_NOTE_KEY, selectedNoteId);
    } else {
      localStorage.removeItem(LAST_NOTE_KEY);
    }
  }, [selectedNoteId]);

  /** Updates the selected note and bumps the sidebar refresh counter after a save. */
  const handleNoteSaved = useCallback((id: string) => {
    setSelectedNoteId(id);
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

  return (
    <TooltipProvider>
      <SidebarProvider>
        <NoteSidebar
          selectedNoteId={selectedNoteId}
          onSelectNote={handleSelectNote}
          onNewNote={handleNewNote}
          refreshKey={refreshKey}
        />
        <SidebarInset>
          <header className="flex h-12 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
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
  );
}

export default App;
