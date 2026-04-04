import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/app/providers/store-provider'
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
import {
  DEFAULT_SOURCE_LANG,
  DEFAULT_TARGET_LANG,
  getSupportedLanguages,
  type SupportedLanguage,
  TRANSLATION_SOURCE_LANG_KEY,
  TRANSLATION_TARGET_LANG_KEY,
  translateNote,
} from '@/features/translation'

/**
 * Props for the {@link TranslationDialog} component.
 *
 * @property noteId - The ID of the note to translate, or `null` when the
 *   dialog should be closed.
 * @property onClose - Callback invoked when the dialog is dismissed without
 *   completing a translation.
 * @property onTranslated - Callback invoked with the newly created translated
 *   note's ID after a successful translation.
 */
interface TranslationDialogProps {
  noteId: string | null
  onClose: () => void
  onTranslated: (noteId: string) => void
}

/**
 * Modal dialog for translating a note using Apple Intelligence.
 *
 * Renders a language-pair selector (source → target) and a "Translate" button.
 * On mount (when `noteId` changes from `null` to a valid ID) it fetches the
 * list of supported languages from the backend and restores the previously
 * persisted language preferences from the app config store.
 *
 * On successful translation, `onTranslated` is called with the newly created
 * note's ID, and `onClose` is called to close the dialog.  On failure, a toast
 * error is shown.
 *
 * @param props - {@link TranslationDialogProps}
 * @returns The rendered modal dialog, or an empty dialog when `noteId` is `null`.
 *
 * @example
 * ```tsx
 * <TranslationDialog
 *   noteId={selectedNoteId}
 *   onClose={() => setTranslateTarget(null)}
 *   onTranslated={(id) => selectNote(id)}
 * />
 * ```
 */
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

    getSupportedLanguages()
      .then(setLanguages)
      .catch(() => setLanguages([]))

    Promise.all([
      configStore.get<string>(TRANSLATION_SOURCE_LANG_KEY),
      configStore.get<string>(TRANSLATION_TARGET_LANG_KEY),
    ]).then(([src, tgt]) => {
      if (src) setSourceLang(src)
      if (tgt) setTargetLang(tgt)
    })
  }, [noteId, configStore])

  /**
   * Executes the translation for the currently targeted note.
   *
   * 1. Calls {@link translateNote} with the selected language pair.
   * 2. Persists the chosen languages as new defaults in the config store.
   * 3. Notifies the parent via `onTranslated` and then closes the dialog.
   *
   * Shows a descriptive toast on failure, including a hint to download the
   * language model when the backend reports it is not yet available.
   */
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
            <label
              htmlFor="dialog-source-lang"
              className="mb-1 block text-sm font-medium"
            >
              From
            </label>
            <Select
              value={sourceLang}
              onValueChange={(v) => v && setSourceLang(v)}
            >
              <SelectTrigger id="dialog-source-lang">
                <SelectValue />
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
            <label
              htmlFor="dialog-target-lang"
              className="mb-1 block text-sm font-medium"
            >
              To
            </label>
            <Select
              value={targetLang}
              onValueChange={(v) => v != null && setTargetLang(v)}
            >
              <SelectTrigger id="dialog-target-lang">
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
