/**
 * @module features/splash/lib/createScene
 * Imperative Three.js scene factory for the splash screen.
 *
 * Creates a constellation-style particle field with proximity-based
 * connection lines and a slowly rotating central wireframe icosahedron.
 * The camera sits at a fixed position while the entire particle group
 * rotates gently, creating depth and movement.
 *
 * @example
 * ```ts
 * const scene = createSplashScene(canvasElement);
 * // later…
 * scene.dispose();
 * ```
 */

import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  BufferGeometry,
  Float32BufferAttribute,
  PointsMaterial,
  Points,
  LineBasicMaterial,
  LineSegments,
  MeshBasicMaterial,
  IcosahedronGeometry,
  Mesh,
  Group,
  Clock,
} from "three";

import {
  PARTICLE_COUNT,
  CONNECTION_DISTANCE,
  BOUNDS,
  ROTATION_SPEED_Y,
  ROTATION_SPEED_X,
  ICOSAHEDRON_RADIUS,
  COLORS,
} from "./constants";

/** Opaque handle returned by {@link createSplashScene}. */
export interface SplashSceneHandle {
  /** Stop the render loop and release all Three.js resources. */
  dispose(): void;
  /** Update camera aspect ratio and renderer viewport on resize. */
  resize(width: number, height: number): void;
}

/**
 * Creates the splash scene and starts the animation loop.
 *
 * @param canvas - The `<canvas>` element to render into.
 * @returns A handle with `dispose` and `resize` methods.
 */
export function createSplashScene(canvas: HTMLCanvasElement): SplashSceneHandle {
  const width = canvas.clientWidth || window.innerWidth;
  const height = canvas.clientHeight || window.innerHeight;

  // ── Renderer ──────────────────────────────────────────────
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(COLORS.background);

  // ── Scene & Camera ────────────────────────────────────────
  const scene = new Scene();
  const camera = new PerspectiveCamera(60, width / height, 0.1, 1000);
  camera.position.z = 30;

  // ── Particles ─────────────────────────────────────────────
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * BOUNDS * 2;
    positions[i3 + 1] = (Math.random() - 0.5) * BOUNDS * 2;
    positions[i3 + 2] = (Math.random() - 0.5) * BOUNDS * 2;
  }

  const pointsGeo = new BufferGeometry();
  pointsGeo.setAttribute("position", new Float32BufferAttribute(positions, 3));

  const pointsMat = new PointsMaterial({
    color: COLORS.particles,
    size: 0.12,
    transparent: true,
    opacity: 0.7,
    sizeAttenuation: true,
  });

  const points = new Points(pointsGeo, pointsMat);

  // ── Connection lines (computed once at init) ──────────────
  const lineVerts: number[] = [];
  const threshold2 = CONNECTION_DISTANCE ** 2;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    for (let j = i + 1; j < PARTICLE_COUNT; j++) {
      const dx = positions[i * 3] - positions[j * 3];
      const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
      const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
      if (dx * dx + dy * dy + dz * dz < threshold2) {
        lineVerts.push(
          positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2],
          positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2],
        );
      }
    }
  }

  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute("position", new Float32BufferAttribute(lineVerts, 3));
  const lineMat = new LineBasicMaterial({
    color: COLORS.connections,
    transparent: true,
    opacity: 0.2,
  });
  const lines = new LineSegments(lineGeo, lineMat);

  // ── Central wireframe icosahedron ─────────────────────────
  const icoGeo = new IcosahedronGeometry(ICOSAHEDRON_RADIUS, 1);
  const icoMat = new MeshBasicMaterial({
    color: COLORS.wireframe,
    wireframe: true,
    transparent: true,
    opacity: 0.3,
  });
  const ico = new Mesh(icoGeo, icoMat);

  // ── Group for synchronized rotation ───────────────────────
  const group = new Group();
  group.add(points, lines, ico);
  scene.add(group);

  // ── Animation loop ────────────────────────────────────────
  const clock = new Clock();
  let frameId = 0;

  function animate() {
    frameId = requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();
    group.rotation.y = elapsed * ROTATION_SPEED_Y;
    group.rotation.x = elapsed * ROTATION_SPEED_X;
    ico.rotation.y = elapsed * 0.1;
    ico.rotation.z = elapsed * 0.07;
    renderer.render(scene, camera);
  }

  // ── Resize handler ────────────────────────────────────────
  function onResize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  window.addEventListener("resize", onResize);
  animate();

  return {
    dispose() {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onResize);
      pointsGeo.dispose();
      pointsMat.dispose();
      lineGeo.dispose();
      lineMat.dispose();
      icoGeo.dispose();
      icoMat.dispose();
      renderer.dispose();
    },
    resize(w: number, h: number) {
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
  };
}
