/**
 * @module features/splash/hooks/useSplashLifecycle
 * Manages the splash screen lifecycle state machine.
 *
 * States: `active` → `fading` → `done`
 *
 * The splash remains in the `active` state until both conditions are met:
 * 1. The store initialization promise has resolved.
 * 2. The minimum display time has elapsed.
 *
 * Once both conditions are satisfied the state transitions to `fading`,
 * during which the CSS fade-out transition plays. After the transition
 * completes, the state moves to `done` and the splash can be unmounted.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { storeInitPromise } from "@/app/providers/store-provider";
import { MIN_DISPLAY_MS, FADE_DURATION_MS } from "../lib/constants";

type SplashPhase = "active" | "fading" | "done";

interface SplashLifecycle {
  /** Current phase of the splash screen. */
  phase: SplashPhase;
  /** Handler to attach to the overlay's `onTransitionEnd` event. */
  onFadeComplete: () => void;
}

/**
 * Hook that drives the splash screen through its lifecycle phases.
 *
 * @returns The current {@link SplashPhase} and a callback for the
 *          fade-out transition end event.
 */
export function useSplashLifecycle(): SplashLifecycle {
  const [phase, setPhase] = useState<SplashPhase>("active");
  const disposedRef = useRef(false);

  useEffect(() => {
    disposedRef.current = false;

    const minTimer = new Promise<void>((resolve) =>
      setTimeout(resolve, MIN_DISPLAY_MS),
    );

    Promise.all([storeInitPromise, minTimer]).then(() => {
      if (!disposedRef.current) {
        setPhase("fading");
      }
    });

    return () => {
      disposedRef.current = true;
    };
  }, []);

  const onFadeComplete = useCallback(() => {
    setPhase("done");
  }, []);

  return { phase, onFadeComplete };
}

/** Duration of the CSS fade-out transition, exported for the UI layer. */
export { FADE_DURATION_MS };
