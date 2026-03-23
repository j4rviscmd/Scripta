import { useTheme } from "@/app/providers/theme-provider"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

/**
 * Themed toast notification component built on top of Sonner.
 *
 * Automatically syncs its visual theme with the application's current
 * theme via `{@link useTheme}`. Uses CSS custom properties from the
 * design system for background, text, and border colors so the toast
 * appearance stays consistent across light and dark modes.
 *
 * @param props - Standard Sonner `ToasterProps` spread onto the underlying component.
 *
 * @example
 * ```tsx
 * import { Toaster } from "@/components/ui/sonner";
 *
 * // Place once at the root of your application:
 * <Toaster position="bottom-right" />
 * ```
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
