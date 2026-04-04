import { Loader2, RefreshCw, Sparkles } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  useSummarizationActions,
  useSummarizationState,
} from '../model/context'

/**
 * Connected collapsible accordion panel displayed above the editor.
 * Reads state from SummarizationContext.
 * Hidden entirely when no summary exists and not loading.
 */
export function SummaryAccordion() {
  const { summary, status, isStale, isExpanded } = useSummarizationState()
  const { summarize, setExpanded } = useSummarizationActions()

  if (!summary && status !== 'summarizing') return null

  const isLoading = status === 'summarizing'

  return (
    <div className="mx-auto w-full max-w-[900px] px-16">
      <Accordion
        value={isExpanded ? ['summary'] : []}
        onValueChange={(value: string[]) =>
          setExpanded(value.includes('summary'))
        }
      >
        <AccordionItem value="summary" className="border-b-0">
          <AccordionTrigger className="gap-2 py-2 text-muted-foreground text-xs hover:no-underline">
            <span className="flex items-center gap-1.5">
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              <span>Summary</span>
              {isStale && !isLoading && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    summarize({ manual: true })
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation()
                      summarize()
                    }
                  }}
                  className="ml-1 rounded p-0.5 hover:bg-accent"
                  title="Content changed — click to re-summarize"
                >
                  <RefreshCw className="h-3 w-3 text-yellow-500" />
                </span>
              )}
            </span>
          </AccordionTrigger>
          <AccordionContent>
            {summary ? (
              <p className="select-text text-muted-foreground text-sm leading-relaxed">
                {summary}
              </p>
            ) : (
              <p className="text-muted-foreground/60 text-sm italic">
                Generating summary…
              </p>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
