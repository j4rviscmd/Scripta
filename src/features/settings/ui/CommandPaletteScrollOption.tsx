import { useCommandPaletteScroll } from "@/features/editor";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

/**
 * Settings section for configuring the command-palette scroll behaviour.
 *
 * Provides an ON/OFF toggle and a position slider (0%–90%) that controls
 * how far from the top of the scroll container the cursor is placed when
 * the slash-command palette opens.  Changes take effect immediately without
 * restarting.
 *
 * @returns The rendered command-palette scroll settings controls.
 *
 * @example
 * ```tsx
 * // Inside a settings dialog
 * <Separator />
 * <CommandPaletteScrollOption />
 * ```
 */
export function CommandPaletteScrollOption() {
  const { enabled, targetFraction, setEnabled, setTargetFraction } =
    useCommandPaletteScroll();

  return (
    <div className="flex flex-col gap-3">
      <p className="px-3 text-xs font-medium text-muted-foreground">
        Command Palette Scroll
      </p>
      <div className="flex items-center justify-between px-3">
        <Label htmlFor="command-palette-scroll-toggle" className="text-sm">
          Scroll on open
        </Label>
        <Switch
          id="command-palette-scroll-toggle"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </div>
      {enabled && (
        <div className="flex flex-col gap-2 px-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Cursor position on open</Label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {Math.round(targetFraction * 100)}%
            </span>
          </div>
          <Slider
            value={[targetFraction]}
            onValueChange={(v) => setTargetFraction(Array.isArray(v) ? v[0] : v)}
            min={0}
            max={0.9}
            step={0.05}
            aria-label="Command palette cursor position"
          />
        </div>
      )}
    </div>
  );
}
