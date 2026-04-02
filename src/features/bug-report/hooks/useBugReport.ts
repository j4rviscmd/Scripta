/**
 * Hook for submitting anonymous bug reports to GitHub Issues.
 *
 * Collects environment information (app version, OS) automatically
 * and manages the async submission lifecycle.
 *
 * @module features/bug-report/hooks/useBugReport
 */

import { getVersion } from '@tauri-apps/api/app'
import { useState } from 'react'
import {
  type CreateIssueParams,
  createBugReportIssue,
} from '../api/githubIssue'

/** Status of the bug report submission. */
export type BugReportStatus = 'idle' | 'submitting' | 'success' | 'error'

/**
 * Return value of {@link useBugReport}.
 */
export interface UseBugReportReturn {
  status: BugReportStatus
  errorMessage: string | null
  issueUrl: string | null
  submit: (params: { title: string; description: string }) => Promise<void>
  reset: () => void
}

/**
 * Derives a human-readable OS description from the browser's user agent.
 *
 * @returns OS label (e.g. "macOS", "Windows", "Linux").
 */
function detectOs(): string {
  const ua = navigator.userAgent
  if (/Mac OS X/.test(ua)) return 'macOS'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Linux/.test(ua)) return 'Linux'
  return 'Unknown'
}

/**
 * Manages the lifecycle of an anonymous bug report submission.
 *
 * Automatically collects the app version and OS information.
 * Exposes `submit`, `status`, `errorMessage`, `issueUrl`, and `reset`.
 */
export function useBugReport(): UseBugReportReturn {
  const [status, setStatus] = useState<BugReportStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [issueUrl, setIssueUrl] = useState<string | null>(null)

  const submit = async (params: { title: string; description: string }) => {
    setStatus('submitting')
    setErrorMessage(null)
    setIssueUrl(null)

    try {
      const appVersion = await getVersion()
      const osInfo = detectOs()

      const issueParams: CreateIssueParams = {
        title: params.title,
        description: params.description,
        appVersion,
        osInfo,
      }

      const result = await createBugReportIssue(issueParams)
      setIssueUrl(result.url)
      setStatus('success')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred.'
      setErrorMessage(message)
      setStatus('error')
    }
  }

  const reset = () => {
    setStatus('idle')
    setErrorMessage(null)
    setIssueUrl(null)
  }

  return { status, errorMessage, issueUrl, submit, reset }
}
