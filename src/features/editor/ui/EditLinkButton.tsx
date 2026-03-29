import type { LinkToolbarProps } from '@blocknote/react'
import { useComponentsContext } from '@blocknote/react'
import { Pencil } from 'lucide-react'
import { createContext, useCallback, useContext } from 'react'

/**
 * State payload used to open the edit-link dialog.
 */
export interface EditLinkDialogState {
  url: string
  text: string
  rangeFrom: number
}

/**
 * React context that bridges the `onRequestOpen` callback across the
 * `LinkToolbarController` boundary (which only passes `LinkToolbarProps`).
 */
export const EditLinkRequestContext = createContext<
  ((state: EditLinkDialogState) => void) | null
>(null)

/**
 * Custom link toolbar button that requests opening a lifted edit-link
 * dialog, replacing BlockNote's built-in nested Popover approach.
 *
 * @param props - Subset of {@link LinkToolbarProps} containing the current
 *   link URL, display text, ProseMirror range, and toolbar state setters.
 */
export function EditLinkButton(
  props: Pick<
    LinkToolbarProps,
    'url' | 'text' | 'range' | 'setToolbarOpen' | 'setToolbarPositionFrozen'
  >
) {
  const Components = useComponentsContext()
  const onRequestOpen = useContext(EditLinkRequestContext)

  const handleClick = useCallback(() => {
    if (!onRequestOpen) return
    onRequestOpen({
      url: props.url,
      text: props.text,
      rangeFrom: props.range.from,
    })
    props.setToolbarOpen?.(false)
    props.setToolbarPositionFrozen?.(false)
  }, [onRequestOpen, props])

  if (!Components) return null

  return (
    <Components.LinkToolbar.Button
      className="bn-button"
      mainTooltip="Edit link"
      label="Edit"
      icon={<Pencil size={16} />}
      onClick={handleClick}
    />
  )
}
