/** Known image file extensions (lowercase). */
const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'avif',
  'bmp',
  'ico',
  'tiff',
  'tif',
])

/** Known image-hosting domains (matched against hostname, subdomain-aware). */
const IMAGE_HOST_PATTERNS: readonly RegExp[] = [
  /(^|\.)i\.imgur\.com$/,
  /(^|\.)cdn\.pixabay\.com$/,
  /(^|\.)images\.unsplash\.com$/,
  /(^|\.)pbs\.twimg\.com$/,
  /(^|\.)avatars\.githubusercontent\.com$/,
  /(^|\.)raw\.githubusercontent\.com$/,
  /(^|\.)media\.giphy\.com$/,
  /(^|\.)\w+\.cdninstagram\.com$/,
  /(^|\.)lh\d+\.googleusercontent\.com$/,
  /(^|\.)\w+\.wp\.com$/,
  /(^|\.)i\.redd\.it$/,
  /(^|\.)preview\.redd\.it$/,
]

/**
 * Returns `true` when the URL path ends with a known image extension.
 *
 * Query strings and hash fragments are ignored before the extension check.
 *
 * @example
 * ```ts
 * isImageUrlByExtension('https://example.com/photo.jpg?w=800') // true
 * isImageUrlByExtension('https://example.com/page') // false
 * ```
 */
export function isImageUrlByExtension(url: string): boolean {
  try {
    const pathname = new URL(url).pathname
    const ext = pathname.split('.').pop()?.toLowerCase()
    return ext != null && IMAGE_EXTENSIONS.has(ext)
  } catch {
    return false
  }
}

/**
 * Returns `true` when the URL hostname matches a known image-hosting domain.
 *
 * @example
 * ```ts
 * isImageUrlByDomain('https://i.imgur.com/abc123') // true
 * isImageUrlByDomain('https://example.com/photo') // false
 * ```
 */
export function isImageUrlByDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname
    return IMAGE_HOST_PATTERNS.some((p) => p.test(hostname))
  } catch {
    return false
  }
}

/**
 * Combines extension and domain checks for a fast synchronous verdict.
 *
 * @example
 * ```ts
 * isImageUrlQuick('https://i.imgur.com/abc123') // true (domain)
 * isImageUrlQuick('https://example.com/photo.png') // true (extension)
 * isImageUrlQuick('https://example.com/page') // false
 * ```
 */
export function isImageUrlQuick(url: string): boolean {
  return isImageUrlByExtension(url) || isImageUrlByDomain(url)
}

/**
 * Simple LRU cache for image-URL detection results.
 *
 * Evicts the oldest entry when `maxSize` is exceeded.
 */
export class ImageDetectionCache {
  private readonly cache = new Map<string, boolean>()
  private readonly maxSize: number

  constructor(maxSize = 100) {
    this.maxSize = maxSize
  }

  /** Returns the cached result, or `undefined` on miss. */
  get(url: string): boolean | undefined {
    return this.cache.get(url)
  }

  /** Stores a result, evicting the oldest entry when the cache is full. */
  set(url: string, isImage: boolean): void {
    if (this.cache.size >= this.maxSize && !this.cache.has(url)) {
      const oldest = this.cache.keys().next().value
      if (oldest != null) this.cache.delete(oldest)
    }
    this.cache.set(url, isImage)
  }

  /** Returns the current number of cached entries (useful for testing). */
  get size(): number {
    return this.cache.size
  }
}
