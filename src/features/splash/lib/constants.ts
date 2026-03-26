/**
 * @module features/splash/lib/constants
 * Configuration constants for the splash screen feature.
 */

/** Minimum time (ms) the splash screen is displayed, regardless of store init speed. */
export const MIN_DISPLAY_MS = 2_000

/** Duration (ms) of the CSS opacity fade-out transition. */
export const FADE_DURATION_MS = 700

/** Number of particles in the constellation field. */
export const PARTICLE_COUNT = 150

/** Maximum distance between two particles for a connection line to be drawn. */
export const CONNECTION_DISTANCE = 5

/** Spatial bounds: particles are distributed within ±BOUNDS in each axis. */
export const BOUNDS = 20

/** Rotation speed multiplier for the particle group. */
export const ROTATION_SPEED_Y = 0.05
export const ROTATION_SPEED_X = 0.02

/** Central wireframe icosahedron radius. */
export const ICOSAHEDRON_RADIUS = 3

/** Three.js hex colours for the scene elements. */
export const COLORS = {
  /** Scene clear colour — matches dark theme --background ≈ oklch(0.145 0 0). */
  background: 0x252525,
  /** Point sprite colour for floating particles. */
  particles: 0x999999,
  /** Connection line colour (rendered at low opacity). */
  connections: 0x555555,
  /** Central wireframe icosahedron colour. */
  wireframe: 0x666666,
} as const
