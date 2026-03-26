import { type LucideIcon, Monitor, Moon, Sun } from 'lucide-react'
import type { Theme } from '@/app/providers/theme-provider'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { CommandPaletteScrollOption } from './CommandPaletteScrollOption'
import { CursorCenteringOption } from './CursorCenteringOption'
import { EditorFontOption } from './EditorFontOption'
import { FontSizeOption } from './FontSizeOption'
import { ThemeOption } from './ThemeOption'
import { WindowStateOption } from './WindowStateOption'

/**
 * Props for the {@link SettingsDialog} component.
 *
 * @property open - Whether the dialog is currently visible.
 * @property onOpenChange - Callback invoked when the dialog open state changes.
 */
interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Available theme choices displayed as selectable rows inside the dialog. */
const themeOptions: Array<{ value: Theme; label: string; icon: LucideIcon }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

/**
 * A modal dialog for managing application preferences.
 *
 * Renders the following settings sections, each separated by a
 * visual divider:
 *
 * - **Theme** — Light / Dark / System color scheme via {@link ThemeOption}.
 * - **Cursor centering** — Typewriter-style scroll behavior.
 * - **Command palette scroll** — Scroll-to-top on open.
 * - **Font size** — Editor font size adjustment.
 * - **Editor font** — Editor font family selection (Google Fonts).
 * - **Window state** — Restore window position and size on launch.
 *
 * The dialog is controlled externally through the `open` and
 * `onOpenChange` props.
 *
 * @param props - {@link SettingsDialogProps}
 */
export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Manage your preferences.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          <p className="px-3 font-medium text-muted-foreground text-xs">
            Theme
          </p>
          {themeOptions.map(({ value, label, icon: Icon }) => (
            <ThemeOption
              key={value}
              value={value}
              label={label}
              icon={<Icon className="h-5 w-5" />}
            />
          ))}
        </div>
        <Separator />
        <CursorCenteringOption />
        <Separator />
        <CommandPaletteScrollOption />
        <Separator />
        <FontSizeOption />
        <Separator />
        <EditorFontOption />
        <Separator />
        <WindowStateOption />
      </DialogContent>
    </Dialog>
  )
}
