import { useEffect } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { BlockNoteEditor } from "@blocknote/core";

/**
 * Intercepts link clicks in the BlockNote editor and opens them in the
 * system default browser via `tauri-plugin-opener`.
 *
 * Uses a capture-phase event listener so it fires before TipTap's own
 * click handler.
 */
export function useLinkClickHandler(editor: BlockNoteEditor): void {
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tiptap = (editor as any)._tiptapEditor;
    if (!tiptap) return;

    const editorDom = tiptap.view.dom as HTMLElement;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const anchor = target.closest("a[href]");
      if (!anchor) return;

      event.preventDefault();
      event.stopPropagation();

      const href = anchor.getAttribute("href");
      if (!href) return;

      openUrl(href).catch(() => {
        console.error("Failed to open URL:", href);
      });
    };

    editorDom.addEventListener("click", handleClick, true);

    return () => {
      editorDom.removeEventListener("click", handleClick, true);
    };
  }, [editor]);
}
