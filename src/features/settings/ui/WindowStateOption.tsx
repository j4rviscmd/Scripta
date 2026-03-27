import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useWindowState } from '../hooks/useWindowState'
import { WindowTitlePrefixOption } from './WindowTitlePrefixOption'

/**
 * Settings section for window-related preferences.
 *
 * Groups the following toggles under a single "Window" heading:
 *
 * - **Restore position & size** — Whether the window restores its
 *   last-saved position and dimensions on startup.
 * - **Show app name in title bar** — Whether the `"Scripta - "` prefix
 *   is displayed before the note title.
 *
 * @returns The rendered window settings section.
 *
 * @example
 * ```tsx
 * <Separator />
 * <WindowStateOption />
 * ```
 */
export function WindowStateOption() {
  const { enabled, setEnabled } = useWindowState()

  return (
    <div className="flex flex-col gap-3">
      <p className="px-3 font-medium text-muted-foreground text-xs">Window</p>
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
      <WindowTitlePrefixOption />
    </div>
  )
}
