import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { StoreProvider } from "./app/providers/store-provider";
import "./index.css";

/**
 * Application entry point.
 *
 * Mounts the React tree onto the `#root` DOM element. The render tree is:
 *
 * 1. `React.StrictMode` — enables strict-mode checks in development.
 * 2. `Suspense` — catches the suspend thrown by `{@link StoreProvider}`
 *    while store files are being loaded from disk.
 * 3. `StoreProvider` — initializes tauri-plugin-store instances and provides
 *    them to the rest of the component tree.
 * 4. `App` — the root application component.
 */
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      <StoreProvider>
        <App />
      </StoreProvider>
    </Suspense>
  </React.StrictMode>,
);
