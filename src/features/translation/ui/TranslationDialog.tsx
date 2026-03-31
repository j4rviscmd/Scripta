import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAppStore } from '@/app/providers/store-provider'
import {
  getSupportedLanguages,
  translateNote,
  type SupportedLanguage,
} from '@/features/translation/api/translate'
import {
  DEFAULT_SOURCE_LANG,
  DEFAULT_TARGET_LANG,
  TRANSLATION_SOURCE_LANG_KEY,
  TRANSLATION_TARGET_LANG_KEY,
} from '@/features/translation/lib/translationConfig'

interface TranslationDialogProps {
  noteId: string | null
  onClose: () => void
  onTranslated: (noteId: string) => void
}

export function TranslationDialog({
  noteId,
  onClose,
  onTranslated,
}: TranslationDialogProps) {
  const { config: configStore } = useAppStore()
  const [languages, setLanguages] = useState<SupportedLanguage[]>([])
  const [sourceLang, setSourceLang] = useState(DEFAULT_SOURCE_LANG)
  const [targetLang, setTargetLang] = useState(DEFAULT_TARGET_LANG)
  const [translating, setTranslating] = useState(false)

  useEffect(() => {
    if (noteId === null) return

    getSupportedLanguages().then(setLanguages).catch(() => setLanguages([]))

    Promise.all([
      configStore.get<string>(TRANSLATION_SOURCE_LANG_KEY),
      configStore.get<string>(TRANSLATION_TARGET_LANG_KEY),
    ]).then(([src, tgt]) => {
      if (src) setSourceLang(src)
      if (tgt) setTargetLang(tgt)
    })
  }, [noteId, configStore])

  const handleTranslate = useCallback(async () => {
    if (!noteId) return
    setTranslating(true)
    try {
      const translated = await translateNote(noteId, sourceLang, targetLang)
      // Persist selected languages as new defaults
      await Promise.all([
        configStore.set(TRANSLATION_SOURCE_LANG_KEY, sourceLang),
        configStore.set(TRANSLATION_TARGET_LANG_KEY, targetLang),
      ])
      onTranslated(translated.id)
      onClose()
    } catch (e) {
      console.error('Translation error:', e)
      const msg = String(e)
      toast.error('Failed to translate note', {
        description: msg.includes('not downloaded')
          ? 'System Settings > General > Language & Region > Translation Languages から言語モデルをダウンロードしてください'
          : msg,
      })
    } finally {
      setTranslating(false)
    }
  }, [noteId, sourceLang, targetLang, configStore, onTranslated, onClose])

  return (
    <Dialog open={noteId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Translate Note</DialogTitle>
          <DialogDescription>
            Select source and target languages.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-4 py-2">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium">From</label>
            <Select value={sourceLang} onValueChange={(v) => v && setSourceLang(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
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
            <Select value={targetLang} onValueChange={(v) => v != null && setTargetLang(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter showCloseButton>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            onClick={handleTranslate}
            disabled={translating || sourceLang === targetLang}
          >
            {translating ? 'Translating...' : 'Translate'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
