import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useWindowTitlePrefix } from '@/app/providers/window-title-prefix-provider'

/**
 * Settings toggle for the "Scripta - " window title prefix.
 *
 * When ON, the window title displays `"Scripta - {note title}"`.
 * When OFF, only the note title is shown for a minimal look.
 *
 * @returns The rendered window title prefix settings control.
 */
export function WindowTitlePrefixOption() {
  const { enabled, setEnabled } = useWindowTitlePrefix()

  return (
    <div className="flex items-center justify-between px-3">
      <Label htmlFor="window-title-prefix-toggle" className="text-sm">
        Show app name in title bar
      </Label>
      <Switch
        id="window-title-prefix-toggle"
        checked={enabled}
        onCheckedChange={setEnabled}
      />
    </div>
  )
}
