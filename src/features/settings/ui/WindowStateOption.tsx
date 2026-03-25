import { useWindowState } from "../hooks/useWindowState";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * Settings section for configuring window position/size restoration.
 *
 * Provides an ON/OFF toggle that controls whether the window restores
 * its last-saved position and size on startup. When OFF, the window
 * always opens at 1200×800 centered on screen.
 *
 * @returns The rendered window state settings control.
 *
 * @example
 * ```tsx
 * <Separator />
 * <WindowStateOption />
 * ```
 */
export function WindowStateOption() {
  const { enabled, setEnabled } = useWindowState();

  return (
    <div className="flex flex-col gap-3">
      <p className="px-3 text-xs font-medium text-muted-foreground">
        Window
      </p>
      <div className="flex items-center justify-between px-3">
        <Label htmlFor="window-state-toggle" className="text-sm">
          Restore position &amp; size
        </Label>
        <Switch
          id="window-state-toggle"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </div>
    </div>
  );
}
