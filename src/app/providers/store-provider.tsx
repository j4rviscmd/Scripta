import { createContext, useContext, use, type ReactNode } from "react";
import { LazyStore } from "@tauri-apps/plugin-store";

/**
 * Module-scoped singleton store instances.
 *
 * - `configStore` — persistent application settings (e.g. theme, UI preferences).
 * - `editorStateStore` — transient editor state such as scroll positions and header visibility.
 */
const configStore = new LazyStore("config.json");
const editorStateStore = new LazyStore("editor-state.json");

/**
 * Promise that resolves when all stores have been loaded from disk.
 *
 * Consumed by {@link StoreProvider} via `React.use()` to suspend rendering
 * until the stores are ready.
 */
const initPromise = Promise.all([configStore.init(), editorStateStore.init()]);

/**
 * React context holding initialized store instances.
 *
 * @internal Use {@link useAppStore} to consume this context.
 */
const StoreContext = createContext<{
  config: LazyStore;
  editorState: LazyStore;
} | null>(null);

/**
 * Provides initialized store instances to the component tree.
 *
 * Internally uses `React.use()` to suspend rendering until all store
 * files have been loaded from disk. Wrap this component with a
 * `<Suspense>` boundary to handle the loading state.
 *
 * @param props - Component props.
 * @param props.children - The component subtree that needs access to the stores.
 *
 * @example
 * ```tsx
 * <Suspense fallback={<Loading />}>
 *   <StoreProvider>
 *     <App />
 *   </StoreProvider>
 * </Suspense>
 * ```
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  use(initPromise);

  return (
    <StoreContext.Provider value={{ config: configStore, editorState: editorStateStore }}>
      {children}
    </StoreContext.Provider>
  );
}

/**
 * Returns the map of initialized store instances.
 *
 * Must be called from a component rendered inside a `{@link StoreProvider}`.
 * Throws if the context is unavailable.
 *
 * @returns An object with `config` and `editorState` store instances.
 * @throws {Error} If used outside of a `<StoreProvider>`.
 *
 * @example
 * ```tsx
 * const { config, editorState } = useAppStore();
 * const theme = await config.get<string>("theme");
 * ```
 */
export function useAppStore() {
  const stores = useContext(StoreContext);
  if (!stores) {
    throw new Error("useAppStore must be used within a StoreProvider");
  }
  return stores;
}
