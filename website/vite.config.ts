import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * Vite configuration for the Scripta GitHub Pages website.
 *
 * Key options:
 * - **`base`** – sets the public base path to `/Scripta/` to match the
 *   repository name used as the GitHub Pages deployment URL
 *   (`https://<owner>.github.io/Scripta/`). All asset and chunk URLs emitted
 *   by Vite will be prefixed with this path.
 * - **`plugins`** – enables the official React plugin (JSX transform + Fast
 *   Refresh) and the Tailwind CSS v4 Vite plugin, which processes utility
 *   classes at build time without a separate PostCSS step.
 * - **`build.outDir`** – writes the production bundle to `../website-dist`
 *   (one level above the `website/` source directory) so the CI workflow can
 *   commit the compiled output directly to the `gh-pages` branch.
 * - **`build.emptyOutDir`** – clears the output directory before each build
 *   to prevent stale artifacts from accumulating between runs.
 */
export default defineConfig({
  base: '/Scripta/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../website-dist',
    emptyOutDir: true,
  },
})
