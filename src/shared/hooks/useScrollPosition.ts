import { useEffect, useRef, useState } from 'react'

interface ScrollPositionOptions {
  /** Minimum scrollTop (px) before `isScrolledDown` becomes `true`. Default: 300 */
  threshold?: number
}

/**
 * Tracks the scroll position of a container and reports whether
 * it has been scrolled past a given threshold.
 *
 * Uses the `scroll` event with `requestAnimationFrame` throttling
 * to avoid excessive re-renders.
 *
 * @param containerRef - Ref to the scrollable container element.
 * @param options - Configuration options.
 * @returns `true` when the container is scrolled past the threshold.
 */
export function useScrollPosition(
  containerRef: React.RefObject<HTMLElement | null>,
  options: ScrollPositionOptions = {}
): boolean {
  const { threshold = 300 } = options
  const [isScrolledDown, setIsScrolledDown] = useState(false)
  const rafId = useRef<number>(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      if (rafId.current) return

      rafId.current = requestAnimationFrame(() => {
        setIsScrolledDown(container.scrollTop > threshold)
        rafId.current = 0
      })
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
      cancelAnimationFrame(rafId.current)
    }
  }, [containerRef, threshold])

  return isScrolledDown
}
