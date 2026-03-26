import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { StoreProvider } from './app/providers/store-provider'
import { SplashScreen } from './features/splash'
import './index.css'

/**
 * Application entry point.
 *
 * Mounts the React tree onto the `#root` DOM element. The render tree is:
 *
 * 1. `React.StrictMode` — enables strict-mode checks in development.
 * 2. `SplashScreen` — full-screen Three.js splash overlay that fades out
 *    once stores are loaded and the minimum display time has elapsed.
 * 3. `Suspense` — catches the suspend thrown by `{@link StoreProvider}`
 *    while store files are being loaded from disk.
 * 4. `StoreProvider` — initializes tauri-plugin-store instances and provides
 *    them to the rest of the component tree.
 * 5. `App` — the root application component.
 */
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <SplashScreen />
    <Suspense fallback={null}>
      <StoreProvider>
        <App />
      </StoreProvider>
    </Suspense>
  </React.StrictMode>
)
