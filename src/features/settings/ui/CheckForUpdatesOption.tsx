/**
 * Settings section with a "Check for Updates" button.
 *
 * Reads the update state from {@link useAppUpdate} to disable
 * the button and show a spinner while a check is in progress.
 *
 * @module features/settings/ui/CheckForUpdatesOption
 */

import { openUrl } from '@tauri-apps/plugin-opener'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { useAppUpdate } from '@/app/providers/update-provider'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** GitHub releases page URL shown as an external link below the button. */
const RELEASES_URL = 'https://github.com/j4rviscmd/Scripta/releases'

/**
 * Settings section that provides a manual "Check for Updates" button.
 *
 * The button is disabled and shows a spinner while a check is in
 * progress. A link to the GitHub releases page is displayed below.
 */
export function CheckForUpdatesOption() {
  const { state, checkForUpdate } = useAppUpdate()
  const isChecking = state.status === 'checking'

  return (
    <div className="flex flex-col gap-3">
      <p className="px-3 font-medium text-muted-foreground text-xs">Updates</p>
      <div className="flex flex-col gap-2 px-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-center gap-2"
          disabled={isChecking}
          onClick={() => checkForUpdate({ manual: true })}
        >
          <RefreshCw className={cn('h-4 w-4', isChecking && 'animate-spin')} />
          {isChecking ? 'Checking…' : 'Check for Updates'}
        </Button>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => openUrl(RELEASES_URL)}
        >
          <ExternalLink className="h-3 w-3" />
          Release Notes
        </button>
      </div>
    </div>
  )
}
