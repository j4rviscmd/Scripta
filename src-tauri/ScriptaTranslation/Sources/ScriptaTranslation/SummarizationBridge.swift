import Foundation
import SwiftRs

#if canImport(FoundationModels)
@preconcurrency import FoundationModels
#endif

// MARK: - Availability

/// Checks whether Apple FoundationModels (Apple Intelligence) is available.
///
/// - Returns: `true` if the current system is macOS 26.0 or later,
///   `false` otherwise.
@_cdecl("scripta_summarization_available")
public func scriptaSummarizationAvailable() -> Bool {
    if #available(macOS 26.0, *) {
        return true
    }
    return false
}

// MARK: - Summarization

/// Summarizes a single text chunk using the on-device language model.
///
/// Uses `LanguageModelSession` from FoundationModels to generate a concise
/// summary. The calling thread is blocked for up to **120 seconds** while
/// the async inference completes.
///
/// - Parameter text: The text to summarize.
/// - Returns: The summarized text, or `"ERROR:<message>"` on failure.
@_cdecl("scripta_summarize_text")
public func scriptaSummarizeText(text: SRString) -> SRString {
    guard #available(macOS 26.0, *) else {
        return SRString("ERROR:macOS 26.0+ required for summarization")
    }

    let inputText = text.toString()
    if inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return SRString("ERROR:Empty text")
    }

    let result = ThreadSafeBox("")
    let errorMessage = ThreadSafeBox<String?>(nil)
    let semaphore = DispatchSemaphore(value: 0)

    Task.detached {
        do {
            guard #available(macOS 26.0, *) else {
                errorMessage.value = "ERROR:macOS 26.0+ required"
                semaphore.signal()
                return
            }
            let session = LanguageModelSession()
            let prompt = """
            You are a note-taking assistant. The user wrote the following personal note. \
            Summarize the key points proportionally — longer notes deserve more detailed summaries. \
            Aim for roughly 10-20% of the original length. \
            Respond in the same language as the note. \
            Output only the summary:

            \(inputText)
            """
            let response = try await session.respond(to: prompt)
            result.value = String(response.content)
        } catch {
            errorMessage.value = "ERROR:\(error.localizedDescription)"
        }
        semaphore.signal()
    }

    let waitResult = semaphore.wait(timeout: .now() + 120)
    if waitResult == .timedOut {
        return SRString("ERROR:Summarization timed out")
    }
    if let err = errorMessage.value {
        return SRString(err)
    }
    return SRString(result.value)
}

/// Combines multiple partial summaries into a single consolidated summary.
///
/// Uses a distinct prompt optimized for merging summaries rather than
/// summarizing raw content.
///
/// - Parameter text: Multiple partial summaries joined together.
/// - Returns: A single consolidated summary, or `"ERROR:<message>"` on failure.
@_cdecl("scripta_summarize_combined")
public func scriptaSummarizeCombined(text: SRString) -> SRString {
    guard #available(macOS 26.0, *) else {
        return SRString("ERROR:macOS 26.0+ required for summarization")
    }

    let inputText = text.toString()
    let result = ThreadSafeBox("")
    let errorMessage = ThreadSafeBox<String?>(nil)
    let semaphore = DispatchSemaphore(value: 0)

    Task.detached {
        do {
            guard #available(macOS 26.0, *) else {
                errorMessage.value = "ERROR:macOS 26.0+ required"
                semaphore.signal()
                return
            }
            let session = LanguageModelSession()
            let prompt = """
            You are a note-taking assistant. Merge the following partial summaries into a single \
            coherent summary that preserves all key points. Do not over-compress — keep important details. \
            Respond in the same language. Output only the summary:

            \(inputText)
            """
            let response = try await session.respond(to: prompt)
            result.value = String(response.content)
        } catch {
            errorMessage.value = "ERROR:\(error.localizedDescription)"
        }
        semaphore.signal()
    }

    let waitResult = semaphore.wait(timeout: .now() + 120)
    if waitResult == .timedOut {
        return SRString("ERROR:Summarization timed out")
    }
    if let err = errorMessage.value {
        return SRString(err)
    }
    return SRString(result.value)
}
