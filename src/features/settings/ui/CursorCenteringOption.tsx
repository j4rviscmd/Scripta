import { useCursorCentering } from "@/features/editor";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

/**
 * Settings section for configuring the cursor-centering behavior.
 *
 * Provides an ON/OFF toggle and a position ratio slider (10%--90%).
 * Changes take effect immediately without restarting the editor.
 *
 * @returns The rendered cursor centering settings controls.
 *
 * @example
 * ```tsx
 * // Inside a settings dialog
 * <Separator />
 * <CursorCenteringOption />
 * ```
 */
export function CursorCenteringOption() {
  const { enabled, targetRatio, setEnabled, setTargetRatio } = useCursorCentering();

  return (
    <div className="flex flex-col gap-3">
      <p className="px-3 text-xs font-medium text-muted-foreground">
        Cursor Centering
      </p>
      <div className="flex items-center justify-between px-3">
        <Label htmlFor="cursor-centering-toggle" className="text-sm">
          Enable centering
        </Label>
        <Switch
          id="cursor-centering-toggle"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </div>
      {enabled && (
        <div className="flex flex-col gap-2 px-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Position</Label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {Math.round(targetRatio * 100)}%
            </span>
          </div>
          <Slider
            value={[targetRatio]}
            onValueChange={(v) => setTargetRatio(Array.isArray(v) ? v[0] : v)}
            min={0.1}
            max={0.9}
            step={0.1}
            aria-label="Cursor centering position"
          />
        </div>
      )}
    </div>
  );
}
