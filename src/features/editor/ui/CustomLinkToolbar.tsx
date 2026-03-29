import type { LinkToolbarProps } from '@blocknote/react'
import { DeleteLinkButton, LinkToolbar } from '@blocknote/react'
import { EditLinkButton } from './EditLinkButton'
import { OpenInBrowserButton } from './OpenInBrowserButton'

/**
 * Custom link toolbar that replaces BlockNote's default EditLinkButton
 * (nested Radix Popover) with a lifted dialog approach, and uses the
 * system browser for "Open in browser".
 *
 * @param props - Standard BlockNote link toolbar props including `url`,
 *   `text`, `range`, and toolbar state setters.
 */
export function CustomLinkToolbar(props: LinkToolbarProps) {
  return (
    <LinkToolbar {...props}>
      <EditLinkButton
        url={props.url}
        text={props.text}
        range={props.range}
        setToolbarOpen={props.setToolbarOpen}
        setToolbarPositionFrozen={props.setToolbarPositionFrozen}
      />
      <OpenInBrowserButton url={props.url} />
      <DeleteLinkButton
        range={props.range}
        setToolbarOpen={props.setToolbarOpen}
      />
    </LinkToolbar>
  )
}
