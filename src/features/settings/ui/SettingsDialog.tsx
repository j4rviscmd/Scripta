import { Monitor, Moon, Sun } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { CursorCenteringOption } from "./CursorCenteringOption";
import { ThemeOption } from "./ThemeOption";

/**
 * Props for the {@link SettingsDialog} component.
 *
 * @property open - Whether the dialog is currently visible.
 * @property onOpenChange - Callback invoked when the dialog open state changes,
 *   receiving the new `open` boolean value.
 */
interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * A modal dialog for managing application preferences.
 *
 * Renders a theme picker that allows the user to switch between
 * light, dark, and system color schemes via {@link ThemeOption} radio
 * buttons. The dialog is controlled externally through the `open` and
 * `onOpenChange` props.
 *
 * @param props - {@link SettingsDialogProps}
 */
export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Manage your preferences.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          <p className="px-3 text-xs font-medium text-muted-foreground">
            Theme
          </p>
          <ThemeOption value="light" label="Light" icon={<Sun className="h-5 w-5" />} />
          <ThemeOption value="dark" label="Dark" icon={<Moon className="h-5 w-5" />} />
          <ThemeOption value="system" label="System" icon={<Monitor className="h-5 w-5" />} />
        </div>
        <Separator />
        <CursorCenteringOption />
        <Separator />
      </DialogContent>
    </Dialog>
  );
}
