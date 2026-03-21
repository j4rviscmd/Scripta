import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import "@blocknote/core/fonts/inter.css";
import { useAutoSave } from "../hooks/useAutoSave";

/**
 * Rich-text editor component powered by BlockNote.
 *
 * Initializes the editor with a welcome heading and placeholder paragraph.
 * Auto-saves content to local SQLite storage with 500ms debounce
 * via the BlockNote onChange callback.
 *
 * @returns The rendered editor view.
 */
export function Editor() {
  const { scheduleSave } = useAutoSave(500);

  const editor = useCreateBlockNote({
    initialContent: [
      {
        type: "heading",
        content: "Welcome to Scripta",
        props: { level: 1 } as Record<string, unknown>,
      },
      {
        type: "paragraph",
        content: "The note app for everyone. Start typing here...",
      },
    ],
  });

  return (
    <main className="w-full min-h-screen overflow-y-auto p-8">
      <BlockNoteView
        editor={editor}
        theme="light"
        onChange={() => {
          scheduleSave(JSON.stringify(editor.document));
        }}
      />
    </main>
  );
}
