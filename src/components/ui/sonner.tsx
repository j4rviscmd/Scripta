/**
 * @module components/ui/sonner
 *
 * Themed wrapper around the Sonner toast library.
 *
 * Provides a single `Toaster` component that integrates with the application's
 * design system by mapping Sonner's CSS custom properties to ShadCN theme
 * variables. Place this component once at the root of the component tree.
 *
 * @packageDocumentation
 */

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { useTheme } from '@/app/providers/theme-provider'

/**
 * Themed toast notification component built on top of Sonner.
 *
 * Automatically syncs its visual theme with the application's current
 * theme via `{@link useTheme}`. Uses CSS custom properties from the
 * design system for background, text, and border colors so the toast
 * appearance stays consistent across light and dark modes.
 *
 * The component maps four toast variants (`success`, `error`, `warning`, `info`)
 * to dedicated theme tokens (`--success-muted`, `--error-muted`, etc.) while
 * keeping the `normal` variant aligned with the popover token.
 *
 * Custom Lucide icons replace Sonner's defaults for each variant, and the
 * `loading` variant uses a spinning `Loader2Icon`.
 *
 * @param props - Standard Sonner `ToasterProps` spread onto the underlying component.
 *                 Accepts any prop supported by the original `Toaster` from `sonner`.
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
  const { theme = 'system' } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      richColors
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          zIndex: 9999,
          '--border-radius': 'var(--radius)',
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--success-bg': 'var(--success-muted)',
          '--success-text': 'var(--success)',
          '--success-border': 'var(--success)',
          '--error-bg': 'var(--error-muted)',
          '--error-text': 'var(--destructive)',
          '--error-border': 'var(--destructive)',
          '--warning-bg': 'var(--warning-muted)',
          '--warning-text': 'var(--warning)',
          '--warning-border': 'var(--warning)',
          '--info-bg': 'var(--info-muted)',
          '--info-text': 'var(--info)',
          '--info-border': 'var(--info)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
