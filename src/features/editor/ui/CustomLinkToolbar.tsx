import type { LinkToolbarProps } from '@blocknote/react'
import { DeleteLinkButton, EditLinkButton, LinkToolbar } from '@blocknote/react'
import { OpenInBrowserButton } from './OpenInBrowserButton'

/**
 * Custom link toolbar that replaces the default "Open in new tab" button
 * with an "Open in browser" button that uses the system browser.
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
