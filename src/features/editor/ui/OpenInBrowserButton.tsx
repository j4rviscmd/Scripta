import type { LinkToolbarProps } from '@blocknote/react'
import { useComponentsContext } from '@blocknote/react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ExternalLink } from 'lucide-react'

/**
 * Custom link toolbar button that opens the link in the system browser
 * via tauri-plugin-opener, replacing the default "Open in new tab" behavior.
 *
 * @param url - The HTTP/HTTPS URL to open. Passed through to the system
 *   default browser via `tauri-plugin-opener`.
 */
export function OpenInBrowserButton({ url }: Pick<LinkToolbarProps, 'url'>) {
  const components = useComponentsContext()

  if (!components) return null

  return (
    <components.LinkToolbar.Button
      mainTooltip="Open in browser"
      label="Open in browser"
      icon={<ExternalLink size={16} />}
      onClick={() => {
        openUrl(url).catch((err) => {
          console.error('Failed to open URL:', err)
        })
      }}
    />
  )
}
