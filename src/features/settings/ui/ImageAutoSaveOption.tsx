import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useImageAutoSave } from '@/features/editor'

/**
 * Settings section for the image auto-save feature.
 *
 * When enabled, remote `https://` images that appear in a document
 * (via link-to-image conversion or clipboard paste) are automatically
 * downloaded to `$APPDATA/images/` and the block URL is updated to the
 * local `asset://` path.
 *
 * Off by default (opt-in).
 *
 * @example
 * ```tsx
 * // Inside SettingsDialog
 * <Separator />
 * <ImageAutoSaveOption />
 * ```
 */
export function ImageAutoSaveOption() {
  const { enabled, setEnabled } = useImageAutoSave()

  return (
    <div className="flex flex-col gap-3">
      <p className="px-3 font-medium text-muted-foreground text-xs">
        Image Auto-Save
      </p>
      <div className="flex items-center justify-between px-3">
        <Label htmlFor="image-auto-save-toggle" className="text-sm">
          Save remote images locally
        </Label>
        <Switch
          id="image-auto-save-toggle"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </div>
      <p className="px-3 text-muted-foreground text-xs leading-relaxed">
        Downloads remote images to local storage when they are inserted via link
        conversion or clipboard paste. On failure, the remote URL is preserved.
      </p>
    </div>
  )
}
