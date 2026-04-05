import { Channel, invoke } from '@tauri-apps/api/core'

/** A single translated block returned from a streaming chunk. */
export interface TranslatedBlock {
  blockIndex: number
  translatedText: string
}

/** Events streamed from the backend during parallel translation. */
export type TranslationStreamEvent =
  | {
      event: 'started'
      data: {
        totalChunks: number
        totalBlocks: number
        paramMap: string[]
        paramCodeCount: number
        paramTcCount: number
        paramBcCount: number
      }
    }
  | {
      event: 'chunkCompleted'
      data: {
        chunkIndex: number
        totalChunks: number
        startIndex: number
        translatedTexts: string[]
      }
    }
  | { event: 'finished'; data: { totalTranslated: number } }
  | { event: 'error'; data: { chunkIndex: number; message: string } }

/**
 * Translates BlockNote content JSON in parallel chunks with streaming
 * results delivered via a Tauri {@link Channel}.
 *
 * @param content   - BlockNote content JSON string.
 * @param sourceLang - BCP-47 source language tag or `"auto"`.
 * @param targetLang - BCP-47 target language tag.
 * @param onEvent   - Callback invoked for each streaming event.
 */
export async function translateBlocksStreaming(
  content: string,
  sourceLang: string,
  targetLang: string,
  onEvent: (event: TranslationStreamEvent) => void
): Promise<void> {
  const channel = new Channel<TranslationStreamEvent>()
  channel.onmessage = onEvent
  await invoke('translate_blocks_streaming', {
    content,
    sourceLang,
    targetLang,
    onEvent: channel,
  })
}
