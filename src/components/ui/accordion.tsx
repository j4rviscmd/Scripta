import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion'
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Root accordion container that manages the expanded/collapsed state of its items.
 *
 * Wraps the Base UI `Accordion.Root` primitive with a flex-column layout and
 * forwards all native props.
 *
 * @param props - Props passed through to `AccordionPrimitive.Root`.
 * @param props.className - Additional CSS classes merged via `cn`.
 */
function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      className={cn('flex w-full flex-col', className)}
      {...props}
    />
  )
}

/**
 * A single collapsible section within an `Accordion`.
 *
 * Renders a bottom border between sibling items (except the last one).
 *
 * @param props - Props passed through to `AccordionPrimitive.Item`.
 * @param props.className - Additional CSS classes merged via `cn`.
 */
function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn('not-last:border-b', className)}
      {...props}
    />
  )
}

/**
 * Clickable header that toggles the visibility of an `AccordionContent` panel.
 *
 * Displays a chevron icon that rotates based on the expanded state, and
 * supports hover, focus-visible, and disabled visual states.
 *
 * @param props - Props passed through to `AccordionPrimitive.Trigger`.
 * @param props.className - Additional CSS classes merged via `cn`.
 * @param props.children - Label content rendered inside the trigger button.
 */
function AccordionTrigger({
  className,
  children,
  ...props
}: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'group/accordion-trigger relative flex flex-1 items-start justify-between rounded-lg border border-transparent py-2.5 text-left font-medium text-sm outline-none transition-all hover:underline focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:after:border-ring aria-disabled:pointer-events-none aria-disabled:opacity-50 **:data-[slot=accordion-trigger-icon]:ml-auto **:data-[slot=accordion-trigger-icon]:size-4 **:data-[slot=accordion-trigger-icon]:text-muted-foreground',
          className
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon
          data-slot="accordion-trigger-icon"
          className="pointer-events-none shrink-0 group-aria-expanded/accordion-trigger:hidden"
        />
        <ChevronUpIcon
          data-slot="accordion-trigger-icon"
          className="pointer-events-none hidden shrink-0 group-aria-expanded/accordion-trigger:inline"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

/**
 * Collapsible panel that reveals the content of an `AccordionItem`.
 *
 * Animates open/close with height-based transitions and renders children
 * inside an inner container with consistent spacing.
 *
 * @param props - Props passed through to `AccordionPrimitive.Panel`.
 * @param props.className - Additional CSS classes merged via `cn`.
 * @param props.children - Content displayed when the accordion item is expanded.
 */
function AccordionContent({
  className,
  children,
  ...props
}: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className="overflow-hidden text-sm data-closed:animate-accordion-up data-open:animate-accordion-down"
      {...props}
    >
      <div
        className={cn(
          'h-(--accordion-panel-height) pt-0 pb-2.5 data-ending-style:h-0 data-starting-style:h-0 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4',
          className
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Panel>
  )
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger }
