import {
  type BlockNoteEditor,
  BlockNoteSchema,
  combineByGroup,
  createCodeBlockSpec,
  createStyleSpecFromTipTapMark,
  defaultBlockSpecs,
  defaultStyleSpecs,
} from '@blocknote/core'
import { filterSuggestionItems } from '@blocknote/core/extensions'
import * as locales from '@blocknote/core/locales'
import {
  AddBlockButton,
  BlockColorsItem,
  DragHandleButton,
  FormattingToolbar,
  FormattingToolbarController,
  getDefaultReactSlashMenuItems,
  getFormattingToolbarItems,
  LinkToolbarController,
  RemoveBlockItem,
  SideMenu,
  SideMenuController,
  SuggestionMenuController,
  useCreateBlockNote,
} from '@blocknote/react'
import { BlockNoteView } from '@blocknote/shadcn'
import {
  getMultiColumnSlashMenuItems,
  multiColumnDropCursor,
  locales as multiColumnLocales,
  withMultiColumn,
} from '@blocknote/xl-multi-column'
import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { Code } from '@tiptap/extension-code'
import { Copy, Download, Link, Trash2 } from 'lucide-react'
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { CopyablePath } from '@/shared/ui/CopyablePath'
import type { SaveStatus } from '..'
import {
  checklistSplitFixExtension,
  cursorCenteringExtension,
  cursorVimKeysExtension,
  decodeAssetPath,
  getImageNameFallback,
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
import { useImageAutoSave } from '../hooks/useImageAutoSave'
import { useImageErrorFallback } from '../hooks/useImageErrorFallback'
import { useImageLoadingIndicator } from '../hooks/useImageLoadingIndicator'
import { useImageLocalizationScanner } from '../hooks/useImageLocalizationScanner'
import { useLinkClickHandler } from '../hooks/useLinkClickHandler'
import { useLinkPreview } from '../hooks/useLinkPreview'
import { useSearchReplace } from '../hooks/useSearchReplace'
import { codeBlockOptions } from '../lib/codeBlockConfig'
import { DEFAULT_BLOCKS } from '../lib/constants'
import { rangeCheckToggleExtension } from '../lib/rangeCheckToggle'
import { readOnlyGuardExtension, setReadOnly } from '../lib/readOnlyGuard'
import { slashMenuEmacsKeysExtension } from '../lib/slashMenuEmacsKeys'
import { ConvertToLinkButton } from './ConvertToLinkButton'
import { CopyBlockItem } from './CopyBlockItem'
import { CustomColorStyleButton } from './CustomColorStyleButton'
import { CustomLinkToolbar } from './CustomLinkToolbar'
import { DownloadButton } from './DownloadButton'
import { DuplicateBlockItem } from './DuplicateBlockItem'
import type { EditLinkDialogState } from './EditLinkButton'
import { EditLinkRequestContext } from './EditLinkButton'
import { EditLinkDialog } from './EditLinkDialog'
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
 * Extracts the file extension from a filename or URL (lowercase, without dot).
 * Returns `undefined` if the string has no recognisable extension.
 */
function getExtension(str: string): string | undefined {
  const path = str.split('?')[0]!.split('#')[0]!
  const lastDot = path.lastIndexOf('.')
  if (lastDot === -1) return undefined
  const ext = path.slice(lastDot + 1).toLowerCase()
  return ext.length > 0 && ext.length <= 5 ? ext : undefined
}

/**
 * Temporarily patches `view.dispatch` so that every transaction dispatched
 * during `fn` carries `setMeta("addToHistory", false)`.
 * loads (e.g. `replaceBlocks`, `backfillImageNames`) as undoable steps.
 *
 * @param view - The ProseMirror editor view whose `dispatch` to patch.
 *   When `null`, `fn` is called without any patching.
 * @param fn - The callback to execute with history suppression active.
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
 * Extracts a human-readable error message from an unknown caught value.
 */
function getErrorMessage(e: unknown, prefix: string): string {
  const detail =
    e instanceof Error ? e.message : typeof e === 'string' ? e : undefined
  return detail ? `${prefix}: ${detail}` : prefix
}

/**
 * Custom BlockNote schema with Shiki-powered syntax highlighting for code blocks
 * and inline code + highlight mark coexistence.
 *
 * **Block specs** – Replaces the default `codeBlock` spec with one configured
 * via {@link codeBlockOptions}, which provides a Shiki highlighter and the full
 * set of supported programming languages. All other block specs (paragraph,
 * heading, bulletList, image, etc.) are inherited from
 * {@link defaultBlockSpecs} unchanged.
 *
 * **Style specs** – Re-declares every default style spec in an explicit order
 * so that the `code` mark is registered **last**. ProseMirror renders marks in
 * registration order (outermost first), so placing `code` last ensures the
 * `<code>` element nests *inside* all other mark spans (bold, italic,
 * textColor, backgroundColor, etc.). This makes the `backgroundColor`
 * `<span>` wrap the `<code>` element — not the other way around — so the
 * highlight box matches normal text height.
 *
 * The `code` mark itself is overridden via {@link Code}.extend to set
 * `excludes: ''` (exclude no marks), replacing TipTap's default
 * `excludes: '_'` (exclude all). This allows inline code to coexist with
 * highlight, textColor, bold, italic, underline, and strike — matching
 * Notion's behaviour.
 */
const schema = withMultiColumn(
  BlockNoteSchema.create({
    blockSpecs: {
      ...defaultBlockSpecs,
      codeBlock: createCodeBlockSpec(codeBlockOptions),
    },
    styleSpecs: {
      // Explicit ordering: code is placed LAST so it nests inside all other
      // marks (bold, italic, textColor, backgroundColor, etc.).  This ensures
      // the backgroundColor <span> wraps the <code> element — not the other
      // way around — so the highlight box matches normal text height.
      bold: defaultStyleSpecs.bold,
      italic: defaultStyleSpecs.italic,
      underline: defaultStyleSpecs.underline,
      strike: defaultStyleSpecs.strike,
      textColor: defaultStyleSpecs.textColor,
      backgroundColor: defaultStyleSpecs.backgroundColor,
      // Override TipTap Code mark's `excludes: '_'` (exclude all marks) with
      // `excludes: ''` (exclude none) so inline code can coexist with highlight,
      // textColor, bold, italic, underline, and strike — matching Notion behavior.
      code: createStyleSpecFromTipTapMark(
        Code.extend({ excludes: '' }),
        'boolean'
      ),
    },
  })
)

/**
 * Props for the {@link Editor} component.
 *
 * @property noteId - The ID of the note to load, or `null` for a new untitled note.
 * @property locked - Whether the editor is in read-only mode. Defaults to `false`.
 * @property onNoteSaved - Optional callback invoked after the note content is auto-saved.
 * @property onStatusChange - Optional callback invoked whenever the save status changes.
 * @property onContentLoaded - Optional callback invoked once the note content has finished loading.
 * @property onSuggestionMenuOpen - Optional callback invoked with the cursor's `clientY`
 *   coordinate when the suggestion menu (slash command palette) opens.
 * @property onLockStateChange - Optional callback invoked when the lock state of the
 *   loaded note is determined.
 */
interface EditorProps {
  noteId: string | null
  locked?: boolean
  onNoteSaved?: (id: string) => void
  onStatusChange?: (status: SaveStatus) => void
  onContentLoaded?: () => void
  onSuggestionMenuOpen?: (cursorClientY: number) => void
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
  /** Tracks the block ID of the image that was last right-clicked. */
  const contextMenuBlockIdRef = useRef<string | null>(null)
  /** Ref attached to the outer editor container used by the contextmenu capture listener. */
  const editorContainerRef = useRef<HTMLDivElement>(null)
  /**
   * Whether the editor content has finished loading and is safe to display.
   *
   * Starts as `false` so the editor wrapper renders with `opacity-0`,
   * preventing a flash of stale/default content. Set to `true` once
   * the note content (or the empty-note default) has been fully applied
   * to the editor inside the content-loading `useEffect`.
   */
  const [contentReady, setContentReady] = useState(false)
  /** Rename dialog state (null = closed, object = open for that block). */
  const [renameState, setRenameState] = useState<RenameDialogState | null>(null)
  /** Edit-link dialog state (null = closed, object = open for that link). */
  const [editLinkState, setEditLinkState] =
    useState<EditLinkDialogState | null>(null)
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
      <DownloadButton key="downloadButton" />,
      <ConvertToLinkButton key="convertToLinkButton" />,
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
    dropCursor: multiColumnDropCursor,
    dictionary: {
      ...locales.en,
      multi_column: multiColumnLocales.en,
    },
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

  /**
   * Type-erased alias used by hooks and components that accept the default
   * BlockNote schema. The extended schema (with column blocks) is additive, so
   * all default-schema operations remain valid at runtime.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorAny = editor as unknown as BlockNoteEditor

  /** Exposes the editor instance to parent components via the forwarded ref. */
  useImperativeHandle(ref, () => ({ editor: editorAny }), [editorAny])

  // Sync the locked prop to the module-level flag read by the ProseMirror plugin.
  useEffect(() => {
    setReadOnly(locked)
  }, [locked])

  /** Intercepts Cmd/Ctrl+Click on links inside the editor to open them in the browser. */
  useLinkClickHandler(editorAny)
  /** Shows a toast notification when the user copies content from the editor. */
  useCopyToast(editorAny)
  // Rewrite clipboard text/plain so Markdown lists are tight (no blank lines between items).
  useClipboardTightenList(editorAny)

  /** Whether remote images should be downloaded and saved locally on insertion. */
  const { enabled: imageAutoSaveEnabled } = useImageAutoSave()
  /** Scans the document for remote image URLs and localizes them asynchronously. */
  const { scanAndLocalize } = useImageLocalizationScanner(
    editorAny,
    imageAutoSaveEnabled
  )
  /** Replaces broken image elements (404 / deleted local file) with a placeholder. */
  useImageErrorFallback(editorContainerRef)
  /** Shows an animate-pulse skeleton while each image is loading. */
  useImageLoadingIndicator(editorContainerRef)

  /**
   * After every file upload completes, ensure the uploaded image block has a
   * non-empty name so the bubble menu hover-target area remains accessible
   * (see issue #40).  The `caption` prop is synced to match `name` so
   * BlockNote renders the caption area.
   */
  useEffect(() => {
    const onUploadEnd = (blockId?: string) => {
      if (!blockId) return
      const block = editor.getBlock(blockId)
      if (!block) return
      const name = getImageNameFallback(block)
      if (name) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        editor.updateBlock(block, { props: { name, caption: name } } as any)
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
  const search = useSearchReplace(editorAny)

  /**
   * Walks the editor document tree and ensures every image block has a
   * non-empty `name` and that `caption` is synced to match `name`.
   * This ensures hover-target areas exist for the formatting toolbar
   * (see issue #40).
   *
   * Must be called while `loadingRef.current === true` so the auto-save
   * guard in `handleChange` prevents unnecessary writes during initial load.
   */
  const backfillImageNames = useCallback(() => {
    const walk = (blocks: typeof editor.document) => {
      for (const block of blocks) {
        const name = getImageNameFallback(block)
        if (name) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          editor.updateBlock(block, { props: { name, caption: name } } as any)
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
        backfillImageNames()
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
            backfillImageNames()
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
  }, [noteId, editor, backfillImageNames, onContentLoaded, onLockStateChange])

  /**
   * Callback invoked by BlockNote on every document change.
   *
   * While the editor is still loading (`loadingRef.current === true`) the
   * callback exits early to prevent auto-save from firing on the initial
   * content population.  Otherwise it:
   *
   * 1. Calls {@link backfillImageNames} to ensure every image block has a
   *    non-empty `name` and `caption` is synced (covers the `text/html` paste
   *    path where `onUploadEnd` is not fired, e.g. right-click "Copy Image").
   * 2. Schedules a debounced auto-save of the serialized document.
   *
   * `backfillImageNames` only calls `updateBlock` when it finds an empty
   * name, so the subsequent re-trigger of `onChange` is a no-op and does
   * not cause an infinite loop.
   */
  const handleChange = useCallback(() => {
    if (loadingRef.current) return
    backfillImageNames()
    scanAndLocalize()
    scheduleSave(JSON.stringify(editor.document))
  }, [editor, scheduleSave, backfillImageNames, scanAndLocalize])

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
   * 2. **Inside `.bn-container`** – if the click originated inside the
   *    BlockNote container (including the editor, toolbars, menus, and other
   *    UI overlays), the callback returns early and lets the default browser
   *    behaviour handle focus normally.
   *
   * @param e - The React mouse event from the wrapper `<div>`.
   */
  const handleWrapperClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (locked) return
      const target = e.target as HTMLElement
      if (target.closest('.bn-container')) return
      if (target.closest('[role="dialog"]')) return

      const lastBlock = editor.document[editor.document.length - 1]
      if (lastBlock) {
        editor.setTextCursorPosition(lastBlock, 'end')
      }
      editor.focus()
    },
    [editor, locked]
  )

  /**
   * Capture-phase contextmenu listener attached to the outer editor container.
   *
   * - For image right-clicks: stores the block ID and lets the event propagate
   *   so base-ui's ContextMenu trigger can open at the cursor position.
   * - For all other right-clicks: stops propagation so the ContextMenu never
   *   opens, leaving the platform's native text menu intact.
   */
  useEffect(() => {
    const container = editorContainerRef.current
    if (!container) return

    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const isOnImage = Boolean(target.closest('.bn-visual-media-wrapper'))

      if (!isOnImage || !editor.isEditable) {
        e.stopImmediatePropagation()
        return
      }

      const blockContainerEl = target.closest(
        '[data-node-type="blockContainer"]'
      ) as HTMLElement | null
      contextMenuBlockIdRef.current = blockContainerEl?.dataset.id ?? null
      // Suppress the native OS/WebView context menu for images.
      e.preventDefault()
    }

    container.addEventListener('contextmenu', handler, { capture: true })
    return () =>
      container.removeEventListener('contextmenu', handler, { capture: true })
  }, [editor])

  /**
   * Downloads the image block that was last right-clicked via the context menu.
   *
   * Opens a native save-file dialog pre-populated with the image filename,
   * then delegates the actual file transfer to the Rust `download_file` command,
   * which handles both remote HTTP/HTTPS URLs (via `reqwest`) and local
   * `asset://` URLs (via direct file copy).
   *
   * Extension resolution order: block `name` prop → URL path → fallback `"png"`.
   * On success a toast displays the saved path via {@link CopyablePath}.
   * On failure the error message is surfaced as an error toast notification.
   */
  const handleImageDownload = useCallback(async () => {
    const blockId = contextMenuBlockIdRef.current
    if (!blockId) return

    const block = editor.getBlock(blockId)
    if (!block) return

    const props = block.props as Record<string, unknown>
    const url = props.url as string
    if (!url) return

    const name = (props.name as string) || 'image'
    const ext = getExtension(name) ?? getExtension(url) ?? 'png'
    const baseName = name.includes('.') ? name : `${name}.${ext}`

    try {
      const path = await save({
        defaultPath: baseName,
        filters: [{ name: 'Image', extensions: [ext] }],
      })
      if (!path) return
      await invoke('download_file', { url, destPath: path })
      toast.success('Downloaded', {
        description: <CopyablePath path={path} />,
      })
    } catch (e) {
      toast.error(getErrorMessage(e, 'Download failed'))
    }
  }, [editor])

  /**
   * Removes the image block that was last right-clicked via the context menu.
   *
   * Retrieves the block ID stored by the capture-phase `contextmenu` handler
   * and delegates removal to BlockNote's `removeBlocks` API. No-ops when no
   * block ID has been recorded (e.g. when the context menu was not triggered
   * from an image block).
   */
  const handleImageDelete = useCallback(() => {
    const blockId = contextMenuBlockIdRef.current
    if (!blockId) return
    editor.removeBlocks([blockId])
  }, [editor])

  /**
   * Copies the source URL of the image block that was last right-clicked.
   *
   * Reads the `url` prop from the block identified by `contextMenuBlockIdRef`
   * and writes it to the system clipboard via the Web Clipboard API
   * (`navigator.clipboard.writeText`). Surfaces a success or error toast
   * notification depending on the outcome.
   */
  const handleImageCopyUrl = useCallback(async () => {
    const blockId = contextMenuBlockIdRef.current
    if (!blockId) return

    const block = editor.getBlock(blockId)
    if (!block) return

    const props = block.props as Record<string, unknown>
    const url = props.url as string
    if (!url) return

    // For locally saved images, copy the decoded OS path instead of the
    // raw asset:// URL so the user gets a usable file-system path.
    const copyText = decodeAssetPath(url)

    try {
      await navigator.clipboard.writeText(copyText)
      toast.success('URL copied')
    } catch {
      toast.error('Failed to copy URL')
    }
  }, [editor])

  /** Copies the image data of the block that was last right-clicked to the native clipboard.
   *
   * Delegates fetching and clipboard writing to the Rust backend via
   * `copy_image_to_clipboard_native`, which uses `NSPasteboard` via `osascript` to
   * bypass WKWebView's Clipboard API permission restrictions.
   */
  const handleImageCopyImage = useCallback(async () => {
    const blockId = contextMenuBlockIdRef.current
    if (!blockId) return

    const block = editor.getBlock(blockId)
    if (!block) return

    const props = block.props as Record<string, unknown>
    const url = props.url as string
    if (!url) return

    try {
      await invoke('copy_image_to_clipboard_native', { url })
      toast.success('Image copied')
    } catch (e) {
      toast.error(getErrorMessage(e, 'Failed to copy image'))
    }
  }, [editor])

  return (
    <>
      {/* Editor wrapper — starts invisible (`opacity-0`) and transitions to
          `opacity-100` once `contentReady` is true, preventing a flash of
          stale/default content while the real note loads. */}
      {/* Outer container holds the capture-phase contextmenu listener that
          selectively opens the ContextMenu only for image right-clicks. */}
      <div ref={editorContainerRef}>
        <ContextMenu>
          <ContextMenuTrigger className="select-text">
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
                slashMenu={false}
                sideMenu={false}
              >
                {/* Custom slash menu that includes the default items plus multi-column ones. */}
                <SuggestionMenuController
                  triggerCharacter="/"
                  getItems={async (query) =>
                    filterSuggestionItems(
                      combineByGroup(
                        getDefaultReactSlashMenuItems(editor),
                        getMultiColumnSlashMenuItems(editor)
                      ),
                      query
                    )
                  }
                />
                {!locked && (
                  <>
                    <SideMenuController
                      sideMenu={(props) => (
                        <SideMenu {...props}>
                          <AddBlockButton />
                          <DragHandleButton {...props}>
                            <DuplicateBlockItem>
                              Duplicate Block
                            </DuplicateBlockItem>
                            <CopyBlockItem>Copy Block</CopyBlockItem>
                            <RemoveBlockItem>Delete</RemoveBlockItem>
                            <BlockColorsItem>Colors</BlockColorsItem>
                          </DragHandleButton>
                        </SideMenu>
                      )}
                    />
                    <FormattingToolbarController
                      formattingToolbar={() => (
                        <FormattingToolbar blockTypeSelectItems={[]}>
                          {formattingToolbarItems}
                        </FormattingToolbar>
                      )}
                    />
                    <EditLinkRequestContext.Provider value={setEditLinkState}>
                      <LinkToolbarController linkToolbar={CustomLinkToolbar} />
                    </EditLinkRequestContext.Provider>
                    <EditLinkDialog
                      state={editLinkState}
                      onDismiss={() => setEditLinkState(null)}
                    />
                  </>
                )}
              </BlockNoteView>
            </div>
          </ContextMenuTrigger>
          {!locked && (
            <ContextMenuContent>
              <ContextMenuItem onClick={handleImageCopyUrl}>
                <Link />
                Copy URL
              </ContextMenuItem>
              <ContextMenuItem onClick={handleImageCopyImage}>
                <Copy />
                Copy Image
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={handleImageDownload}>
                <Download />
                Download
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                variant="destructive"
                onClick={handleImageDelete}
              >
                <Trash2 />
                Delete
              </ContextMenuItem>
            </ContextMenuContent>
          )}
        </ContextMenu>
      </div>
      <RenameDialog
        editor={editorAny}
        state={renameState}
        onDismiss={() => setRenameState(null)}
      />
      <SearchReplacePanel {...search} />
    </>
  )
})
