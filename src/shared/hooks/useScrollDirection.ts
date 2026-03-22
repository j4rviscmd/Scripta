import { useEffect, useRef, useState } from "react";

interface ScrollDirectionOptions {
  /** Minimum scroll delta (px) before toggling header visibility. */
  threshold?: number;
}

/**
 * Tracks scroll direction via `wheel` events and reports whether
 * the header should be hidden (scrolling down) or shown (scrolling up).
 *
 * Uses the `wheel` event instead of `scroll` to avoid false positives
 * from programmatic scrolling (e.g. ProseMirror `scrollIntoView`).
 *
 * @param containerRef - Ref to the scrollable container element.
 * @param options - Configuration options.
 * @returns `true` when the header should be hidden.
 */
export function useScrollDirection(
  containerRef: React.RefObject<HTMLElement | null>,
  options: ScrollDirectionOptions = {},
) {
  const { threshold = 10 } = options;
  const [isHidden, setIsHidden] = useState(false);
  const accumulatedDelta = useRef(0);
  const ticking = useRef(false);
  const clickLock = useRef(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rafId = useRef<number>(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseDown = () => {
      clickLock.current = true;
      clickTimer.current = setTimeout(() => { clickLock.current = false; }, 200);
    };

    const handleWheel = (e: WheelEvent) => {
      if (clickLock.current) return;
      if (e.deltaY === 0) return;
      if (
        container.scrollTop <= 0 && e.deltaY < 0 ||
        container.scrollTop + container.clientHeight >= container.scrollHeight - 1 && e.deltaY > 0
      ) {
        return;
      }

      accumulatedDelta.current += e.deltaY;

      if (ticking.current) return;
      ticking.current = true;

      rafId.current = requestAnimationFrame(() => {
        if (Math.abs(accumulatedDelta.current) >= threshold) {
          setIsHidden(accumulatedDelta.current > 0);
          accumulatedDelta.current = 0;
        }

        ticking.current = false;
      });
    };

    const handleScroll = () => {
      if (container.scrollTop <= 0) {
        setIsHidden(false);
        accumulatedDelta.current = 0;
      }
    };

    container.addEventListener("mousedown", handleMouseDown, { passive: true });
    container.addEventListener("wheel", handleWheel, { passive: true });
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("mousedown", handleMouseDown);
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("scroll", handleScroll);
      cancelAnimationFrame(rafId.current);
      clearTimeout(clickTimer.current);
    };
  }, [containerRef, threshold]);

  return isHidden;
}
