/**
 * @module features/splash/hooks/useThreeScene
 * Imperative bridge between React and the Three.js splash scene.
 *
 * Dynamically imports the scene module (enabling Vite code-splitting)
 * and manages mount/dispose tied to the canvas ref lifecycle.
 */

import { type RefObject, useEffect, useRef } from 'react'
import type { SplashSceneHandle } from '../lib/createScene'

/**
 * Mounts the Three.js splash scene onto the given canvas element.
 *
 * The scene module is loaded via dynamic `import()` so that Three.js
 * is placed in a separate Vite chunk and does not bloat the main bundle.
 * On unmount the scene is deterministically disposed (geometry, materials,
 * renderer, event listeners).
 *
 * @param canvasRef - React ref pointing to the target `<canvas>` element.
 * @param enabled  - When `false` the scene is not created (or is disposed
 *                   if already running). Pass `false` once the splash is done.
 */
export function useThreeScene(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  enabled: boolean
): void {
  const sceneRef = useRef<SplashSceneHandle | null>(null)

  useEffect(() => {
    if (!enabled || !canvasRef.current) return

    let disposed = false

    import('../lib/createScene').then(({ createSplashScene }) => {
      if (disposed || !canvasRef.current) return
      sceneRef.current = createSplashScene(canvasRef.current)
    })

    return () => {
      disposed = true
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
  }, [canvasRef, enabled])
}
