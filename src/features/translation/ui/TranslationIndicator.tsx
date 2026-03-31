import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, Globe, Loader2, X } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import {
  checkLanguagePairStatus,
  getSupportedLanguages,
  type SupportedLanguage,
} from '@/features/translation'

/** Extract the base language code from a BCP-47 tag (e.g. "en-Latn-US" → "en"). */
const baseCode = (tag: string) => tag.split('-')[0]

type LanguagePairStatus = 'installed' | 'supported' | 'unsupported' | null

interface TranslationIndicatorProps {
  sourceLang: string
  targetLang: string
  detectedLang: string
  progress?: { completed: number; total: number } | null
  onRetranslate: (source: string, target: string) => void
  onDismiss: () => void
}

/**
 * Compact pill shown after translation, displaying the source → target
 * language pair as dropdown selectors. Changing either language triggers
 * re-translation from the stored original content.
 */
export function TranslationIndicator({
  sourceLang: initialSource,
  targetLang: initialTarget,
  detectedLang: initialDetected,
  progress,
  onRetranslate,
  onDismiss,
}: TranslationIndicatorProps) {
  const [languages, setLanguages] = useState<SupportedLanguage[]>([])
  const [sourceLang, setSourceLang] = useState(initialSource)
  const [targetLang, setTargetLang] = useState(initialTarget)
  const [detectedLang, setDetectedLang] = useState(initialDetected)
  const [pairStatus, setPairStatus] = useState<LanguagePairStatus>(null)

  useEffect(() => {
    getSupportedLanguages()
      .then((langs) => langs.sort((a, b) => a.code.localeCompare(b.code)))
      .then(setLanguages)
      .catch(() => setLanguages([]))
  }, [])

  // Check language pair status when source or target changes
  useEffect(() => {
    if (sourceLang === 'auto') {
      setPairStatus(null)
      return
    }
    let stale = false
    checkLanguagePairStatus(sourceLang, targetLang)
      .then((status) => {
        if (!stale) setPairStatus(status)
      })
      .catch(() => {
        if (!stale) setPairStatus(null)
      })
    return () => { stale = true }
  }, [sourceLang, targetLang])

  const langName = (code: string) =>
    code === 'auto'
      ? 'Auto'
      : languages.find((l) => l.code === code)?.name ?? code

  const displaySource = () => {
    if (sourceLang !== 'auto') return langName(sourceLang)
    if (!detectedLang) return 'Auto'
    const name = languages.find((l) => baseCode(l.code) === baseCode(detectedLang))?.name ?? detectedLang
    return `Auto (${name})`
  }

  const handleSourceChange = (v: string | null) => {
    if (!v) return
    setSourceLang(v)
    setDetectedLang('')
    onRetranslate(v, targetLang)
  }

  const handleTargetChange = (v: string | null) => {
    if (!v) return
    setTargetLang(v)
    onRetranslate(sourceLang, v)
  }

  const isTranslating = progress != null && progress.completed < progress.total

  return (
    <div className="flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs shadow-sm">
      {isTranslating ? (
        <>
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">
            {progress!.completed}/{progress!.total}
          </span>
        </>
      ) : (
        <>
          <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
          <Select value={sourceLang} onValueChange={handleSourceChange}>
            <SelectTrigger className="h-5 w-auto max-w-[120px] border-0 bg-transparent p-0 text-xs shadow-none">
              {displaySource()}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (Detect)</SelectItem>
              {languages.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          <Select value={targetLang} onValueChange={handleTargetChange}>
            <SelectTrigger className="h-5 w-auto max-w-[120px] border-0 bg-transparent p-0 text-xs shadow-none">
              {langName(targetLang)}
            </SelectTrigger>
            <SelectContent>
              {languages.map((lang) => (
                <SelectItem
                  key={lang.code}
                  value={lang.code}
                  disabled={sourceLang !== 'auto' && baseCode(lang.code) === baseCode(sourceLang)}
                >
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {pairStatus === 'supported' && (
            <span title="Language model not downloaded. Open System Settings to download.">
              <AlertTriangle className="h-3 w-3 shrink-0 text-yellow-500" />
            </span>
          )}
          {pairStatus === 'unsupported' && (
            <span title="This language pair is not supported.">
              <AlertTriangle className="h-3 w-3 shrink-0 text-red-500" />
            </span>
          )}
        </>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="ml-1 shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
