/**
 * @module features/splash
 * Three.js animated splash screen shown during app initialization.
 *
 * The splash displays a constellation particle field with a rotating
 * wireframe icosahedron, overlaid with the "Scripta" wordmark. It
 * remains visible until stores finish loading and a minimum display
 * time has elapsed, then fades out and unmounts.
 */
export { SplashScreen } from "./ui/SplashScreen";
