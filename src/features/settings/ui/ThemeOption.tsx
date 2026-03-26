import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Theme } from '@/app/providers/theme-provider'
import { useTheme } from '@/app/providers/theme-provider'
import { cn } from '@/lib/utils'

/**
 * Props for the {@link ThemeOption} component.
 *
 * @property value - The theme identifier that selecting this option will activate.
 * @property label - Human-readable label displayed next to the icon.
 * @property icon - A React node rendered as the theme's visual indicator (e.g. a sun or moon icon).
 */
interface ThemeOptionProps {
  value: Theme
  label: string
  icon: ReactNode
}

/**
 * A single selectable theme option rendered as a radio button.
 *
 * Displays an icon, a label, and a check mark when the option is
 * currently active. Selecting the option immediately updates the
 * application theme via the {@link useTheme} provider.
 *
 * @param props - {@link ThemeOptionProps}
 */
export function ThemeOption({ value, label, icon }: ThemeOptionProps) {
  const { theme, setTheme } = useTheme()
  const isActive = theme === value

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isActive}
      onClick={() => setTheme(value)}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      )}
    >
      <span className="h-5 w-5 shrink-0">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {isActive && <Check className="h-4 w-4 shrink-0" />}
    </button>
  )
}
