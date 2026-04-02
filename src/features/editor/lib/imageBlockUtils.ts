/**
 * Decodes a Tauri `asset://localhost/` URL to its OS file-system path.
 *
 * Tauri's asset protocol encodes the OS path as a single percent-encoded
 * path segment (e.g. `/Users/.../images/uuid.jpg` becomes
 * `asset://localhost/%2FUsers%2F...%2Fuuid.jpg`). This function strips the
 * protocol prefix and decodes the remaining segment so the caller receives
 * a usable file-system path.
 *
 * @param url - The URL to decode.
 * @returns The decoded OS file-system path, or the original URL when decoding
 *   fails or the URL does not use the asset protocol.
 */
export function decodeAssetPath(url: string): string {
  if (!url.startsWith('asset://localhost/')) return url
  try {
    return decodeURIComponent(url.slice('asset://localhost/'.length))
  } catch {
    return url
  }
}

/**
 * Extracts a display name from a URL's last path segment, stripping extension.
 *
 * For `asset://localhost/` URLs produced by Tauri's asset protocol the path
 * is double-encoded (slashes become `%2F`). The function decodes the pathname
 * before splitting so that only the actual filename is returned, not the full
 * encoded path.
 *
 * Falls back to `"image"` when the URL cannot be parsed or the path is empty.
 *
 * @param url - The absolute URL to extract the name from.
 * @returns The filename without its extension, or `"image"` as a fallback.
 */
export function urlToImageName(url: string): string {
  try {
    const rawPathname = new URL(url).pathname
    // Decode percent-encoded characters so that Tauri asset:// URLs
    // (where the OS path is encoded as a single path segment, e.g.
    // `/%2FUsers%2F...%2Fphoto.jpg`) produce just the filename.
    const decoded = decodeURIComponent(rawPathname)
    const filename = decoded.split('/').pop() ?? ''
    if (!filename) return 'image'
    const dotIndex = filename.lastIndexOf('.')
    return dotIndex > 0 ? filename.substring(0, dotIndex) : filename
  } catch {
    return 'image'
  }
}

/**
 * Recursively walks `blocks` and returns the first block for which
 * `predicate` returns `true`.
 *
 * @param blocks - The array of BlockNote blocks to search (may include nested children).
 * @param predicate - A function that tests each block. Short-circuits on the first match.
 * @returns The first matching block, or `undefined` when no block satisfies the predicate.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function findBlockRecursive(
  blocks: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  predicate: (block: any) => boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any | undefined {
  for (const block of blocks) {
    if (predicate(block)) return block
    if (block.children?.length) {
      const found = findBlockRecursive(block.children, predicate)
      if (found) return found
    }
  }
  return undefined
}
