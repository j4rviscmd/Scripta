import {
  useBlockNoteEditor,
  useComponentsContext,
  useEditorState,
} from '@blocknote/react'
import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { Download } from 'lucide-react'
import { useCallback } from 'react'
import { toast } from 'sonner'

/** Extracts the file extension from a filename or URL (without dot). */
function getExtension(str: string): string | undefined {
  // Strip query string / hash
  const path = str.split('?')[0]!.split('#')[0]!
  const lastDot = path.lastIndexOf('.')
  if (lastDot === -1) return
  const ext = path.slice(lastDot + 1).toLowerCase()
  // Reject if extension looks non-standard (e.g. more than 5 chars, or empty)
  if (ext.length === 0 || ext.length > 5) return
  return ext
}

/**
 * Toolbar button that downloads the selected image/file block.
 *
 * Replaces BlockNote's built-in {@code FileDownloadButton} which uses
 * {@code window.open()} — blocked in Tauri's webview.
 *
 * Delegates the actual download to the Rust backend via
 * {@code download_file} command, which handles both remote URLs
 * (HTTP download) and local asset-protocol URLs (file copy).
 */
export const DownloadButton = () => {
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor()

  /** Resolves to the single selected block only when it has a `url` string
   *  prop (i.e. an image or file block). Returns `undefined` when no such
   *  block is selected, causing the button to self-hide. */
  const block = useEditorState({
    editor,
    selector: ({ editor }) => {
      const blocks = editor.getSelection()?.blocks || [
        editor.getTextCursorPosition().block,
      ]
      if (blocks.length !== 1) return
      const b = blocks[0]
      const props = b.props as Record<string, unknown>
      if (typeof props?.url === 'string') {
        return b
      }
      return
    },
  })

  /**
   * Opens a native save-file dialog and delegates the actual download to the
   * Rust backend via the `download_file` Tauri command.
   *
   * The file extension is derived from the block's `name` prop first, then
   * from the URL, and finally falls back to `"png"`. Errors are surfaced as
   * toast notifications.
   */
  const handleDownload = useCallback(async () => {
    if (!block) return
    const props = block.props as Record<string, unknown>
    const url = props.url as string
    const name = (props.name as string) || 'image'

    // Extract extension from name or URL
    const ext = getExtension(name) || getExtension(url) || 'png'
    const baseName = name.includes('.') ? name : `${name}.${ext}`

    try {
      const path = await save({
        defaultPath: baseName,
        filters: [{ name: 'Image', extensions: [ext] }],
      })
      if (!path) return

      await invoke('download_file', { url, destPath: path })
    } catch (e) {
      if (e instanceof Error && e.message) {
        toast.error(`Download failed: ${e.message}`)
      }
    }
  }, [block])

  if (block === undefined) return null

  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      onClick={handleDownload}
      label="Download"
      mainTooltip="Download"
      icon={<Download size={18} />}
    />
  )
}
