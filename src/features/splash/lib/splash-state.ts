let resolveFading: (() => void) | null = null
let resolveDone: (() => void) | null = null

/**
 * Promise that resolves when the splash screen begins its fade-out transition.
 *
 * The theme provider awaits this before applying the user's theme to the
 * DOM, ensuring the splash's dark background is not visually disrupted.
 */
export const splashFadingPromise = new Promise<void>((resolve) => {
  resolveFading = resolve
})

/**
 * Promise that resolves when the splash screen has fully completed
 * (fade-out transition finished and component unmounted).
 */
export const splashDonePromise = new Promise<void>((resolve) => {
  resolveDone = resolve
})

/** Called by the splash lifecycle when the `fading` phase begins. */
export function notifySplashFading() {
  resolveFading?.()
}

/** Called by the splash lifecycle when the `done` phase is reached. */
export function notifySplashDone() {
  resolveDone?.()
}
