/**
 * Store key used to persist the image auto-save setting in `config.json`
 * via `tauri-plugin-store`.
 */
export const IMAGE_AUTO_SAVE_STORE_KEY = 'imageAutoSaveEnabled' as const

/**
 * Default value for image auto-save.
 * OFF by default — opt-in feature.
 */
export const DEFAULT_IMAGE_AUTO_SAVE = false

/**
 * Module-level mutable config read by {@link useImageLocalizationScanner}
 * on every `handleChange` call.
 *
 * Using a shared mutable object (the same pattern as `cursorCenteringConfig`)
 * ensures that any hook instance that calls `setEnabled` immediately reflects
 * the new value for all other hooks in the same process, without relying on
 * React's render cycle to propagate the change between different component trees.
 */
export const imageAutoSaveConfig = {
  enabled: DEFAULT_IMAGE_AUTO_SAVE,
}
