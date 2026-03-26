import { Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useEditorFont } from '@/app/providers/editor-font-provider'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { GoogleFontEntry } from '@/data/googleFonts'
import googleFonts from '@/data/googleFonts.json'
import { DEFAULT_EDITOR_FONT_LABEL } from '@/features/settings/lib/editorFontConfig'
import { cn } from '@/lib/utils'

const MAX_VISIBLE_ITEMS = 50

export function EditorFontOption() {
  const { fontLabel, setEditorFont, reset, isLoadingFont } = useEditorFont()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filteredFonts = useMemo(() => {
    if (!search.trim()) return googleFonts.slice(0, MAX_VISIBLE_ITEMS)
    const q = search.replace(/\s+/g, '').toLowerCase()
    return googleFonts
      .filter((f) => f.family.replace(/\s+/g, '').toLowerCase().includes(q))
      .slice(0, MAX_VISIBLE_ITEMS)
  }, [search])

  const isDefault = fontLabel === DEFAULT_EDITOR_FONT_LABEL
  const fontFamilyStyle = isDefault ? undefined : `'${fontLabel}', sans-serif`

  return (
    <div className="flex flex-col gap-3">
      <p className="px-3 font-medium text-muted-foreground text-xs">
        Editor Font
      </p>
      <div className="flex flex-col gap-2 px-3">
        <Label className="text-sm">Family</Label>
        <div className="flex items-center gap-2">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              className="inline-flex w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 font-normal text-sm hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground"
              aria-expanded={open}
            >
              <span
                className="truncate"
                style={{ fontFamily: fontFamilyStyle }}
              >
                {isLoadingFont ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading…
                  </span>
                ) : (
                  fontLabel
                )}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
              <Input
                placeholder="Search fonts…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-b-none border-x-0 border-t-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <Command shouldFilter={false}>
                <CommandList>
                  <CommandEmpty>No fonts found.</CommandEmpty>
                  <CommandGroup className="max-h-[200px] overflow-y-auto">
                    {filteredFonts.map((font) => (
                      <FontItem
                        key={font.family}
                        font={font}
                        isSelected={font.family === fontLabel}
                        onSelect={() => {
                          setEditorFont(font)
                          setOpen(false)
                          setSearch('')
                        }}
                      />
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        {!isDefault && (
          <button
            type="button"
            className="h-5 w-fit px-2 text-muted-foreground text-xs hover:text-foreground"
            onClick={reset}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  )
}

function FontItem({
  font,
  isSelected,
  onSelect,
}: {
  font: GoogleFontEntry
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <CommandItem
      value={font.family}
      onSelect={onSelect}
      className="cursor-pointer"
    >
      <Check
        className={cn(
          'mr-2 h-4 w-4 shrink-0',
          isSelected ? 'opacity-100' : 'opacity-0'
        )}
      />
      <span style={{ fontFamily: `'${font.family}', sans-serif` }}>
        {font.family}
      </span>
      <span className="ml-1.5 text-muted-foreground text-xs">
        {font.category}
      </span>
    </CommandItem>
  )
}
