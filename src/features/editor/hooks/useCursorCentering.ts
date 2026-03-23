import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/app/providers/store-provider";
import {
  cursorCenteringConfig,
  DEFAULT_CURSOR_CENTERING,
  CURSOR_CENTERING_STORE_KEYS,
} from "../lib/cursorCenteringConfig";

/**
 * Manages cursor-centering settings with immediate persistence
 * and runtime configuration of the ProseMirror extension.
 *
 * On mount, loads persisted values from `configStore` and syncs
 * them to the extension via the mutable {@link cursorCenteringConfig}.
 * Subsequent changes persist immediately and update the extension
 * in the same tick.
 *
 * @returns An object containing the current settings and their setters:
 *   - `enabled` - Whether cursor centering is active.
 *   - `targetRatio` - Vertical position ratio (0.1 -- 0.9) where the
 *     cursor should be kept within the viewport.
 *   - `setEnabled` - Toggles the `enabled` flag and persists the change.
 *   - `setTargetRatio` - Updates the ratio (clamped to [0.1, 0.9])
 *     and persists the change.
 */
export function useCursorCentering() {
  const { config: configStore } = useAppStore();
  const [enabled, setEnabledState] = useState(DEFAULT_CURSOR_CENTERING.enabled);
  const [targetRatio, setTargetRatioState] = useState(DEFAULT_CURSOR_CENTERING.targetRatio);

  // Load persisted values on mount
  useEffect(() => {
    Promise.all([
      configStore.get<boolean>(CURSOR_CENTERING_STORE_KEYS.enabled),
      configStore.get<number>(CURSOR_CENTERING_STORE_KEYS.ratio),
    ]).then(([storedEnabled, storedRatio]) => {
      const resolvedEnabled = storedEnabled ?? DEFAULT_CURSOR_CENTERING.enabled;
      const resolvedRatio = storedRatio ?? DEFAULT_CURSOR_CENTERING.targetRatio;
      setEnabledState(resolvedEnabled);
      setTargetRatioState(resolvedRatio);
      cursorCenteringConfig.enabled = resolvedEnabled;
      cursorCenteringConfig.targetRatio = resolvedRatio;
    }).catch((err) => {
      console.error("Failed to load cursor centering settings:", err);
    });
  }, [configStore]);

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    cursorCenteringConfig.enabled = value;
    configStore.set(CURSOR_CENTERING_STORE_KEYS.enabled, value).catch((err) => {
      console.error("Failed to persist cursorCenteringEnabled:", err);
    });
  }, [configStore]);

  const setTargetRatio = useCallback((value: number) => {
    const clamped = Math.max(0.1, Math.min(0.9, value));
    setTargetRatioState(clamped);
    cursorCenteringConfig.targetRatio = clamped;
    configStore.set(CURSOR_CENTERING_STORE_KEYS.ratio, clamped).catch((err) => {
      console.error("Failed to persist cursorCenteringRatio:", err);
    });
  }, [configStore]);

  return { enabled, targetRatio, setEnabled, setTargetRatio };
}
