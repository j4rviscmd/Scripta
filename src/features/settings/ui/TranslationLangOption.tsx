import { useEffect, useState } from 'react'
import { useAppStore } from '@/app/providers/store-provider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import {
  DEFAULT_SOURCE_LANG,
  DEFAULT_TARGET_LANG,
  getSupportedLanguages,
  type SupportedLanguage,
  TRANSLATION_SOURCE_LANG_KEY,
  TRANSLATION_TARGET_LANG_KEY,
} from '@/features/translation'

/**
 * Settings option for configuring the default translation source and
 * target languages. Languages are fetched dynamically from the Apple
 * Translation framework at mount time.
 */
export function TranslationLangOption() {
  const { config: configStore } = useAppStore()
  const [languages, setLanguages] = useState<SupportedLanguage[]>([])
  const [sourceLang, setSourceLang] = useState(DEFAULT_SOURCE_LANG)
  const [targetLang, setTargetLang] = useState(DEFAULT_TARGET_LANG)

  const langName = (code: string) =>
    code === 'auto'
      ? 'Auto (Detect)'
      : (languages.find((l) => l.code === code)?.name ?? code)

  useEffect(() => {
    getSupportedLanguages()
      .then((langs) => langs.sort((a, b) => a.code.localeCompare(b.code)))
      .then(setLanguages)
      .catch(() => setLanguages([]))
  }, [])

  useEffect(() => {
    Promise.all([
      configStore.get<string>(TRANSLATION_SOURCE_LANG_KEY),
      configStore.get<string>(TRANSLATION_TARGET_LANG_KEY),
    ]).then(([src, tgt]) => {
      if (src) setSourceLang(src)
      if (tgt) setTargetLang(tgt)
    })
  }, [configStore])

  const handleSourceChange = (v: string | null) => {
    if (!v) return
    setSourceLang(v)
    configStore.set(TRANSLATION_SOURCE_LANG_KEY, v).catch((err) => {
      console.error('Failed to persist source lang:', err)
    })
  }

  const handleTargetChange = (v: string | null) => {
    if (!v) return
    setTargetLang(v)
    configStore.set(TRANSLATION_TARGET_LANG_KEY, v).catch((err) => {
      console.error('Failed to persist target lang:', err)
    })
  }

  const baseCode = (tag: string) => tag.split('-')[0]

  return (
    <div className="flex flex-col gap-3">
      <p className="px-3 font-medium text-muted-foreground text-xs">
        Translation Languages
      </p>
      <div className="flex items-center gap-4 px-3">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium">From</label>
          <Select value={sourceLang} onValueChange={handleSourceChange}>
            <SelectTrigger className="w-full">
              {langName(sourceLang)}
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
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium">To</label>
          <Select value={targetLang} onValueChange={handleTargetChange}>
            <SelectTrigger className="w-full">
              {langName(targetLang)}
            </SelectTrigger>
            <SelectContent>
              {languages.map((lang) => (
                <SelectItem
                  key={lang.code}
                  value={lang.code}
                  disabled={
                    sourceLang !== 'auto' &&
                    baseCode(lang.code) === baseCode(sourceLang)
                  }
                >
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
