import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '@/app/providers/store-provider'
import {
  DEFAULT_IMAGE_AUTO_SAVE,
  IMAGE_AUTO_SAVE_STORE_KEY,
  imageAutoSaveConfig,
} from '../lib/imageAutoSaveConfig'

/**
 * Manages the image auto-save setting with immediate persistence.
 *
 * On mount, loads the persisted value from `configStore` and syncs it to the
 * module-level {@link imageAutoSaveConfig} object. Subsequent changes persist
 * immediately via `tauri-plugin-store` and also update `imageAutoSaveConfig`
 * synchronously so that all hook instances (including the scanner in the
 * editor) reflect the new value on the very next `handleChange` call,
 * without waiting for a React re-render cycle.
 *
 * When enabled, remote `https://` images that appear in a document are
 * automatically downloaded to `$APPDATA/images/` and the block URL is
 * updated to the local `asset://` path.
 *
 * Off by default (opt-in).
 *
 * @returns An object containing the current setting and its setter:
 *   - `enabled` - Whether image auto-save is active.
 *   - `setEnabled` - Toggles the setting and persists the change.
 */
export function useImageAutoSave() {
  const { config: configStore } = useAppStore()
  const [enabled, setEnabledState] = useState(DEFAULT_IMAGE_AUTO_SAVE)

  useEffect(() => {
    configStore
      .get<boolean>(IMAGE_AUTO_SAVE_STORE_KEY)
      .then((stored) => {
        const resolved = stored ?? DEFAULT_IMAGE_AUTO_SAVE
        setEnabledState(resolved)
        imageAutoSaveConfig.enabled = resolved
      })
      .catch((err) => {
        console.error('Failed to load imageAutoSaveEnabled:', err)
      })
  }, [configStore])

  const setEnabled = useCallback(
    (value: boolean) => {
      setEnabledState(value)
      imageAutoSaveConfig.enabled = value
      configStore.set(IMAGE_AUTO_SAVE_STORE_KEY, value).catch((err) => {
        console.error('Failed to persist imageAutoSaveEnabled:', err)
      })
    },
    [configStore]
  )

  return { enabled, setEnabled }
}
