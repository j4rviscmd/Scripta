import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/app/providers/theme-provider'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * Dropdown button that switches between light, dark, and system themes.
 *
 * Displays a sun/moon icon that transitions based on the active theme.
 */
const themes = ['light', 'dark', 'system'] as const

/**
 * Theme mode toggle component rendered as a dropdown menu.
 *
 * Provides a button displaying a sun/moon icon that opens a dropdown
 * with options to switch between light, dark, and system themes.
 * Uses the global theme context via `useTheme` to persist the selection.
 *
 * @example
 * ```tsx
 * import { ModeToggle } from '@/shared/ui/ModeToggle'
 *
 * function Header() {
 *   return (
 *     <header>
 *       <ModeToggle />
 *     </header>
 *   )
 * }
 * ```
 */
export function ModeToggle() {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50">
        <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Toggle theme</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {themes.map((theme) => (
          <DropdownMenuItem key={theme} onClick={() => setTheme(theme)}>
            {theme.charAt(0).toUpperCase() + theme.slice(1)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
