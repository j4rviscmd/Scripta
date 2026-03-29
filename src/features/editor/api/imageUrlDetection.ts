import { invoke } from '@tauri-apps/api/core'

/**
 * Checks whether a URL points to an image by inspecting its Content-Type
 * header via a HEAD request in the Rust backend.
 *
 * Falls back to a minimal GET request when the server does not support HEAD.
 *
 * @param url - The HTTP/HTTPS URL to check.
 * @returns The `Content-Type` header value (e.g. `"image/png"`), or `null`
 *   when the server did not return one. Rejects on validation or network errors.
 */
export async function checkUrlContentType(url: string): Promise<string | null> {
  return invoke<string | null>('check_url_content_type', { url })
}

/** Returns `true` when the given Content-Type string starts with `image/`. */
export function isImageContentType(contentType: string | null): boolean {
  return contentType?.startsWith('image/') ?? false
}
