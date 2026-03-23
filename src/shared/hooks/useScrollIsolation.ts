import { useEffect } from "react";

interface ScrollIsolationOptions {
  /**
   * スクロール伝播を防止する要素のCSSセレクタ。
   *
   * - インライン要素（GenericPopover経由）:
   *   スクロールコンテナ内に直接レンダリングされ、stopPropagationで対応
   * - Portal要素（Radix Portal経由）:
   *   document.bodyにレンダリングされ、出現中はスクロールコンテナを
   *   overflow:hiddenでロックして対応
   */
  selectors: string[];
}

const marker = "scrollIsolated";

/**
 * スクロールコンテナ内の要素: stopPropagationでバブルアップを阻止。
 * GenericPopover経由の要素（スラッシュメニュー等）を対象とする。
 */
function isolateInline(el: HTMLElement) {
  if (el.dataset[marker]) return;
  el.dataset[marker] = "1";
  el.style.overscrollBehavior = "contain";
  el.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
}

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
 * Portal要素（document.body配下）の出現を監視し、
 * スクロールコンテナをoverflow:hiddenでロックする。
 *
 * ChromiumのcompositorスレッドはJSイベントとは独立して
 * scroll chainingを処理するため、preventDefaultでは防げない。
 * overflow:hiddenで物理的にスクロールを禁止する。
 */
function createPortalScrollLock(
  container: HTMLElement,
  portalSelector: string,
) {
  const lock = () => {
    container.style.overflowY = "hidden";
  };
  const unlock = () => {
    container.style.overflowY = "";
  };

  const check = () => {
    if (document.querySelector(portalSelector)) {
      lock();
    } else {
      unlock();
    }
  };

  const observer = new MutationObserver(check);
  observer.observe(document.body, { childList: true });
  check();

  return () => {
    observer.disconnect();
    unlock();
  };
}

/**
 * スクロールコンテナ内およびdocument.body配下のフローティングUI要素に対して
 * スクロール伝播防止を適用する。
 *
 * - GenericPopover経由の要素（スラッシュメニュー等）:
 *   stopPropagation + overscroll-behavior: contain
 * - Radix Portal経由の要素（Select/DropdownMenu等）:
 *   Portal出現中はスクロールコンテナをoverflow:hiddenでロック
 *
 * @param containerRef - スクロール可能な親コンテナのref
 * @param options - 伝播防止対象のCSSセレクタ配列
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
