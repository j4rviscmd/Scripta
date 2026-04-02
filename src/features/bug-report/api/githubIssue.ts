/**
 * GitHub Issues API integration for anonymous bug reporting.
 *
 * Creates a new issue on the j4rviscmd/Scripta repository using a
 * pre-configured Personal Access Token embedded at build time.
 *
 * Required environment variable (set at build time):
 * - VITE_BUG_REPORT_TOKEN  — GitHub PAT with Issues: Read & Write
 *
 * @module features/bug-report/api/githubIssue
 */

const GITHUB_TOKEN = import.meta.env.VITE_BUG_REPORT_TOKEN as string | undefined

const GITHUB_REPO = 'j4rviscmd/Scripta'

/**
 * Parameters for creating a bug report issue on GitHub.
 */
export interface CreateIssueParams {
  /** User-provided short title for the issue */
  title: string
  /** User-provided description of the bug */
  description: string
  /** Application version (e.g. "0.5.0") */
  appVersion: string
  /** OS information derived from user agent */
  osInfo: string
}

/**
 * Builds the Markdown body for the GitHub issue.
 *
 * @param params - The issue parameters.
 * @returns Formatted Markdown string.
 */
function buildIssueBody(params: CreateIssueParams): string {
  const lines: string[] = [
    '## Bug Report',
    '',
    '### Description',
    params.description,
    '',
    '### Environment',
    `- **App Version**: ${params.appVersion}`,
    `- **OS**: ${params.osInfo}`,
    '',
    '---',
    '*This report was submitted anonymously via the in-app bug reporter.*',
  ]
  return lines.join('\n')
}

/**
 * Creates a GitHub issue for a bug report.
 *
 * @param params - The bug report parameters.
 * @throws {Error} When the GitHub token is not configured or the API request fails.
 */
export async function createBugReportIssue(
  params: CreateIssueParams
): Promise<{ url: string }> {
  if (!GITHUB_TOKEN) {
    throw new Error(
      'Bug reporting is not configured. VITE_BUG_REPORT_TOKEN is missing.'
    )
  }

  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/issues`

  const body = buildIssueBody(params)

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      title: `[Bug Report][Anonymous] ${params.title}`,
      body,
      labels: ['bug', 'user-report'],
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`GitHub API error ${response.status}: ${text}`)
  }

  const data = (await response.json()) as { html_url: string }
  return { url: data.html_url }
}
