import type { BlockNoteEditor } from '@blocknote/core'
import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { localizeRemoteImage } from '../api/imageLocalSave'
import { imageAutoSaveConfig } from '../lib/imageAutoSaveConfig'
import { findBlockRecursive } from '../lib/imageBlockUtils'

/**
 * Provides a `scanAndLocalize()` function that walks the BlockNote document
 * and downloads all `https://` image block URLs to `$APPDATA/images/`,
 * replacing the remote URL with a local `asset://` URL in-place.
 *
 * **Why module-level config instead of a React prop:**
 * `useImageAutoSave` may be instantiated in multiple component trees
 * (e.g., in `Editor` and in `ImageAutoSaveOption`). React state updates
 * only propagate to the same hook instance, so the `Editor`'s instance
 * would remain stale when the settings dialog toggles the value.
 * Reading from the shared {@link imageAutoSaveConfig} object bypasses this
 * limitation — any instance calling `setEnabled` immediately updates the
 * module-level flag, which is visible here on the next `handleChange` call.
 *
 * **Infinite-loop safety:**
 * After `editor.updateBlock()` changes a URL from `https://` to `asset://`,
 * the next `onChange` → `handleChange` → `scanAndLocalize()` call skips that
 * block because `block.props.url.startsWith('https://')` is now `false`.
 * This mirrors the `backfillImageNames` pattern in `Editor.tsx`.
 *
 * **In-flight deduplication:**
 * A `useRef<Set<string>>` tracks block IDs currently being downloaded.
 * If `scanAndLocalize()` is called again before a download completes,
 * the block is skipped until the download finishes.
 *
 * **Offline / network failure:**
 * Failed URLs are recorded in `failedUrlsRef` to prevent retry spam on
 * every keystroke when the user is offline. The set is cleared when `enabled`
 * transitions from `false` to `true` (user re-enables = intentional retry).
 *
 * **Note switching:**
 * Because `Editor` unmounts on note switch (`key={selectedNoteId}` in `App.tsx`),
 * both refs are always fresh per note, so in-flight downloads from a previous
 * note's blocks are silently discarded (the block ID won't match).
 *
 * @param editor - The BlockNote editor instance (cast to base schema).
 * @param enabled - Used only to clear the failure cache on re-enable.
 * @returns `{ scanAndLocalize }` — call this from `handleChange`.
 */
export function useImageLocalizationScanner(
  editor: BlockNoteEditor,
  enabled: boolean
) {
  const inFlightRef = useRef<Set<string>>(new Set())
  const failedUrlsRef = useRef<Set<string>>(new Set())

  // Clear failure cache when the user re-enables the setting so that
  // previously failed URLs get another download attempt.
  useEffect(() => {
    if (enabled) {
      failedUrlsRef.current.clear()
    }
  }, [enabled])

  const scanAndLocalize = useCallback(() => {
    // Read from the shared module-level config so that changes made in any
    // hook instance (e.g., the settings dialog) are immediately visible here,
    // even before React has propagated the state update to this component.
    if (!imageAutoSaveConfig.enabled) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const walkBlocks = (blocks: any[]) => {
      for (const block of blocks) {
        const url: unknown = block.props?.url

        if (
          block.type === 'image' &&
          typeof url === 'string' &&
          url.startsWith('https://') &&
          !inFlightRef.current.has(block.id as string) &&
          !failedUrlsRef.current.has(url)
        ) {
          const blockId = block.id as string
          const remoteUrl = url

          inFlightRef.current.add(blockId)

          localizeRemoteImage(remoteUrl)
            .then((localUrl) => {
              // Re-locate the block by ID — it may have moved since the scan.
              const current = findBlockRecursive(
                editor.document,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (b: any) => b.id === blockId
              )
              // Guard: only update if the URL is still the original remote URL.
              // Handles the case where the user edited the block manually
              // while the download was in progress.
              if (current?.props?.url === remoteUrl) {
                editor.updateBlock(current, {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  props: { url: localUrl },
                } as any)
              }
            })
            .catch((err: unknown) => {
              let msg: string
              if (typeof err === 'string') {
                msg = err
              } else if (err instanceof Error) {
                msg = err.message
              } else {
                msg = 'Unknown error'
              }
              toast.error('Failed to save image locally', { description: msg })
              failedUrlsRef.current.add(remoteUrl)
            })
            .finally(() => {
              inFlightRef.current.delete(blockId)
            })
        }

        if (block.children?.length) {
          walkBlocks(block.children as any[])
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    walkBlocks(editor.document as any[])
  }, [editor])

  return { scanAndLocalize }
}
