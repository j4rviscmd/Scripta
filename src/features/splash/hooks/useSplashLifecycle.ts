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

import { getCurrentWindow } from '@tauri-apps/api/window'
import { useCallback, useEffect, useRef, useState } from 'react'
import { storeInitPromise } from '@/app/providers/store-provider'
import { FADE_DURATION_MS, MIN_DISPLAY_MS } from '../lib/constants'
import { notifySplashDone, notifySplashFading } from '../lib/splash-state'

/** Phases of the splash screen lifecycle. */
type SplashPhase = 'active' | 'fading' | 'done'

/**
 * Shape returned by {@link useSplashLifecycle}.
 *
 * Provides the current lifecycle phase and a callback that must be wired to
 * the overlay element's `onTransitionEnd` so the hook can advance from
 * `fading` to `done`.
 */
interface SplashLifecycle {
  /** Current phase of the splash screen. */
  phase: SplashPhase
  /** Handler to attach to the overlay's `onTransitionEnd` event. */
  onFadeComplete: () => void
}

/**
 * Hook that drives the splash screen through its lifecycle phases.
 *
 * @returns The current {@link SplashPhase} and a callback for the
 *          fade-out transition end event.
 */
export function useSplashLifecycle(): SplashLifecycle {
  const [phase, setPhase] = useState<SplashPhase>('active')
  const disposedRef = useRef(false)

  useEffect(() => {
    disposedRef.current = false

    const wait = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms))

    Promise.all([storeInitPromise, wait(MIN_DISPLAY_MS)]).then(() => {
      if (!disposedRef.current) {
        notifySplashFading()
        setPhase('fading')
      }
    })

    return () => {
      disposedRef.current = true
    }
  }, [])

  // Re-enable window operations once the splash is fully dismissed.
  useEffect(() => {
    if (phase !== 'done') return
    notifySplashDone()
    const appWindow = getCurrentWindow()
    Promise.all([
      appWindow.setResizable(true),
      appWindow.setMaximizable(true),
    ]).catch((e) => {
      console.error('Failed to re-enable window operations:', e)
    })
  }, [phase])

  const onFadeComplete = useCallback(() => {
    setPhase('done')
  }, [])

  return { phase, onFadeComplete }
}

/** Duration of the CSS fade-out transition, exported for the UI layer. */
export { FADE_DURATION_MS }
