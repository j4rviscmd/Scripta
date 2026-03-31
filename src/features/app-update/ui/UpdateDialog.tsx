/**
 * Modal dialog that renders different content based on the current
 * update state machine status.
 *
 * Non-dismissable during download/install/restart to prevent the
 * user from accidentally interrupting the process.
 *
 * @module features/app-update/ui/UpdateDialog
 */

import { getVersion } from '@tauri-apps/api/app'
import { openUrl } from '@tauri-apps/plugin-opener'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import { useAppUpdate } from '@/app/providers/update-provider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const RELEASES_URL = 'https://github.com/j4rviscmd/Scripta/releases'

/**
 * Top-level update dialog that renders the appropriate sub-view
 * based on the current update state machine status.
 *
 * The dialog is non-dismissable during `downloading`, `installing`,
 * `restarting`, and `checking` phases to prevent accidental interruption.
 */
export function UpdateDialog() {
  const { state, dialogOpen, dismiss, startUpdate, skipVersion } =
    useAppUpdate()

  const canDismiss = ![
    'downloading',
    'installing',
    'restarting',
    'checking',
  ].includes(state.status)

  const handleOpenChange = (open: boolean) => {
    if (!open && canDismiss) dismiss()
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={canDismiss}
        className={
          state.status === 'available' ? 'sm:max-w-2xl' : 'sm:max-w-md'
        }
      >
        {state.status === 'checking' && <CheckingView />}
        {state.status === 'available' && (
          <AvailableView
            version={state.version}
            body={state.body}
            onUpdate={startUpdate}
            onLater={dismiss}
            onSkip={skipVersion}
          />
        )}
        {state.status === 'upToDate' && <UpToDateView />}
        {state.status === 'downloading' && (
          <DownloadingView downloaded={state.downloaded} total={state.total} />
        )}
        {state.status === 'installing' && (
          <InstallingView version={state.version} />
        )}
        {state.status === 'restarting' && <RestartingView />}
        {state.status === 'error' && <ErrorView message={state.message} />}
      </DialogContent>
    </Dialog>
  )
}

/** Spinner view shown while the update check network request is in flight. */
function CheckingView() {
  return (
    <DialogHeader>
      <div className="flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <DialogTitle>Checking for Updates</DialogTitle>
      </div>
      <DialogDescription>Please wait…</DialogDescription>
    </DialogHeader>
  )
}

/**
 * View displayed when a new version is available.
 *
 * Shows the version number, the current installed version, parsed
 * release notes (Markdown), and action buttons to update now, skip
 * this version, or defer.
 */
function AvailableView({
  version,
  body,
  onUpdate,
  onLater,
  onSkip,
}: {
  version: string
  body: string
  onUpdate: () => void
  onLater: () => void
  onSkip: () => void
}) {
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)

  useEffect(() => {
    getVersion()
      .then(setCurrentVersion)
      .catch(() => {})
  }, [])

  return (
    <>
      <DialogHeader>
        <DialogTitle>Update Available</DialogTitle>
        <DialogDescription>
          A new version <span className="font-semibold">v{version}</span> is
          ready to install.
          {currentVersion && (
            <span className="mt-1 block text-xs text-muted-foreground">
              Currently installed: v{currentVersion}
            </span>
          )}
        </DialogDescription>
      </DialogHeader>
      {body &&
        body.includes('## ') &&
        (() => {
          const notes = body.slice(body.indexOf('## '))
          return (
            <div className="update-release-notes max-h-[60vh] select-text overflow-y-auto rounded-md border bg-muted/50 p-3 text-sm [&_*]:select-text [&_a]:text-primary [&_a]:underline [&_h2]:mb-2 [&_h2]:text-sm [&_h2]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-1 [&_ul]:space-y-0.5">
              <Markdown>{notes}</Markdown>
            </div>
          )
        })()}
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => openUrl(RELEASES_URL)}
      >
        <ExternalLink className="h-3 w-3" />
        View past releases
      </button>
      <DialogFooter className="flex-col gap-2 sm:flex-row">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={onSkip}
        >
          Skip This Version
        </Button>
        <Button variant="outline" size="sm" onClick={onLater}>
          Later
        </Button>
        <Button size="sm" autoFocus onClick={onUpdate}>
          <Download className="mr-1.5 h-4 w-4" />
          Update Now
        </Button>
      </DialogFooter>
    </>
  )
}

/**
 * Progress bar view shown while the update binary is being downloaded.
 *
 * Renders a determinate progress bar when `total` is known, or an
 * indeterminate pulsing bar otherwise.
 */
function DownloadingView({
  downloaded,
  total,
}: {
  downloaded: number
  total: number
}) {
  const percentage = total > 0 ? Math.round((downloaded / total) * 100) : 0
  const isIndeterminate = total === 0

  return (
    <>
      <DialogHeader>
        <DialogTitle>Downloading Update</DialogTitle>
        <DialogDescription>
          {isIndeterminate ? 'Downloading…' : `Downloading… ${percentage}%`}
        </DialogDescription>
      </DialogHeader>
      <div className="py-2">
        {isIndeterminate ? (
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
          </div>
        ) : (
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
              style={{ width: `${percentage}%` }}
            />
          </div>
        )}
      </div>
    </>
  )
}

/** Spinner view shown while the downloaded update is being installed. */
function InstallingView({ version }: { version: string }) {
  return (
    <DialogHeader>
      <div className="flex items-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <DialogTitle>Installing v{version}</DialogTitle>
      </div>
      <DialogDescription>Please wait…</DialogDescription>
    </DialogHeader>
  )
}

/** View shown briefly while the application is relaunching after installation. */
function RestartingView() {
  return (
    <DialogHeader>
      <div className="flex items-center gap-2">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        <DialogTitle>Restarting</DialogTitle>
      </div>
      <DialogDescription>
        The application will restart shortly.
      </DialogDescription>
    </DialogHeader>
  )
}

/** Confirmation view shown when the app is already running the latest version. */
function UpToDateView() {
  const { dismiss } = useAppUpdate()
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)

  useEffect(() => {
    getVersion()
      .then(setCurrentVersion)
      .catch(() => {})
  }, [])

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <DialogTitle>You're Up to Date</DialogTitle>
        </div>
        <DialogDescription>
          Scripta is running the latest version.
          {currentVersion && ` (v${currentVersion})`}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" size="sm" onClick={dismiss}>
          Close
        </Button>
      </DialogFooter>
    </>
  )
}

/** Error view with the failure message and a "Try Again" button. */
function ErrorView({ message }: { message: string }) {
  const { checkForUpdate, dismiss } = useAppUpdate()

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <DialogTitle>Update Error</DialogTitle>
        </div>
        <DialogDescription className="break-all">{message}</DialogDescription>
      </DialogHeader>
      <DialogFooter className="flex-col gap-2 sm:flex-row">
        <Button variant="outline" size="sm" onClick={dismiss}>
          Close
        </Button>
        <Button size="sm" onClick={() => checkForUpdate({ manual: true })}>
          Try Again
        </Button>
      </DialogFooter>
    </>
  )
}
