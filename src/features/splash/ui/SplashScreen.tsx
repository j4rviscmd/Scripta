/**
 * @module features/splash/ui/SplashScreen
 * Full-screen splash overlay with Three.js particle background.
 *
 * Displays the "Scripta" wordmark over an animated constellation network
 * and a slowly rotating wireframe icosahedron. The overlay remains visible
 * until the store initialization completes **and** a minimum display time
 * has elapsed, then fades out smoothly and unmounts.
 */

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { useSplashLifecycle, FADE_DURATION_MS } from "../hooks/useSplashLifecycle";
import { useThreeScene } from "../hooks/useThreeScene";

/**
 * Splash screen overlay rendered as a sibling to the main app tree.
 *
 * Once the splash lifecycle reaches the `done` phase, this component
 * returns `null` so React removes it from the DOM entirely — freeing
 * the Three.js canvas and all GPU resources.
 */
export function SplashScreen() {
  const { phase, onFadeComplete } = useSplashLifecycle();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useThreeScene(canvasRef, phase !== "done");

  if (phase === "done") return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        "bg-[oklch(0.16_0_0)]",
        "transition-opacity ease-out",
        phase === "fading" ? "opacity-0" : "opacity-100",
      )}
      style={{ transitionDuration: `${FADE_DURATION_MS}ms` }}
      onTransitionEnd={(e) => {
        // Only react to the opacity transition on this element
        if (e.target === e.currentTarget && e.propertyName === "opacity") {
          onFadeComplete();
        }
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <h1
        className={cn(
          "relative z-10 select-none",
          "font-sans text-5xl font-extralight tracking-[0.3em]",
          "text-white/90",
          "animate-in fade-in duration-1000",
        )}
      >
        Scripta
      </h1>
    </div>
  );
}
