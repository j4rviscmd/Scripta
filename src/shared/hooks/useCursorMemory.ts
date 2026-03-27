import type { BlockNoteEditor } from '@blocknote/core'
import { useCallback, useEffect, useRef } from 'react'
import { useAppStore } from '@/app/providers/store-provider'
import type { EditorHandle } from '@/features/editor'
import {
  type CursorPositions,
  getFocusedBlockId,
  placeCursorAtBlockEnd,
  placeCursorAtFirstBlock,
} from '@/shared/lib/cursorPosition'

/**
 * CSS selector for the splash screen overlay element.
 * Used to detect when the splash screen is removed from the DOM.
 */
const SPLASH_SELECTOR = '.fixed.inset-0.z-50'

/**
 * Options for the {@link useCursorMemory} hook.
 *
 * @property editorRef - Ref to the EditorHandle (provides access to BlockNoteEditor).
 * @property noteId - The currently active note ID, or `null` when no note is selected.
 */
interface UseCursorMemoryOptions {
  editorRef: React.RefObject<EditorHandle | null>
  noteId: string | null
}

/**
 * Persists the currently focused BlockNote block ID per note in
 * tauri-plugin-store, and restores the cursor position when a note's
 * content has finished loading.
 *
 * Uses an in-memory cache (`useRef`) for synchronous reads during
 * cursor restoration, and asynchronously persists changes to the
 * store (fire-and-forget).
 *
 * **Save triggers**:
 * - `saveCursorPosition(noteId)` called imperatively before a note switch
 * - `visibilitychange` (tab / window hidden)
 *
 * **Restore**: places the cursor at the saved block's end inside the
 * `onContentLoaded` callback (a microtask after `replaceBlocks`). Falls
 * back to the first block's end when the saved block no longer exists.
 *
 * @param options - Hook configuration options.
 * @returns An object containing:
 *   - `onContentLoaded` - Callback to invoke after editor content has been loaded.
 *   - `saveCursorPosition` - Imperative function to save cursor position for a given note.
 */
export function useCursorMemory({ editorRef, noteId }: UseCursorMemoryOptions) {
  const { editorState: editorStore } = useAppStore()
  const restoredRef = useRef<string | null>(null)
  const positionsRef = useRef<CursorPositions>({})
  const isFirstRestore = useRef(true)

  // Load persisted cursor positions from the store on first mount.
  useEffect(() => {
    editorStore
      .get<CursorPositions>('cursorPositions')
      .then((map) => {
        if (map) positionsRef.current = map
      })
      .catch((err) => {
        console.error('Failed to load cursorPositions:', err)
      })
  }, [editorStore])

  /** Persists the in-memory position map to the store (fire-and-forget). */
  const persistPositions = useCallback(() => {
    editorStore
      .set('cursorPositions', { ...positionsRef.current })
      .catch((err) => {
        console.error('Failed to persist cursorPositions:', err)
      })
  }, [editorStore])

  /** Persists the currently focused block ID for the given note. */
  const saveCursorPosition = useCallback(
    (targetNoteId: string) => {
      const editor = editorRef.current?.editor
      if (!editor) return

      const blockId = getFocusedBlockId(editor)
      if (blockId) {
        positionsRef.current[targetNoteId] = blockId
        persistPositions()
      }
    },
    [editorRef, persistPositions]
  )

  /** Focuses the editor on the next animation frame. */
  const focusEditor = useCallback(
    (editor: BlockNoteEditor) => requestAnimationFrame(() => editor.focus()),
    []
  )

  /** Waits for the splash screen to be removed, then focuses the editor. */
  const waitForSplashAndFocus = useCallback(
    (editor: BlockNoteEditor) => {
      if (!document.querySelector(SPLASH_SELECTOR)) {
        focusEditor(editor)
        return
      }

      const observer = new MutationObserver(() => {
        if (!document.querySelector(SPLASH_SELECTOR)) {
          observer.disconnect()
          focusEditor(editor)
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
    },
    [focusEditor]
  )

  /** Restores the cursor to the saved block for the current note. */
  const restoreCursorPosition = useCallback(() => {
    const editor = editorRef.current?.editor
    if (!editor) return

    const savedBlockId = positionsRef.current[noteId!]
    if (!savedBlockId || !placeCursorAtBlockEnd(editor, savedBlockId)) {
      placeCursorAtFirstBlock(editor)
    }

    // On the first restore (app startup), the splash screen's DOM removal
    // resets browser focus to <body>. We observe its removal to focus after.
    // On subsequent restores (note switching), a single frame delay suffices.
    if (isFirstRestore.current) {
      isFirstRestore.current = false
      waitForSplashAndFocus(editor)
    } else {
      focusEditor(editor)
    }
  }, [editorRef, noteId, focusEditor, waitForSplashAndFocus])

  // --- Save on visibility change ---
  useEffect(() => {
    if (!noteId) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveCursorPosition(noteId)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [noteId, saveCursorPosition])

  // --- Reset restore guard when no note is selected ---
  useEffect(() => {
    if (!noteId) {
      restoredRef.current = null
    }
  }, [noteId])

  // --- Handle content loaded callback ---
  const onContentLoaded = useCallback(() => {
    if (!noteId) return
    if (restoredRef.current === noteId) return
    restoredRef.current = noteId
    restoreCursorPosition()
  }, [noteId, restoreCursorPosition])

  return { onContentLoaded, saveCursorPosition }
}
