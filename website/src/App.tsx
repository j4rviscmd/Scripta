import {
  Download,
  Github,
  Globe,
  Moon,
  Sun,
  Wifi,
  Zap,
  FileText,
  Palette,
  Shield,
  Heart,
  Sparkles,
} from 'lucide-react'
import { useEffect, useState } from 'react'

/**
 * Download URLs for each platform-specific Scripta release asset.
 *
 * Each URL points to the latest artifact published to GitHub Releases,
 * so users always receive the most recent version without manual URL updates.
 */
const DOWNLOAD_URLS = {
  macArm: 'https://github.com/j4rviscmd/Scripta/releases/latest/download/Scripta_macOS_arm64.dmg',
  macIntel: 'https://github.com/j4rviscmd/Scripta/releases/latest/download/Scripta_macOS_x64.dmg',
  windows: 'https://github.com/j4rviscmd/Scripta/releases/latest/download/Scripta_Windows_x64-setup.exe',
}

/**
 * Feature card definitions rendered in the features grid section.
 *
 * Each entry describes one key capability of Scripta and contains:
 * - `icon` – a lucide-react icon component used as the card's visual marker.
 * - `title` – a short label displayed as the card heading.
 * - `description` – a one-sentence explanation of the feature.
 */
const FEATURES = [
  {
    icon: Wifi,
    title: 'Fully Offline',
    description: 'No internet required. Your notes live entirely on your device — private by design.',
  },
  {
    icon: Zap,
    title: 'Instant & Lightweight',
    description: 'Opens in milliseconds. No bloat, no background sync, no battery drain.',
  },
  {
    icon: FileText,
    title: 'Rich Text Editor',
    description: 'Markdown support, headings, lists, and code blocks. Write exactly how you think.',
  },
  {
    icon: Palette,
    title: '1900+ Fonts',
    description: 'Pick from over 1,900 Google Fonts to make your notes truly yours.',
  },
  {
    icon: Globe,
    title: 'Markdown Import / Export',
    description: 'Your notes are plain Markdown files. Import and export anytime — zero lock-in.',
  },
  {
    icon: Sparkles,
    title: 'On-Device AI',
    description: 'Translate and summarize your notes with Apple Intelligence — private, fast, and entirely on-device. Requires macOS 26+.',
  },
  {
    icon: Heart,
    title: '100% Free Forever',
    description: 'No subscription, no trial, no freemium. Scripta is free and open-source under MIT.',
  },
]

/**
 * Custom hook that manages the application's dark mode state.
 *
 * **Initialization** — the initial value is resolved with the following priority:
 * 1. The value persisted in `localStorage` under the key `"scripta-theme"`
 *    (`"dark"` → `true`, anything else → `false`).
 * 2. The OS-level `prefers-color-scheme: dark` media query when no stored
 *    preference is found, or when `localStorage` is unavailable.
 *
 * **Side effects** — whenever the dark state changes, the hook:
 * - Adds or removes the `"dark"` CSS class on `document.documentElement`,
 *   which activates Tailwind's dark-mode variant across the entire page.
 * - Writes the new preference (`"dark"` | `"light"`) back to `localStorage`
 *   so the choice survives page reloads. Both storage operations are wrapped
 *   in try/catch to handle environments where `localStorage` is restricted.
 *
 * @returns A readonly tuple `[dark, setDark]` where `dark` is the current
 *   boolean dark-mode state and `setDark` is the React state dispatch function.
 */
function useDarkMode() {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem('scripta-theme')
      if (saved) return saved === 'dark'
    } catch (_) {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    const root = document.documentElement
    if (dark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    try {
      localStorage.setItem('scripta-theme', dark ? 'dark' : 'light')
    } catch (_) {}
  }, [dark])

  return [dark, setDark] as const
}

/**
 * Root application component for the Scripta marketing website.
 *
 * Renders a single-page landing layout composed of five sections:
 * 1. **Navbar** – sticky header with the Scripta logo, a GitHub link, and a
 *    dark-mode toggle button powered by {@link useDarkMode}.
 * 2. **Hero** – headline, sub-copy, and platform-specific download buttons
 *    sourced from {@link DOWNLOAD_URLS}.
 * 3. **Screenshot** – a full-width app screenshot with a decorative shadow.
 * 4. **Features** – a responsive grid of feature cards defined in
 *    {@link FEATURES}.
 * 5. **Footer** – MIT license notice and a link to the GitHub repository.
 *
 * The `BASE_URL` injected by Vite at build time is used to prefix static asset
 * paths (`icon.svg`, `screenshot.png`) so they resolve correctly under the
 * `/Scripta/` GitHub Pages base path.
 *
 * @returns The full-page JSX layout of the Scripta landing page.
 */
export default function App() {
  const [dark, setDark] = useDarkMode()
  const base = import.meta.env.BASE_URL

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 transition-colors duration-200">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={`${base}icon.svg`} alt="Scripta icon" className="w-6 h-6" />
            <span className="font-semibold text-lg tracking-tight">Scripta</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/j4rviscmd/Scripta"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
              className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              <Github className="w-5 h-5" />
            </a>
            <button
              onClick={() => setDark((d) => !d)}
              aria-label="Toggle dark mode"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-sm mb-8">
          <Shield className="w-3.5 h-3.5" />
          <span>Free &amp; Open Source · MIT License</span>
        </div>

        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-tight mb-6">
          A beautifully simple<br />
          <span className="text-zinc-500 dark:text-zinc-400">note app for your desktop</span>
        </h1>

        <p className="text-xl text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          No accounts. No cloud. No subscriptions.<br />
          Just your notes, living privately on your computer.
        </p>

        {/* Download buttons */}
        <div className="flex flex-wrap justify-center gap-3">
          <a
            href={DOWNLOAD_URLS.macArm}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-medium hover:opacity-90 transition-opacity"
          >
            <Download className="w-4 h-4" />
            macOS (Apple Silicon)
          </a>
          <a
            href={DOWNLOAD_URLS.macIntel}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            macOS (Intel)
          </a>
          <a
            href={DOWNLOAD_URLS.windows}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-medium hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Windows
          </a>
        </div>
      </section>

      {/* Screenshot */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-2xl shadow-zinc-900/10 dark:shadow-zinc-900/50">
          <img
            src={`${base}screenshot.png`}
            alt="Scripta app screenshot"
            className="w-full block"
            loading="lazy"
          />
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <h2 className="text-3xl font-bold text-center mb-12">Everything you need, nothing you don't</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-white dark:text-zinc-900" />
              </div>
              <h3 className="font-semibold text-lg mb-2">{title}</h3>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-2">
            <img src={`${base}icon.svg`} alt="Scripta icon" className="w-4 h-4 opacity-60" />
            <span>Scripta — MIT License</span>
          </div>
          <a
            href="https://github.com/j4rviscmd/Scripta"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            <Github className="w-4 h-4" />
            j4rviscmd/Scripta
          </a>
        </div>
      </footer>
    </div>
  )
}
