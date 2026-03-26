/** Maximum allowed image file size for upload, expressed in bytes (10 MB). */
export const MAX_IMAGE_SIZE_BYTES: number = 10 * 1024 * 1024

/**
 * Directory name for storing uploaded images under the Tauri app data directory.
 *
 * The full path resolves to `$APPDATA/<IMAGE_DIR>` (e.g. `~/Library/Application Support/com.scripta.app/images` on macOS).
 */
export const IMAGE_DIR: string = 'images'

/**
 * Allowed MIME types for image upload.
 *
 * Files with a MIME type not present in this tuple will be rejected by {@link validateImage}.
 */
export const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const
