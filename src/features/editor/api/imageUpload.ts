import { convertFileSrc } from '@tauri-apps/api/core'
import { appDataDir, join } from '@tauri-apps/api/path'
import { mkdir, writeFile } from '@tauri-apps/plugin-fs'
import {
  ALLOWED_IMAGE_TYPES,
  IMAGE_DIR,
  MAX_IMAGE_SIZE_BYTES,
} from '../lib/imageUploadConfig'

/**
 * Generates a unique filename by combining a UUID v4 with the original file extension.
 *
 * Falls back to "png" when the input has no discernible extension.
 *
 * @param originalName - The original filename from which to extract the extension.
 * @returns A filename in the format `<uuid>.<ext>`.
 *
 * @example
 * ```typescript
 * const name = generateUniqueFileName("photo.jpg");
 * // e.g. "550e8400-e29b-41d4-a716-446655440000.jpg"
 * ```
 */
function generateUniqueFileName(originalName: string): string {
  const ext = originalName.split('.').pop() ?? 'png'
  return `${crypto.randomUUID()}.${ext}`
}

/**
 * Validates that the given file is an allowed image type and within the size limit.
 *
 * Performs two checks in sequence:
 * 1. MIME type must be included in {@link ALLOWED_IMAGE_TYPES}.
 * 2. File size must not exceed {@link MAX_IMAGE_SIZE_BYTES}.
 *
 * @param file - The file to validate.
 * @throws {Error} When the MIME type is not supported or the file exceeds the size limit.
 *
 * @example
 * ```typescript
 * validateImage(file); // OK
 * validateImage(invalidFile); // throws Error("Unsupported file type: text/plain")
 * ```
 */
function validateImage(file: File): void {
  if (
    !ALLOWED_IMAGE_TYPES.includes(
      file.type as (typeof ALLOWED_IMAGE_TYPES)[number]
    )
  ) {
    throw new Error(`Unsupported file type: ${file.type}`)
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(
      `File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds the ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB limit.`
    )
  }
}

/** Return type of {@link uploadImage}, compatible with BlockNote's `uploadFile` interface. */
export interface ImageUploadResult {
  props: {
    url: string
    name: string
    caption: string
  }
}

/**
 * Uploads an image file to the app's local data directory (`$APPDATA/images/`).
 *
 * Processing pipeline:
 * 1. Validates the file type and size via {@link validateImage}.
 * 2. Generates a collision-free filename via {@link generateUniqueFileName}.
 * 3. Ensures the target directory exists (created recursively if needed).
 * 4. Writes the file as raw bytes to disk.
 * 5. Returns a BlockNote-compatible update object containing the asset URL,
 *    original filename, and a caption (falls back to `"image"` when the
 *    filename is unavailable).
 *
 * Returning an object (instead of a plain URL string) causes BlockNote to set
 * the `caption` prop on the image block, which keeps the caption area visible
 * so the bubble menu toolbar remains accessible (fixes issue #40).
 *
 * @param file - The image File from the browser's File API.
 * @returns A BlockNote block-update object with `url`, `name`, and `caption`.
 * @throws {Error} If validation fails or filesystem operations error.
 *
 * @example
 * ```typescript
 * const result = await uploadImage(file);
 * // { props: { url: "asset://...", name: "photo.jpg", caption: "photo.jpg" } }
 * ```
 */
export async function uploadImage(file: File): Promise<ImageUploadResult> {
  validateImage(file)

  const fileName = generateUniqueFileName(file.name)

  const appDir = await appDataDir()
  const dirPath = await join(appDir, IMAGE_DIR)

  await mkdir(dirPath, { recursive: true })

  const filePath = await join(dirPath, fileName)
  await writeFile(filePath, new Uint8Array(await file.arrayBuffer()))

  const url = convertFileSrc(filePath)
  const caption = file.name || 'image'

  return {
    props: {
      url,
      name: file.name,
      caption,
    },
  }
}

/**
 * Resolves a stored image URL back to a displayable asset protocol URL.
 *
 * This is part of the BlockNote image upload adapter interface.
 * Since {@link uploadImage} already persists URLs as Tauri asset protocol
 * URLs, this function simply returns the input unchanged.
 *
 * @param url - The URL stored in the BlockNote document.
 * @returns The same URL passed in, suitable for direct rendering.
 *
 * @example
 * ```typescript
 * const resolved = await resolveImageUrl("asset://localhost/.../image.png");
 * // "asset://localhost/.../image.png"
 * ```
 */
export async function resolveImageUrl(url: string): Promise<string> {
  return url
}
