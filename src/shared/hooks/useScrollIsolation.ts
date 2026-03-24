import { useEffect } from "react";

/**
 * Options for the {@link useScrollIsolation} hook.
 *
 * @property selectors - CSS selectors for elements whose scroll events
 *   should be isolated from the parent scroll container.
 *   - **Inline elements** (via GenericPopover): rendered directly inside
 *     the scroll container; handled with `stopPropagation`.
 *   - **Portal elements** (via Radix Portal): rendered under `document.body`;
 *     handled by locking the scroll container with `overflow: hidden` while
 *     the portal is present.
 */
interface ScrollIsolationOptions {
  selectors: string[];
}

const marker = "scrollIsolated";

/**
 * Applies scroll isolation to an inline element inside the scroll container.
 *
 * Prevents wheel events from bubbling up to the scroll container by calling
 * `stopPropagation`, and sets `overscroll-behavior: contain` to block the
 * browser's native scroll chaining.  Intended for elements rendered via
 * GenericPopover (e.g. the slash command menu).
 *
 * Each element is only processed once; subsequent calls are no-ops thanks
 * to a `data-scrollIsolated` marker attribute.
 *
 * @param el - The element to isolate.
 */
function isolateInline(el: HTMLElement) {
  if (el.dataset[marker]) return;
  el.dataset[marker] = "1";
  el.style.overscrollBehavior = "contain";
  el.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
}

/**
 * Observes the container for dynamically added elements matching `selector`
 * and applies inline scroll isolation to each of them.
 *
 * Uses a `MutationObserver` to catch elements added after the initial
 * query (e.g. popups opened by user interaction).
 *
 * @param container - The parent element to observe for new children.
 * @param selector - CSS selector for elements that should be isolated.
 * @returns The `MutationObserver` instance (call `disconnect()` to clean up).
 */
function observeInlineElements(
  container: HTMLElement,
  selector: string,
) {
  container.querySelectorAll(selector).forEach((el) => isolateInline(el as HTMLElement));

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          if (node.matches(selector)) isolateInline(node);
          node.querySelectorAll(selector).forEach((el) => isolateInline(el as HTMLElement));
        }
      }
    }
  });

  observer.observe(container, { childList: true, subtree: true });
  return observer;
}

/**
 * Monitors `document.body` for Portal elements matching `portalSelector`
 * and locks the scroll container with `overflow: hidden` while they exist.
 *
 * Chromium's compositor thread processes scroll chaining independently
 * from JS events, so `preventDefault` alone cannot prevent it.
 * `overflow: hidden` physically disables scrolling on the container.
 *
 * While locked, an `requestAnimationFrame` poll runs to catch Portal
 * elements removed by Radix animation teardown (which may bypass
 * `MutationObserver` detection).
 *
 * @param container - The scrollable container to lock/unlock.
 * @param portalSelector - CSS selector for Portal elements rendered under `document.body`.
 * @returns A cleanup function that disconnects the observer, cancels
 *   the polling loop, and unlocks the container.
 */
function createPortalScrollLock(
  container: HTMLElement,
  portalSelector: string,
) {
  let locked = false;
  let rafId = 0;

  const lock = () => {
    if (locked) return;
    locked = true;
    container.style.overflowY = "hidden";
  };
  const unlock = () => {
    if (!locked) return;
    locked = false;
    container.style.overflowY = "";
  };

  /**
   * Returns true if there is a matching portal element that is NOT a descendant
   * of the scroll container itself (i.e. it lives under document.body directly,
   * outside the container).
   */
  const hasExternalPortal = () => {
    const els = document.querySelectorAll(portalSelector);
    for (const el of els) {
      if (!container.contains(el)) return true;
    }
    return false;
  };

  const check = () => {
    if (hasExternalPortal()) {
      lock();
    } else {
      unlock();
    }
  };

  /**
   * While locked, poll every animation frame so that a Portal element
   * removed by Radix animation teardown (which may bypass MutationObserver
   * detection) is caught promptly and the container is unlocked.
   */
  const startPoll = () => {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      if (!locked) return;
      check();
      startPoll();
    });
  };

  const observer = new MutationObserver(() => {
    check();
    if (locked) startPoll();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  check();

  return () => {
    observer.disconnect();
    cancelAnimationFrame(rafId);
    unlock();
  };
}

/**
 * Applies scroll propagation prevention to floating UI elements both
 * inside the scroll container and under `document.body`.
 *
 * - **GenericPopover elements** (slash command menu, etc.):
 *   `stopPropagation` + `overscroll-behavior: contain`.
 * - **Radix Portal elements** (Select / DropdownMenu, etc.):
 *   Locks the scroll container with `overflow: hidden` while the portal is present.
 *
 * @param containerRef - Ref to the scrollable parent container.
 * @param options - Configuration for which selectors to isolate.
 * @param options.selectors - CSS selectors for elements whose scroll events should be isolated.
 */
export function useScrollIsolation(
  containerRef: React.RefObject<HTMLElement | null>,
  options: ScrollIsolationOptions,
): void {
  const { selectors } = options;
  const selectorString = selectors.join(",");

  useEffect(() => {
    const container = containerRef.current;
    if (!container || selectorString.length === 0) return;

    const inlineObserver = observeInlineElements(container, selectorString);
    const removePortalLock = createPortalScrollLock(container, selectorString);

    return () => {
      inlineObserver.disconnect();
      removePortalLock();
    };
  }, [containerRef, selectorString]);
}
