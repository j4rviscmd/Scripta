import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '@/app/providers/store-provider'
import {
  COMMAND_PALETTE_SCROLL_STORE_KEYS,
  commandPaletteScrollConfig,
  DEFAULT_COMMAND_PALETTE_SCROLL,
} from '../lib/commandPaletteScrollConfig'

/**
 * Manages the command-palette scroll settings with immediate persistence
 * and runtime configuration via the mutable {@link commandPaletteScrollConfig}.
 *
 * On mount, loads persisted values from `configStore` and syncs them to
 * the config object. Subsequent changes persist immediately.
 *
 * @returns An object containing the current settings and their setters:
 *   - `enabled` - Whether the scroll behaviour is active.
 *   - `targetFraction` - The vertical fraction (0–1) from the top of the
 *     scroll container where the cursor should land when the palette opens.
 *   - `setEnabled` - Toggles the `enabled` flag and persists the change.
 *   - `setTargetFraction` - Updates the fraction (clamped to [0, 0.9]) and
 *     persists the change.
 */
export function useCommandPaletteScroll() {
  const { config: configStore } = useAppStore()
  const [enabled, setEnabledState] = useState(
    DEFAULT_COMMAND_PALETTE_SCROLL.enabled
  )
  const [targetFraction, setTargetFractionState] = useState(
    DEFAULT_COMMAND_PALETTE_SCROLL.targetFraction
  )

  // Load persisted values on mount
  useEffect(() => {
    Promise.all([
      configStore.get<boolean>(COMMAND_PALETTE_SCROLL_STORE_KEYS.enabled),
      configStore.get<number>(COMMAND_PALETTE_SCROLL_STORE_KEYS.targetFraction),
    ])
      .then(([storedEnabled, storedFraction]) => {
        const resolvedEnabled =
          storedEnabled ?? DEFAULT_COMMAND_PALETTE_SCROLL.enabled
        const resolvedFraction =
          storedFraction ?? DEFAULT_COMMAND_PALETTE_SCROLL.targetFraction
        setEnabledState(resolvedEnabled)
        setTargetFractionState(resolvedFraction)
        commandPaletteScrollConfig.enabled = resolvedEnabled
        commandPaletteScrollConfig.targetFraction = resolvedFraction
      })
      .catch((err) => {
        console.error('Failed to load commandPaletteScroll settings:', err)
      })
  }, [configStore])

  const setEnabled = useCallback(
    (value: boolean) => {
      setEnabledState(value)
      commandPaletteScrollConfig.enabled = value
      configStore
        .set(COMMAND_PALETTE_SCROLL_STORE_KEYS.enabled, value)
        .catch((err) => {
          console.error('Failed to persist commandPaletteScrollEnabled:', err)
        })
    },
    [configStore]
  )

  const setTargetFraction = useCallback(
    (value: number) => {
      const clamped = Math.max(0, Math.min(0.9, value))
      setTargetFractionState(clamped)
      commandPaletteScrollConfig.targetFraction = clamped
      configStore
        .set(COMMAND_PALETTE_SCROLL_STORE_KEYS.targetFraction, clamped)
        .catch((err) => {
          console.error('Failed to persist commandPaletteScrollFraction:', err)
        })
    },
    [configStore]
  )

  return { enabled, targetFraction, setEnabled, setTargetFraction }
}
