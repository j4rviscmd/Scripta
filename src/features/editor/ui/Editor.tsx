import { useEffect, useState } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import "@blocknote/core/fonts/inter.css";

/**
 * Rich-text editor component powered by BlockNote.
 *
 * Detects the user's system color-scheme preference and updates the
 * editor theme dynamically when it changes. Initializes the editor
 * with a welcome heading and placeholder paragraph.
 *
 * @returns The rendered editor view.
 */
export function Editor() {
  const [theme, setTheme] = useState<"light" | "dark">(
    window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) =>
      setTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

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
      <BlockNoteView editor={editor} theme={theme} />
    </main>
  );
}
