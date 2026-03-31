/**
 * Extracts a display name from a URL's last path segment, stripping extension.
 *
 * Falls back to `"image"` when the URL cannot be parsed or the path is empty.
 *
 * @param url - The absolute URL to extract the name from.
 * @returns The filename without its extension, or `"image"` as a fallback.
 */
export function urlToImageName(url: string): string {
  try {
    const filename = new URL(url).pathname.split('/').pop() ?? ''
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
