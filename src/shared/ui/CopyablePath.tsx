import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/**
 * Props for the {@link CopyablePath} component.
 *
 * @property path - The file path to display and copy to the clipboard.
 */
interface CopyablePathProps {
  /** The file path to display and copy to the clipboard. */
  path: string
}

/**
 * A compact inline component that displays a file path alongside a copy button.
 *
 * Clicking the button writes the path to the system clipboard and briefly shows
 * a checkmark icon for visual confirmation.  If clipboard access fails the
 * component silently ignores the error without changing its visual state.
 *
 * Intended for use inside toast notification descriptions so the user can
 * quickly copy an exported file path.
 *
 * @param props - {@link CopyablePathProps}
 * @returns A flex-row element containing the copy toggle button and the path text.
 */
function CopyablePath({ path }: CopyablePathProps) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(path)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 3000)
    } catch {
      // clipboard access failed — do not show copied state
    }
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={handleCopy} className="shrink-0">
        {copied ? (
          <Check className="size-3.5" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
      <span className="break-all select-text">{path}</span>
    </div>
  )
}

export { CopyablePath }
