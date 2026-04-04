import { Loader2, Sparkles } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  useSummarizationActions,
  useSummarizationState,
} from '../model/context'

/**
 * Connected header toolbar button for triggering manual note summarization.
 * Reads availability and status from SummarizationContext.
 * Hidden entirely when the feature is unavailable.
 */
export function SummarizeButton() {
  const { available, status, contentTooShort } = useSummarizationState()
  const { summarize, noteId } = useSummarizationActions()

  if (!available) return null

  const loading = status === 'summarizing'
  const disabled = !noteId || contentTooShort

  return (
    <Tooltip>
      <TooltipTrigger
        render={(props) => (
          <button
            {...props}
            type="button"
            aria-disabled={disabled || loading}
            onClick={() => {
              if (!disabled && !loading) summarize({ manual: true })
            }}
            className={cn(
              'inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors',
              disabled || loading
                ? 'cursor-default opacity-50'
                : 'hover:bg-accent hover:text-accent-foreground'
            )}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </button>
        )}
      />
      <TooltipContent>
        {!noteId
          ? 'Select a note to summarize'
          : contentTooShort
            ? 'Note is too short to summarize'
            : loading
              ? 'Summarizing…'
              : 'Summarize note'}
      </TooltipContent>
    </Tooltip>
  )
}
