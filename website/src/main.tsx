import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

/**
 * Application entry point.
 *
 * Selects the `#root` DOM element defined in `index.html` and mounts the root
 * {@link App} component inside React's {@link StrictMode}. The non-null
 * assertion (`!`) is intentional — the element is guaranteed to exist because
 * it is hard-coded in the HTML template.
 *
 * StrictMode intentionally double-invokes certain lifecycle methods during
 * development to surface side-effect bugs; it has no runtime impact in
 * production builds.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
