/**
 * @module features/summarization
 *
 * Apple Intelligence-powered note summarization via on-device
 * FoundationModels framework (macOS 26.0+).
 */

export {
  SummarizationManager,
  SummarizationProvider,
} from './model/context'
export type { SummarizationStatus } from './model/types'
export { SummarizeButton } from './ui/SummarizeButton'
export { SummaryAccordion } from './ui/SummaryAccordion'
