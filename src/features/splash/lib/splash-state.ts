let resolveFading: (() => void) | null = null

/**
 * Promise that resolves when the splash screen begins its fade-out transition.
 *
 * The theme provider awaits this before applying the user's theme to the
 * DOM, ensuring the splash's dark background is not visually disrupted.
 */
export const splashFadingPromise = new Promise<void>((resolve) => {
  resolveFading = resolve
})

/** Called by the splash lifecycle when the `fading` phase begins. */
export function notifySplashFading() {
  resolveFading?.()
}
