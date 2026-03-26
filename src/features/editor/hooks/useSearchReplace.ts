import type { BlockNoteEditor } from '@blocknote/core'
import { TextSelection } from 'prosemirror-state'
import { useCallback, useEffect, useRef, useState } from 'react'
import { searchConfig } from '../lib/searchConfig'
import { searchPluginKey } from '../lib/searchPlugin'

/**
 * Return value of {@link useSearchReplace}.
 *
 * Exposes the full search & replace state and control callbacks
 * needed by the {@link SearchReplacePanel} UI component.
 */
export interface UseSearchReplaceReturn {
  isOpen: boolean
  query: string
  replaceText: string
  caseSensitive: boolean
  useRegex: boolean
  matchCount: number
  currentMatchIndex: number
  searchInputRef: React.RefObject<HTMLInputElement | null>
  open: () => void
  close: () => void
  setQuery: (q: string) => void
  setReplaceText: (t: string) => void
  toggleCaseSensitive: () => void
  toggleUseRegex: () => void
  goNext: () => void
  goPrev: () => void
  replaceOne: () => void
  replaceAll: () => void
}

/**
 * React hook that bridges search & replace state to the ProseMirror plugin.
 *
 * Manages panel visibility, keyboard shortcuts, and replace operations.
 * Reads/writes the mutable {@link searchConfig} object to communicate
 * with the ProseMirror plugin without dispatching extra transactions.
 */
export function useSearchReplace(
  editor: BlockNoteEditor
): UseSearchReplaceReturn {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQueryState] = useState('')
  const [replaceText, setReplaceTextState] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [matchCount, setMatchCount] = useState(0)
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const isComposingRef = useRef(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getView = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tiptap = (editor as any)._tiptapEditor
    return tiptap?.view ?? null
  }, [editor])

  const triggerRedecorate = useCallback(() => {
    const view = getView()
    if (!view) return
    const tr = view.state.tr.setMeta(searchPluginKey, true)
    view.dispatch(tr)

    // Read back results from config (written by plugin.apply)
    setMatchCount(searchConfig.results.length)
    setCurrentMatchIndex(searchConfig.currentIndex)
  }, [getView])

  const open = useCallback(() => {
    setIsOpen(true)
    searchConfig.isOpen = true

    // Pre-fill with selected text if available
    const view = getView()
    if (view) {
      const { from, to } = view.state.selection
      if (from !== to) {
        const selectedText = view.state.doc.textBetween(from, to)
        searchConfig.query = selectedText
        setQueryState(selectedText)
        triggerRedecorate()
      }
    }

    // Focus search input after render
    queueMicrotask(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    })
  }, [getView, triggerRedecorate])

  const resetConfig = useCallback(() => {
    searchConfig.query = ''
    searchConfig.replaceText = ''
    searchConfig.results = []
    searchConfig.currentIndex = -1
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    searchConfig.isOpen = false
    resetConfig()
    setQueryState('')
    setReplaceTextState('')
    setMatchCount(0)
    setCurrentMatchIndex(-1)
    triggerRedecorate()
  }, [resetConfig, triggerRedecorate])

  const setQuery = useCallback(
    (q: string) => {
      setQueryState(q)
      searchConfig.query = q
      searchConfig.currentIndex = 0
      triggerRedecorate()
    },
    [triggerRedecorate]
  )

  const setReplaceText = useCallback((t: string) => {
    setReplaceTextState(t)
    searchConfig.replaceText = t
  }, [])

  const toggleCaseSensitive = useCallback(() => {
    setCaseSensitive((prev) => {
      const next = !prev
      searchConfig.caseSensitive = next
      searchConfig.currentIndex = 0
      triggerRedecorate()
      return next
    })
  }, [triggerRedecorate])

  const toggleUseRegex = useCallback(() => {
    setUseRegex((prev) => {
      const next = !prev
      searchConfig.useRegex = next
      searchConfig.currentIndex = 0
      triggerRedecorate()
      return next
    })
  }, [triggerRedecorate])

  const scrollToMatch = useCallback(
    (index: number) => {
      const view = getView()
      if (!view || searchConfig.results.length === 0) return
      const match = searchConfig.results[index]
      if (!match) return

      const tr = view.state.tr.setSelection(
        TextSelection.near(view.state.doc.resolve(match.from))
      )
      view.dispatch(tr)

      // After ProseMirror updates the DOM, use native scrollIntoView
      // on the resolved DOM node to scroll the match into view.
      requestAnimationFrame(() => {
        const dom = view.domAtPos(match.from)
        const target =
          dom.node.nodeType === Node.TEXT_NODE
            ? dom.node.parentElement
            : dom.node
        if (target && typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
      })
    },
    [getView]
  )

  const goNext = useCallback(() => {
    if (searchConfig.results.length === 0) return
    searchConfig.currentIndex =
      (searchConfig.currentIndex + 1) % searchConfig.results.length
    triggerRedecorate()
    scrollToMatch(searchConfig.currentIndex)
  }, [triggerRedecorate, scrollToMatch])

  const goPrev = useCallback(() => {
    if (searchConfig.results.length === 0) return
    searchConfig.currentIndex =
      (searchConfig.currentIndex - 1 + searchConfig.results.length) %
      searchConfig.results.length
    triggerRedecorate()
    scrollToMatch(searchConfig.currentIndex)
  }, [triggerRedecorate, scrollToMatch])

  const syncMatchState = useCallback(() => {
    setMatchCount(searchConfig.results.length)
    setCurrentMatchIndex(searchConfig.currentIndex)
  }, [])

  const replaceOne = useCallback(() => {
    const view = getView()
    if (!view) return
    const { results, currentIndex: idx } = searchConfig
    if (results.length === 0 || idx < 0 || idx >= results.length) return

    const match = results[idx]
    const { schema } = view.state
    const content = searchConfig.replaceText
      ? schema.text(searchConfig.replaceText)
      : undefined
    const tr = view.state.tr
      .replaceWith(match.from, match.to, content)
      .setMeta(searchPluginKey, true)
    view.dispatch(tr)

    syncMatchState()
  }, [getView, syncMatchState])

  const replaceAll = useCallback(() => {
    const view = getView()
    if (!view) return
    const { results } = searchConfig
    if (results.length === 0) return

    const { schema } = view.state
    const content = searchConfig.replaceText
      ? schema.text(searchConfig.replaceText)
      : undefined
    let tr = view.state.tr
    for (let i = results.length - 1; i >= 0; i--) {
      const mappedFrom = tr.mapping.map(results[i].from)
      const mappedTo = tr.mapping.map(results[i].to)
      tr = tr.replaceWith(mappedFrom, mappedTo, content)
    }

    tr.setMeta(searchPluginKey, true)
    view.dispatch(tr)

    syncMatchState()
  }, [getView, syncMatchState])

  // Keyboard shortcuts: Cmd/Ctrl+F to open, Escape to close
  useEffect(() => {
    const input = searchInputRef.current
    const onCompositionStart = () => {
      isComposingRef.current = true
    }
    const onCompositionEnd = () => {
      isComposingRef.current = false
    }
    input?.addEventListener('compositionstart', onCompositionStart)
    input?.addEventListener('compositionend', onCompositionEnd)

    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl+F — open search (only when not already in search input)
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        if (!isOpen) {
          open()
        } else {
          searchInputRef.current?.focus()
          searchInputRef.current?.select()
        }
        return
      }

      // Escape — close search
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault()
        close()
        return
      }

      // Enter — next match (when search input focused, not during IME composition)
      if (
        e.key === 'Enter' &&
        isOpen &&
        document.activeElement === searchInputRef.current &&
        !isComposingRef.current
      ) {
        e.preventDefault()
        if (e.shiftKey) {
          goPrev()
        } else {
          goNext()
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      input?.removeEventListener('compositionstart', onCompositionStart)
      input?.removeEventListener('compositionend', onCompositionEnd)
    }
  }, [isOpen, open, close, goNext, goPrev])

  return {
    isOpen,
    query,
    replaceText,
    caseSensitive,
    useRegex,
    matchCount,
    currentMatchIndex,
    searchInputRef,
    open,
    close,
    setQuery,
    setReplaceText,
    toggleCaseSensitive,
    toggleUseRegex,
    goNext,
    goPrev,
    replaceOne,
    replaceAll,
  }
}
