import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { appDataDir, join } from '@tauri-apps/api/path'
import { IMAGE_DIR } from '../lib/imageUploadConfig'

/**
 * Derives a lowercase file extension (≤5 chars, no dot) from a remote URL.
 * Strips query strings and fragments. Falls back to `"png"`.
 *
 * @param url - The remote URL to extract the extension from.
 * @returns A lowercase extension string without the leading dot.
 */
function extensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const clean = (pathname.split('?')[0] ?? '').split('#')[0] ?? ''
    const lastDot = clean.lastIndexOf('.')
    if (lastDot === -1) return 'png'
    const ext = clean.slice(lastDot + 1).toLowerCase()
    return ext.length > 0 && ext.length <= 5 ? ext : 'png'
  } catch {
    return 'png'
  }
}

/**
 * Downloads a remote image URL to `$APPDATA/images/<uuid>.<ext>` and returns
 * the resulting `asset://` URL suitable for use in a BlockNote image block.
 *
 * Uses the existing `download_file` Rust command (`file_io.rs`), which handles
 * HTTP downloads and ensures the destination directory exists.
 *
 * @param url - A remote `https://` image URL.
 * @returns The `asset://localhost/...` URL of the locally saved file.
 * @throws When the Rust `download_file` command fails (network error, disk full, etc.).
 *
 * @example
 * ```typescript
 * const localUrl = await localizeRemoteImage('https://example.com/photo.jpg')
 * // 'asset://localhost/Users/.../Application Support/com.scripta.app/images/uuid.jpg'
 * ```
 */
export async function localizeRemoteImage(url: string): Promise<string> {
  const ext = extensionFromUrl(url)
  const fileName = `${crypto.randomUUID()}.${ext}`

  const appDir = await appDataDir()
  const destPath = await join(appDir, IMAGE_DIR, fileName)

  await invoke('download_file', { url, destPath })

  return convertFileSrc(destPath)
}
