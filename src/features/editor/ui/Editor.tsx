import {
  type BlockNoteEditor,
  BlockNoteSchema,
  createCodeBlockSpec,
  defaultBlockSpecs,
} from '@blocknote/core'
import {
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
  LinkToolbarController,
  useCreateBlockNote,
} from '@blocknote/react'
import { BlockNoteView } from '@blocknote/shadcn'
import type { Transaction } from 'prosemirror-state'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'
import { useEditorFont } from '@/app/providers/editor-font-provider'
import { useTheme } from '@/app/providers/theme-provider'
import { useToolbarConfig } from '@/app/providers/toolbar-config-provider'
import type { SaveStatus } from '..'
import {
  checklistSplitFixExtension,
  cursorCenteringExtension,
  cursorVimKeysExtension,
  imeCompositionGuard,
  resolveImageUrl,
  searchExtension,
  uploadImage,
  useCursorCentering,
} from '..'
import { getNote } from '../api/notes'
import { useAutoSave } from '../hooks/useAutoSave'
import { useClipboardTightenList } from '../hooks/useClipboardTightenList'
import { useCopyToast } from '../hooks/useCopyToast'
import { useEditorFontSize } from '../hooks/useEditorFontSize'
import { useLinkClickHandler } from '../hooks/useLinkClickHandler'
import { useLinkPreview } from '../hooks/useLinkPreview'
import { useSearchReplace } from '../hooks/useSearchReplace'
import { codeBlockOptions } from '../lib/codeBlockConfig'
import { DEFAULT_BLOCKS } from '../lib/constants'
import { rangeCheckToggleExtension } from '../lib/rangeCheckToggle'
import { readOnlyGuardExtension, setReadOnly } from '../lib/readOnlyGuard'
import { slashMenuEmacsKeysExtension } from '../lib/slashMenuEmacsKeys'
import type { CaptionDialogState } from './CaptionButton'
import { CaptionButton } from './CaptionButton'
import { CaptionDialog } from './CaptionDialog'
import { CustomColorStyleButton } from './CustomColorStyleButton'
import { CustomLinkToolbar } from './CustomLinkToolbar'
import { DownloadButton } from './DownloadButton'
import { HighlightButton } from './HighlightButton'
import type { RenameDialogState } from './RenameButton'
import { RenameButton } from './RenameButton'
import { RenameDialog } from './RenameDialog'
import { SearchReplacePanel } from './SearchReplacePanel'
import '@blocknote/shadcn/style.css'
import '@blocknote/core/fonts/inter.css'

/**
 * Default editor blocks cast to `any` to satisfy BlockNote's generic overloads.
 *
 * Uses the {@link DEFAULT_BLOCKS} constant which defines the initial empty
 * document structure shown when no persisted content is loaded.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BLOCKS = DEFAULT_BLOCKS as any

/**
 * Returns a fallback caption for an image block whose caption is empty.
 *
 * Uses the block's `name` prop (e.g. alt text from `<img>` HTML) when
 * available, otherwise falls back to the literal string `"image"`.
 * Returns `null` if the block is not an image or already has a non-empty caption.
 */
function getImageCaptionFallback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  block: any
): string | null {
  if (block?.type !== 'image') return null
  const props = block.props as Record<string, unknown> | undefined
  if (!props || props.caption !== '') return null
  return (typeof props.name === 'string' && props.name) || 'image'
}

/**
 * Temporarily patches `view.dispatch` so that every transaction dispatched
 * during `fn` carries `setMeta("addToHistory", false)`.
 *
 * This prevents prosemirror-history from recording programmatic content
 * loads (e.g. `replaceBlocks`, `backfillImageCaptions`) as undoable steps.
 */
function withSuppressedHistory(
  view: { dispatch: (tr: Transaction) => void } | null,
  fn: () => void
): void {
  if (!view) {
    fn()
    return
  }
  const originalDispatch = view.dispatch
  view.dispatch = (tr: Transaction) => {
    originalDispatch(tr.setMeta('addToHistory', false))
  }
  try {
    fn()
  } finally {
    view.dispatch = originalDispatch
  }
}

/**
 * Custom BlockNote schema with Shiki-powered syntax highlighting for code blocks.
 *
 * Replaces the default `codeBlock` spec with one configured via
 * {@link codeBlockOptions}, which provides a Shiki highlighter and the full
 * set of supported programming languages.
 *
 * All other block specs (paragraph, heading, bulletList, image, etc.) are
 * inherited from {@link defaultBlockSpecs} unchanged.
 */
const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: createCodeBlockSpec(codeBlockOptions),
  },
})

/**
 * Props for the {@link Editor} component.
 *
 * @property noteId - The ID of the note to load, or `null` for a new untitled note.
 * @property onNoteSaved - Optional callback invoked after the note content is auto-saved.
 * @property onStatusChange - Optional callback invoked whenever the save status changes.
 * @property onContentLoaded - Optional callback invoked once the note content has finished loading.
 * @property onSuggestionMenuOpen - Optional callback invoked with the cursor's `clientY`
 *   coordinate when the suggestion menu (slash command palette) opens.
 */
interface EditorProps {
  noteId: string | null
  /** Whether the editor is in read-only mode. Defaults to `false`. */
  locked?: boolean
  onNoteSaved?: (id: string) => void
  onStatusChange?: (status: SaveStatus) => void
  onContentLoaded?: () => void
  /** Called with the cursor's clientY coordinate when the suggestion menu (slash command palette) opens. */
  onSuggestionMenuOpen?: (cursorClientY: number) => void
  /** Called when the lock state of the loaded note is determined. */
  onLockStateChange?: (locked: boolean) => void
}

/**
 * Handle exposed by the {@link Editor} component via `React.forwardRef`.
 *
 * Provides imperative access to the underlying BlockNote editor instance,
 * allowing parent components to read or manipulate editor state directly.
 */
export interface EditorHandle {
  /** The underlying BlockNote editor instance. */
  editor: BlockNoteEditor
}

/**
 * Set of toolbar item keys that are context-dependent (always rendered,
 * self-hide when irrelevant). These are NOT user-configurable.
 *
 * Pass-through items are prepended to the formatting toolbar in their
 * original order before any user-configurable items.
 *
 * @see formattingToolbarItems - the `useMemo` that consumes this set
 */
const PASS_THROUGH_KEYS = new Set([
  'blockTypeSelect',
  'tableCellMergeButton',
  'fileDeleteButton',
])

/**
 * BlockNote-based rich-text editor with auto-save, link handling,
 * and integrated search & replace.
 *
 * When a `noteId` is provided the component fetches the persisted
 * content from the backend; otherwise it renders the default blank
 * document. Changes are debounced and auto-saved via the
 * {@link useAutoSave} hook.
 *
 * The component is implemented as a `forwardRef` that exposes the
 * underlying {@link BlockNoteEditor} instance through {@link EditorHandle}.
 *
 * Rendered structure:
 * - A wrapper `<div>` with CSS custom properties for font size and family.
 * - A {@link BlockNoteView} with custom formatting toolbar and link toolbar.
 * - A {@link SearchReplacePanel} for find/replace functionality.
 *
 * @example
 * ```tsx
 * const handleRef = useRef<EditorHandle>(null);
 * <Editor ref={handleRef} noteId="abc123" onNoteSaved={(id) => console.log(id)} />
 * ```
 */
export const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  {
    noteId,
    locked = false,
    onNoteSaved,
    onStatusChange,
    onContentLoaded,
    onSuggestionMenuOpen,
    onLockStateChange,
  },
  ref
) {
  /**
   * Tracks whether the editor is still loading initial content.
   *
   * While `true`, `handleChange` exits early to prevent auto-save from
   * firing on programmatic content population (e.g. `replaceBlocks`).
   * Set to `false` once the note content has been fully applied.
   */
  const loadingRef = useRef(true)
  /**
   * Whether the editor content has finished loading and is safe to display.
   *
   * Starts as `false` so the editor wrapper renders with `opacity-0`,
   * preventing a flash of stale/default content. Set to `true` once
   * the note content (or the empty-note default) has been fully applied
   * to the editor inside the content-loading `useEffect`.
   */
  const [contentReady, setContentReady] = useState(false)
  /** Caption dialog state (null = closed, object = open for that block). */
  const [captionState, setCaptionState] = useState<CaptionDialogState | null>(
    null
  )
  /** Rename dialog state (null = closed, object = open for that block). */
  const [renameState, setRenameState] = useState<RenameDialogState | null>(null)
  /** Resolved theme ("light" or "dark") passed to BlockNoteView. */
  const { resolvedTheme } = useTheme()
  /** User-configured editor font size in pixels. */
  const { fontSize } = useEditorFontSize()
  /** User-configured editor font family string. */
  const { fontFamily } = useEditorFont()
  /** User-configured toolbar item order and visibility from the persistent store. */
  const { items: toolbarItemConfigs } = useToolbarConfig()

  /** Keeps the cursor vertically centered in the viewport during navigation. */
  useCursorCentering()

  /**
   * Builds the formatting toolbar items respecting user-configured
   * order and visibility from the ToolbarConfigProvider.
   *
   * Context-dependent items (blockTypeSelect, table, file operations)
   * are always prepended in their original order. Customizable items
   * follow in the user-defined order, filtered by visibility.
   */
  const formattingToolbarItems = useMemo(() => {
    const allItems = getFormattingToolbarItems()
    const itemMap = new Map<string, React.ReactElement>()
    const leadingPassThrough: React.ReactElement[] = []
    let fileDeleteButton: React.ReactElement | null = null

    for (const item of allItems) {
      const key = item.key as string
      if (!PASS_THROUGH_KEYS.has(key)) {
        itemMap.set(key, item)
        continue
      }
      if (key === 'fileDeleteButton') {
        fileDeleteButton = item
      } else {
        leadingPassThrough.push(item)
      }
    }

    itemMap.set(
      'colorStyleButton',
      <CustomColorStyleButton key="colorStyleButton" />
    )
    itemMap.set('highlightButton', <HighlightButton key="highlightButton" />)

    const configuredItems: React.ReactElement[] = []
    for (const cfg of toolbarItemConfigs) {
      if (!cfg.visible) continue
      const el = itemMap.get(cfg.key)
      if (el) configuredItems.push(el)
    }

    return [
      ...leadingPassThrough,
      <RenameButton key="renameButton" onRequestOpen={setRenameState} />,
      <CaptionButton key="captionButton" onRequestOpen={setCaptionState} />,
      <DownloadButton key="downloadButton" />,
      ...(fileDeleteButton ? [fileDeleteButton] : []),
      ...configuredItems,
    ]
  }, [toolbarItemConfigs])

  /** Debounced auto-save hook (500 ms delay). Only active when `noteId` is non-null. */
  const { scheduleSave, saveStatus } = useAutoSave(
    500,
    noteId ?? undefined,
    onNoteSaved
  )
  /** Intercepts pasted content to extract and handle embedded links. */
  const pasteHandler = useLinkPreview()

  /** Propagates the current save status to the parent component. */
  useEffect(() => {
    onStatusChange?.(saveStatus)
  }, [saveStatus, onStatusChange])

  /** BlockNote editor instance with custom schema, extensions, and image handling. */
  const editor = useCreateBlockNote({
    schema,
    initialContent: DEFAULT_BLOCKS,
    pasteHandler,
    extensions: [
      imeCompositionGuard,
      cursorCenteringExtension,
      searchExtension,
      checklistSplitFixExtension(),
      rangeCheckToggleExtension(),
      readOnlyGuardExtension,
      slashMenuEmacsKeysExtension(),
      cursorVimKeysExtension(),
    ],
    uploadFile: uploadImage,
    resolveFileUrl: resolveImageUrl,
  })

  /** Exposes the editor instance to parent components via the forwarded ref. */
  useImperativeHandle(ref, () => ({ editor }), [editor])

  // Sync the locked prop to the module-level flag read by the ProseMirror plugin.
  useEffect(() => {
    setReadOnly(locked)
  }, [locked])

  /** Intercepts Cmd/Ctrl+Click on links inside the editor to open them in the browser. */
  useLinkClickHandler(editor)
  /** Shows a toast notification when the user copies content from the editor. */
  useCopyToast(editor)
  // Rewrite clipboard text/plain so Markdown lists are tight (no blank lines between items).
  useClipboardTightenList(editor)

  /**
   * After every file upload completes, ensure the uploaded image block has a
   * non-empty caption so the bubble menu hover-target area remains accessible
   * (see issue #40).
   *
   * When images are pasted via the OS clipboard (e.g. right-click → Copy Image
   * in Chrome), they arrive as `text/html` containing an `<img>` tag.
   * BlockNote's paste handler prioritises `text/html` over `Files`, so the
   * image block is created directly from the HTML without going through
   * `uploadFile` — meaning `onUploadEnd` never fires for this path.
   *
   * This hook still covers the `uploadFile` code-path (e.g. screenshots)
   * where `onUploadEnd` *is* called but the returned caption may not have
   * been applied.
   */
  useEffect(() => {
    const onUploadEnd = (blockId?: string) => {
      if (!blockId) return
      const block = editor.getBlock(blockId)
      if (!block) return
      const caption = getImageCaptionFallback(block)
      if (caption) {
        editor.updateBlock(block, { props: { caption } } as any)
      }
    }

    return editor.onUploadEnd(onUploadEnd)
  }, [editor])

  /**
   * Subscribes to the BlockNote SuggestionMenu extension store and calls
   * `onSuggestionMenuOpen` whenever the suggestion menu becomes visible.
   *
   * The store state is `undefined` when the menu is closed, and contains
   * position/query data when it is open.  We track the previous shown state
   * to fire the callback only on the closed→open transition.
   *
   * We defer setup via `editor.onMount()` or immediately if the editor is
   * already mounted, because extensions are registered inside the mount
   * callback and may not yet be available when the React `useEffect` first runs.
   */
  useEffect(() => {
    if (!onSuggestionMenuOpen) return

    // Narrowed by the guard above — safe to capture in the closure.
    const notifyOpen = onSuggestionMenuOpen
    let unsubscribeStore: (() => void) | undefined

    function setupStoreSubscription() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ext = editor.getExtension('suggestionMenu') as
        | {
            store: {
              state: unknown
              subscribe: (cb: () => void) => () => void
            }
          }
        | undefined
      if (!ext) return

      // Start with wasShown = false regardless of the initial store state,
      // so that the first transition to shown always triggers the callback.
      let wasShown = false
      unsubscribeStore = ext.store.subscribe(() => {
        const state = ext.store.state as
          | {
              show?: boolean
              referencePos?: DOMRect
              triggerCharacter?: string
            }
          | undefined
        // BlockNote's UiElementPosition always has a `show` boolean; use it
        // instead of checking for undefined so we correctly track open/close.
        const isShown = state?.show === true
        if (isShown && !wasShown) {
          // Only scroll for the slash ("/") command palette.
          // Other suggestion menus (e.g. emoji picker triggered by ":") should
          // not cause the scroll-to-cursor behaviour.
          if (state?.triggerCharacter === '/') {
            const cursorClientY = state?.referencePos?.top ?? 0
            // Defer the scroll so it runs after ProseMirror's own scrollIntoView
            // (which fires synchronously on the same transaction).
            requestAnimationFrame(() => notifyOpen(cursorClientY))
          }
        }
        wasShown = isShown
      })
    }

    // editor.onMount() returns an unsubscribe function at runtime even though
    // the TypeScript declaration says void. We cast to capture it for cleanup.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const unsubscribeMount = (editor.onMount as any)(() => {
      setupStoreSubscription()
    }) as (() => void) | undefined

    return () => {
      unsubscribeMount?.()
      unsubscribeStore?.()
    }
  }, [editor, onSuggestionMenuOpen])

  /** Search & replace state for the {@link SearchReplacePanel}. */
  const search = useSearchReplace(editor)

  /**
   * Walks the editor document tree and sets `caption` to `"image"` on any
   * image block whose caption is empty.  This ensures hover-target areas
   * exist for the formatting toolbar (see issue #40).
   *
   * When a `name` prop is available on the image block (e.g. the alt text
   * extracted from `<img>` HTML), it is used as the caption.  Otherwise
   * falls back to the literal string `"image"`.
   *
   * Must be called while `loadingRef.current === true` so the auto-save
   * guard in `handleChange` prevents unnecessary writes during initial load.
   */
  const backfillImageCaptions = useCallback(() => {
    const walk = (blocks: typeof editor.document) => {
      for (const block of blocks) {
        const caption = getImageCaptionFallback(block)
        if (caption) {
          editor.updateBlock(block, { props: { caption } } as any)
        }
        if (block.children?.length) {
          walk(block.children)
        }
      }
    }
    walk(editor.document)
  }, [editor])

  /**
   * Loads note content into the BlockNote editor when `noteId` changes.
   *
   * - If no `noteId` is provided, the editor is reset to default blocks.
   * - If a `noteId` is given, the persisted content is fetched and parsed.
   *   If parsing fails (e.g. corrupted JSON), the editor falls back to
   *   default blocks.  Network errors are surfaced via a toast notification.
   *
   * The `stale` flag guards against race conditions: when `noteId` changes
   * rapidly, earlier fetch responses are discarded.  `loadingRef` is used
   * by `handleChange` to suppress auto-save until the content has finished
   * loading.
   *
   * Once loading completes (either synchronously for the no-id path or
   * in the `.finally()` block for fetched notes), `setContentReady(true)`
   * is called to flip the editor wrapper from `opacity-0` to `opacity-100`,
   * preventing a flash of stale/default content before the real note
   * appears.
   */
  useEffect(() => {
    let stale = false
    loadingRef.current = true
    if (!noteId) {
      withSuppressedHistory(editor.prosemirrorView, () => {
        editor.replaceBlocks(editor.document, BLOCKS)
        backfillImageCaptions()
      })
      queueMicrotask(() => {
        if (!stale) {
          loadingRef.current = false
          setContentReady(true)
          onContentLoaded?.()
          onLockStateChange?.(false)
        }
      })
      return
    }

    getNote(noteId)
      .then((note) => {
        if (stale) return
        if (note) {
          onLockStateChange?.(note.isLocked)
          withSuppressedHistory(editor.prosemirrorView, () => {
            try {
              editor.replaceBlocks(
                editor.document,
                JSON.parse(note.content) as any
              )
            } catch {
              editor.replaceBlocks(editor.document, BLOCKS)
            }
            backfillImageCaptions()
          })
        } else {
          toast.error('Note not found')
        }
      })
      .catch(() => {
        if (!stale) toast.error('Failed to load note')
      })
      .finally(() => {
        if (!stale) {
          loadingRef.current = false
          setContentReady(true)
          onContentLoaded?.()
        }
      })

    return () => {
      stale = true
    }
  }, [
    noteId,
    editor,
    backfillImageCaptions,
    onContentLoaded,
    onLockStateChange,
  ])

  /**
   * Callback invoked by BlockNote on every document change.
   *
   * While the editor is still loading (`loadingRef.current === true`) the
   * callback exits early to prevent auto-save from firing on the initial
   * content population.  Otherwise it:
   *
   * 1. Calls {@link backfillImageCaptions} to ensure every image block has a
   *    non-empty caption (covers the `text/html` paste path where
   *    `onUploadEnd` is not fired, e.g. right-click "Copy Image" in Chrome).
   * 2. Schedules a debounced auto-save of the serialized document.
   *
   * `backfillImageCaptions` only calls `updateBlock` when it finds an empty
   * caption, so the subsequent re-trigger of `onChange` is a no-op and does
   * not cause an infinite loop.
   */
  const handleChange = useCallback(() => {
    if (loadingRef.current) return
    backfillImageCaptions()
    scheduleSave(JSON.stringify(editor.document))
  }, [editor, scheduleSave, backfillImageCaptions])

  /**
   * Handles clicks on the editor wrapper's padding area.
   *
   * The editor wrapper has generous bottom padding (`pb-[60vh]`) so that
   * users can scroll content above the fold. Clicking in this padding zone
   * does not naturally focus the editor because the click target is outside
   * the `.bn-editor` contenteditable region. This callback detects such
   * clicks and programmatically focuses the editor with the cursor placed
   * at the end of the last block.
   *
   * Early-return guards:
   * 1. **Locked mode** – when the editor is read-only (`locked` is `true`),
   *    the callback is a no-op so that clicking the padding area does not
   *    steal focus or move the cursor.
   * 2. **Inside `.bn-editor`** – if the click originated inside the
   *    contenteditable region (including any descendant elements), the
   *    callback returns early and lets the default browser behaviour handle
   *    focus normally.
   *
   * @param e - The React mouse event from the wrapper `<div>`.
   */
  const handleWrapperClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (locked) return
      const target = e.target as HTMLElement
      if (target.closest('.bn-editor')) return

      const lastBlock = editor.document[editor.document.length - 1]
      if (lastBlock) {
        editor.setTextCursorPosition(lastBlock, 'end')
      }
      editor.focus()
    },
    [editor, locked]
  )

  return (
    <>
      {/* Editor wrapper — starts invisible (`opacity-0`) and transitions to
          `opacity-100` once `contentReady` is true, preventing a flash of
          stale/default content while the real note loads. */}
      <div
        className={`w-full min-h-screen px-8 pb-[60vh] ${contentReady ? 'opacity-100' : 'opacity-0'}`}
        data-editor-root
        data-locked={locked || undefined}
        onClick={handleWrapperClick}
        style={
          {
            '--editor-font-size': `${fontSize}px`,
            '--editor-font-family': fontFamily,
          } as React.CSSProperties
        }
      >
        <BlockNoteView
          editor={editor}
          editable={true}
          theme={resolvedTheme}
          onChange={handleChange}
          formattingToolbar={false}
          linkToolbar={false}
        >
          {!locked && (
            <>
              <FormattingToolbarController
                formattingToolbar={() => (
                  <FormattingToolbar blockTypeSelectItems={[]}>
                    {formattingToolbarItems}
                  </FormattingToolbar>
                )}
              />
              <LinkToolbarController linkToolbar={CustomLinkToolbar} />
              <CaptionDialog
                state={captionState}
                onDismiss={() => setCaptionState(null)}
              />
              <RenameDialog
                state={renameState}
                onDismiss={() => setRenameState(null)}
              />
            </>
          )}
        </BlockNoteView>
      </div>
      <SearchReplacePanel {...search} />
    </>
  )
})
