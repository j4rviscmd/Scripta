/**
 * React Context provider for the app-update state machine.
 *
 * Wires the pure {@link updateReducer} to Tauri plugin APIs and
 * configStore persistence. Holds the non-serializable `Update`
 * object in a ref and exposes typed actions to consumers.
 *
 * @module app/providers/update-provider
 */

import type { LazyStore } from '@tauri-apps/plugin-store'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useReducer,
  useRef,
  useState,
} from 'react'
import {
  checkForAppUpdate,
  relaunchApp,
  type Update,
} from '@/features/app-update/api'
import { SKIPPED_VERSION_STORE_KEY } from '@/features/app-update/lib/updateConfig'
import {
  INITIAL_STATE,
  type UpdateState,
  updateReducer,
} from '@/features/app-update/lib/updateReducer'
import { splashDonePromise } from '@/features/splash'

/**
 * Shape of the value exposed by the update context.
 *
 * Consumers obtain this via the {@link useAppUpdate} hook.
 */
interface UpdateContextValue {
  /** Current state of the update state machine. */
  state: UpdateState
  /** Whether the update dialog is currently visible. */
  dialogOpen: boolean
  /**
   * Initiates an update check.
   *
   * @param options.manual - When `true`, shows the dialog immediately and
   *   reports "up to date" / errors to the user. When `false` (default),
   *   runs silently and only surfaces the dialog if an update is available.
   */
  checkForUpdate: (options?: { manual?: boolean }) => Promise<void>
  /**
   * Downloads and installs the available update, then relaunches the app.
   * No-op if no update is available.
   */
  startUpdate: () => Promise<void>
  /**
   * Persists the currently available version as "skipped" so it is
   * suppressed in future automatic checks, then dismisses the dialog.
   */
  skipVersion: () => void
  /** Closes the dialog and resets the state to idle (unless non-dismissable). */
  dismiss: () => void
}

const UpdateContext = createContext<UpdateContextValue | null>(null)

/**
 * Provides app-update state and actions to the component tree.
 *
 * @param props.configStore - The LazyStore instance for persisting
 *   the skipped version preference.
 */
export function UpdateProvider({
  children,
  configStore,
}: {
  children: ReactNode
  configStore: LazyStore
}) {
  const [state, dispatch] = useReducer(updateReducer, INITIAL_STATE)
  const [dialogOpen, setDialogOpen] = useState(false)
  const updateRef = useRef<Update | null>(null)
  const skippedVersionRef = useRef<string | null>(null)
  const skippedVersionLoadedRef = useRef(false)

  const loadSkippedVersion = useCallback(async () => {
    if (skippedVersionLoadedRef.current) return
    skippedVersionLoadedRef.current = true
    try {
      const v = await configStore.get<string>(SKIPPED_VERSION_STORE_KEY)
      skippedVersionRef.current = v ?? null
    } catch (err) {
      console.error('Failed to load skippedUpdateVersion:', err)
      skippedVersionLoadedRef.current = false
    }
  }, [configStore])

  const checkForUpdate = useCallback(
    async (options?: { manual?: boolean }) => {
      const manual = options?.manual ?? false

      await loadSkippedVersion()

      if (manual) {
        setDialogOpen(true)
      }
      dispatch({ type: 'CHECK_START' })

      try {
        const update = await checkForAppUpdate()

        if (update) {
          // Auto-check: suppress if version was skipped
          if (!manual && update.version === skippedVersionRef.current) {
            dispatch({ type: 'DISMISS' })
            return
          }

          updateRef.current = update
          dispatch({
            type: 'UPDATE_AVAILABLE',
            version: update.version,
            body: update.body ?? '',
            date: update.date ?? '',
          })
          if (!manual) {
            await splashDonePromise
          }
          setDialogOpen(true)
        } else {
          if (manual) {
            dispatch({ type: 'UP_TO_DATE' })
          } else {
            // Auto-check: no feedback needed
            dispatch({ type: 'DISMISS' })
          }
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown error occurred'
        if (manual) {
          dispatch({ type: 'ERROR', message })
        } else {
          // Auto-check: fail silently
          console.warn('Startup update check failed:', message)
          dispatch({ type: 'DISMISS' })
        }
      }
    },
    [loadSkippedVersion]
  )

  const startUpdate = useCallback(async () => {
    const update = updateRef.current
    if (!update || state.status !== 'available') return

    dispatch({ type: 'DOWNLOAD_START' })

    let downloaded = 0
    let total = 0

    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            total = event.data.contentLength ?? 0
            break
          case 'Progress':
            downloaded += event.data.chunkLength
            dispatch({ type: 'DOWNLOAD_PROGRESS', downloaded, total })
            break
          case 'Finished':
            dispatch({ type: 'INSTALL_START' })
            break
        }
      })

      dispatch({ type: 'RESTART' })
      await relaunchApp()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Download failed'
      dispatch({ type: 'ERROR', message })
    }
  }, [state.status])

  const skipVersion = useCallback(() => {
    if (state.status !== 'available') return
    const { version } = state

    skippedVersionRef.current = version
    configStore.set(SKIPPED_VERSION_STORE_KEY, version).catch((err) => {
      console.error('Failed to persist skippedUpdateVersion:', err)
    })

    dispatch({ type: 'DISMISS' })
    setDialogOpen(false)
  }, [state, configStore])

  const dismiss = useCallback(() => {
    const nonDismissable = new Set([
      'downloading',
      'installing',
      'restarting',
      'checking',
    ])
    if (nonDismissable.has(state.status)) return

    dispatch({ type: 'DISMISS' })
    setDialogOpen(false)
  }, [state.status])

  return (
    <UpdateContext.Provider
      value={{
        state,
        dialogOpen,
        checkForUpdate,
        startUpdate,
        skipVersion,
        dismiss,
      }}
    >
      {children}
    </UpdateContext.Provider>
  )
}

/**
 * Returns the update state and actions from the nearest
 * {@link UpdateProvider}.
 *
 * @throws {Error} If used outside of an `<UpdateProvider>`.
 */
export function useAppUpdate() {
  const ctx = useContext(UpdateContext)
  if (!ctx) {
    throw new Error('useAppUpdate must be used within an UpdateProvider')
  }
  return ctx
}
