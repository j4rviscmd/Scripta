import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { useCursorAutoHide } from '@/features/editor'
import {
  CURSOR_AUTO_HIDE_MAX_DELAY,
  CURSOR_AUTO_HIDE_MIN_DELAY,
} from '@/features/editor/lib/cursorAutoHideConfig'

/**
 * Settings section for configuring the cursor auto-hide behaviour.
 *
 * Provides an ON/OFF toggle and a delay slider (1–30 s) that controls
 * how many seconds of inactivity must pass before the mouse cursor is
 * hidden.  The cursor reappears immediately on the next mouse movement.
 * Changes take effect without restarting.
 *
 * @returns The rendered cursor auto-hide settings controls.
 *
 * @example
 * ```tsx
 * // Inside a settings dialog
 * <Separator />
 * <CursorAutoHideOption />
 * ```
 */
export function CursorAutoHideOption() {
  const { enabled, delay, setEnabled, setDelay } = useCursorAutoHide()

  return (
    <div className="flex flex-col gap-3">
      <p className="px-3 font-medium text-muted-foreground text-xs">
        Cursor Auto-Hide
      </p>
      <div className="flex items-center justify-between px-3">
        <Label htmlFor="cursor-autohide-toggle" className="text-sm">
          Hide cursor when idle
        </Label>
        <Switch
          id="cursor-autohide-toggle"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </div>
      {enabled && (
        <div className="flex flex-col gap-2 px-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Hide after</Label>
            <span className="text-muted-foreground text-xs tabular-nums">
              {delay}s
            </span>
          </div>
          <Slider
            value={[delay]}
            onValueChange={(v) => setDelay(Array.isArray(v) ? v[0] : v)}
            min={CURSOR_AUTO_HIDE_MIN_DELAY}
            max={CURSOR_AUTO_HIDE_MAX_DELAY}
            step={1}
            aria-label="Cursor auto-hide delay"
          />
        </div>
      )}
    </div>
  )
}
