import { useEditorFontSize } from "@/features/editor";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { DEFAULT_FONT_SIZE, MAX_FONT_SIZE, MIN_FONT_SIZE } from "@/features/editor";

/**
 * Settings section for configuring the editor font size.
 *
 * Provides a slider and reset button to change the font size
 * between {@link MIN_FONT_SIZE} and {@link MAX_FONT_SIZE} px.
 * Changes take effect immediately.
 *
 * @returns The rendered font size settings controls.
 *
 * @example
 * ```tsx
 * // Inside a settings dialog
 * <Separator />
 * <FontSizeOption />
 * ```
 */
export function FontSizeOption() {
  const { fontSize, setFontSize, reset } = useEditorFontSize();

  return (
    <div className="flex flex-col gap-3">
      <p className="px-3 text-xs font-medium text-muted-foreground">
        Editor Font Size
      </p>
      <div className="flex flex-col gap-2 px-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Size</Label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              {fontSize}px
            </span>
            {fontSize !== DEFAULT_FONT_SIZE && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-2 text-xs"
                onClick={reset}
              >
                Reset
              </Button>
            )}
          </div>
        </div>
        <Slider
          value={[fontSize]}
          onValueChange={(v) => setFontSize(Array.isArray(v) ? v[0] : v)}
          min={MIN_FONT_SIZE}
          max={MAX_FONT_SIZE}
          step={1}
          aria-label="Editor font size"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{MIN_FONT_SIZE}px</span>
          <span>{MAX_FONT_SIZE}px</span>
        </div>
      </div>
    </div>
  );
}
