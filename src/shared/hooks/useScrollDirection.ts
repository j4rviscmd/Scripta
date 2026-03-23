import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/app/providers/store-provider";
import { CENTERING_EVENT } from "@/shared/lib/events";

/**
 * Configuration options for {@link useScrollDirection}.
 */
interface ScrollDirectionOptions {
  /** Minimum accumulated scroll delta (px) before toggling header visibility. Defaults to `10`. */
  threshold?: number;
}

/**
 * Tracks scroll direction via `wheel` events and reports whether
 * the header should be hidden (scrolling down) or shown (scrolling up).
 *
 * Uses the `wheel` event instead of `scroll` to avoid false positives
 * from programmatic scrolling (e.g. ProseMirror `scrollIntoView`).
 *
 * Also listens for the {@link CENTERING_EVENT} custom event to hide the
 * header when the cursor-centering ProseMirror plugin triggers a
 * centering scroll, and forces the header visible when the container
 * is scrolled back to the very top.
 *
 * @param containerRef - Ref to the scrollable container element.
 * @param options - Configuration options. See {@link ScrollDirectionOptions}.
 * @returns `true` when the header should be hidden, `false` otherwise.
 */
export function useScrollDirection(
  containerRef: React.RefObject<HTMLElement | null>,
  options: ScrollDirectionOptions = {},
) {
  const { threshold = 10 } = options;
  const { editorState: editorStore } = useAppStore();
  const [isHidden, setIsHidden] = useState(false);

  // Load persisted header hidden state from the store on first mount.
  useEffect(() => {
    editorStore.get<boolean>("headerHidden").then((val) => {
      if (val !== undefined) setIsHidden(val);
    }).catch((err) => {
      console.error("Failed to load headerHidden:", err);
    });
  }, [editorStore]);

  /** Updates the hidden state and persists it to the store. */
  const setHidden = useCallback((value: boolean) => {
    setIsHidden(value);
    editorStore.set("headerHidden", value).catch((err) => {
      console.error("Failed to persist headerHidden:", err);
    });
  }, [editorStore]);
  const accumulatedDelta = useRef(0);
  const ticking = useRef(false);
  const clickLock = useRef(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rafId = useRef<number>(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    /** Locks wheel-based scroll detection for 200 ms after a mouse click to prevent accidental toggles. */
    const handleMouseDown = () => {
      clickLock.current = true;
      clickTimer.current = setTimeout(() => { clickLock.current = false; }, 200);
    };

    /**
     * Accumulates vertical wheel delta and, once it exceeds the threshold within a
     * single animation frame, toggles header visibility. Skips processing when the
     * container is already at the top or bottom edge, when a click lock is active,
     * or when the delta is purely horizontal.
     */
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
          setHidden(accumulatedDelta.current > 0);
          accumulatedDelta.current = 0;
        }

        ticking.current = false;
      });
    };

    /** Forces the header to become visible when the container is scrolled back to the very top. */
    const handleScroll = () => {
      if (container.scrollTop <= 0) {
        setHidden(false);
        accumulatedDelta.current = 0;
      }
    };

    /** Hides the header when the cursor-centering plugin triggers a centering scroll. */
    const handleCentering = () => {
      if (container.scrollTop > 0) {
        setHidden(true);
      }
    };

    container.addEventListener("mousedown", handleMouseDown, { passive: true });
    container.addEventListener("wheel", handleWheel, { passive: true });
    container.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener(CENTERING_EVENT, handleCentering);
    return () => {
      container.removeEventListener("mousedown", handleMouseDown);
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("scroll", handleScroll);
      document.removeEventListener(CENTERING_EVENT, handleCentering);
      cancelAnimationFrame(rafId.current);
      clearTimeout(clickTimer.current);
    };
  }, [containerRef, threshold, setHidden]);

  return isHidden;
}
