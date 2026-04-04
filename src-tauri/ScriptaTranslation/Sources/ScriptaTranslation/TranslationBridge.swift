import Foundation
import NaturalLanguage
import SwiftRs
@preconcurrency import Translation

/// A thread-safe wrapper for sharing mutable state across concurrency boundaries.
private final class ThreadSafeBox<T>: @unchecked Sendable {
    private var _value: T
    private let lock = NSLock()

    init(_ value: T) {
        self._value = value
    }

    var value: T {
        get { lock.withLock { _value } }
        set { lock.withLock { _value = newValue } }
    }
}

/// Checks whether the Apple Translation framework is available.
///
/// - Returns: `true` if the current system is macOS 26.0 or later,
///   `false` otherwise.
@_cdecl("scripta_translation_available")
public func scriptaTranslationAvailable() -> Bool {
    if #available(macOS 26.0, *) {
        return true
    }
    return false
}

/// Detects the dominant language of the given text.
///
/// Uses `NLLanguageRecognizer` to analyse the input string and identify
/// its most likely language.
///
/// Returns the BCP-47 base code (e.g. "en", "ja") or empty string on failure.
///
/// - Parameter text: The input string to analyse.
/// - Returns: The BCP-47 base language code of the detected language
///   (e.g. `"en"`, `"ja"`), or an empty string if detection fails.
@_cdecl("scripta_detect_language")
public func scriptaDetectLanguage(text: SRString) -> SRString {
    let recognizer = NLLanguageRecognizer()
    recognizer.processString(text.toString())
    guard let detected = recognizer.dominantLanguage else {
        return SRString("")
    }
    return SRString(detected.rawValue)
}

/// Returns the list of supported translation languages as JSON.
///
/// Queries `LanguageAvailability` on a detached `Task` to avoid a
/// `@MainActor` deadlock when called from the main thread.
/// The calling thread is blocked for up to **10 seconds** awaiting the result.
///
/// Each element in the returned JSON array has the following shape:
///
/// ```json
/// {"code": "en-Latn-US", "name": "English (US)"}
/// ```
///
/// Output: `[{"code":"en","name":"English"}, ...]`
///
/// - Returns: A JSON array string of language objects, or `"[]"` when
///   the system is below macOS 26.0 or the query times out.
/// - Note: Requires macOS 26.0 or later; returns `"[]"` on older systems.
@_cdecl("scripta_get_supported_languages")
public func scriptaGetSupportedLanguages() -> SRString {
    guard #available(macOS 26.0, *) else {
        return SRString("[]")
    }

    let result = ThreadSafeBox("[]")
    let semaphore = DispatchSemaphore(value: 0)

    // Use a detached task to avoid @MainActor deadlock when called from main thread
    Task.detached {
        let availability = LanguageAvailability()
        let languages = await availability.supportedLanguages
        let entries = languages.map { lang -> String in
            // Build full BCP-47 identifier: language + script + region
            let baseCode = lang.languageCode?.identifier ?? ""
            let script = lang.script?.identifier ?? ""
            let region = lang.region?.identifier ?? ""

            var fullCode = baseCode
            if !script.isEmpty { fullCode += "-\(script)" }
            if !region.isEmpty { fullCode += "-\(region)" }

            // Descriptive name: "English (US)", "Chinese (Hant)", etc.
            var name = Locale.current.localizedString(forLanguageCode: baseCode) ?? baseCode
            if !region.isEmpty { name += " (\(region))" }

            return "{\"code\":\"\(fullCode)\",\"name\":\"\(name.replacingOccurrences(of: "\"", with: "\\\""))\"}"
        }
        result.value = "[\(entries.joined(separator: ","))]"
        semaphore.signal()
    }

    let waitResult = semaphore.wait(timeout: .now() + 10)
    if waitResult == .timedOut {
        return SRString("[]")
    }
    return SRString(result.value)
}

/// Checks whether a language pair is installed, supported (not downloaded), or unsupported.
///
/// The check is performed asynchronously on the `@MainActor` and the
/// calling thread is blocked for up to **10 seconds** awaiting the result.
///
/// Returns: "installed", "supported", or "unsupported"
///
/// - Parameters:
///   - sourceLang: BCP-47 identifier of the source language (e.g. `"en"`, `"ja"`).
///   - targetLang: BCP-47 identifier of the target language.
/// - Returns: One of the following string values:
///   - `"installed"` — the language pair model is downloaded and ready.
///   - `"supported"` — the pair is available but not yet downloaded.
///   - `"unsupported"` — the pair cannot be used for translation.
/// - Note: Returns `"unsupported"` on macOS versions earlier than 26.0
///   or if the availability query times out.
@_cdecl("scripta_check_language_pair_status")
public func scriptaCheckLanguagePairStatus(
    sourceLang: SRString,
    targetLang: SRString
) -> SRString {
    guard #available(macOS 26.0, *) else {
        return SRString("unsupported")
    }

    let sourceLanguage = Locale.Language(identifier: sourceLang.toString())
    let targetLanguage = Locale.Language(identifier: targetLang.toString())

    let result = ThreadSafeBox("unsupported")
    let semaphore = DispatchSemaphore(value: 0)

    Task { @MainActor in
        let availability = LanguageAvailability()
        let status = await availability.status(from: sourceLanguage, to: targetLanguage)
        switch status {
        case .installed:
            result.value = "installed"
        case .supported:
            result.value = "supported"
        case .unsupported:
            result.value = "unsupported"
        @unknown default:
            result.value = "unsupported"
        }
        semaphore.signal()
    }

    let waitResult = semaphore.wait(timeout: .now() + 10)
    if waitResult == .timedOut {
        return SRString("unsupported")
    }
    return SRString(result.value)
}

/// Batch translates texts joined by null bytes.
///
/// The input string is split on `\0` to produce individual translation
/// segments. When `sourceLang` is `"auto"`, `NLLanguageRecognizer` detects
/// the dominant language from the concatenated segments.
///
/// Same-language pairs (e.g. `"en"` → `"en-Latn-US"`) are rejected early
/// by comparing the base language codes of source and target.
/// The calling thread is blocked for up to **60 seconds** while the async
/// `TranslationSession` completes.
///
/// Input: texts separated by `\0`
/// Output: translated texts separated by `\0`, or `ERROR:<message>` on failure
///
/// - Parameters:
///   - text: Null-byte (`\0`) separated list of strings to translate.
///   - sourceLang: BCP-47 source language identifier, or `"auto"` to
///     enable automatic language detection using `NLLanguageRecognizer`.
///   - targetLang: BCP-47 target language identifier.
/// - Returns: Null-byte (`\0`) separated translated strings in the same
///   order as the input segments, or an `"ERROR:<message>"` string on failure.
/// - Note: Requires macOS 26.0 or later.
@_cdecl("scripta_translate_batch")
public func scriptaTranslateBatch(
    text: SRString,
    sourceLang: SRString,
    targetLang: SRString
) -> SRString {
    let inputText = text.toString()
    let inputTexts = inputText.components(separatedBy: "\0")

    guard #available(macOS 26.0, *), !inputTexts.isEmpty else {
        return SRString("ERROR:macOS 26.0+ required for translation")
    }

    let targetLanguage = Locale.Language(identifier: targetLang.toString())
    let targetLangCode = targetLang.toString()

    // Resolve source language: auto-detect or explicit
    let sourceLanguage: Locale.Language
    let sourceLangCode: String
    if sourceLang.toString() == "auto" {
        let recognizer = NLLanguageRecognizer()
        recognizer.processString(inputTexts.joined(separator: " "))
        guard let detected = recognizer.dominantLanguage else {
            return SRString("ERROR:Could not detect source language")
        }
        sourceLanguage = Locale.Language(identifier: detected.rawValue)
        sourceLangCode = detected.rawValue
    } else {
        sourceLanguage = Locale.Language(identifier: sourceLang.toString())
        sourceLangCode = sourceLang.toString()
    }

    // Reject same-language translation (e.g. "en" → "en-Latn-US")
    let sourceBase = sourceLanguage.languageCode?.identifier ?? sourceLangCode
    let targetBase = targetLanguage.languageCode?.identifier ?? targetLangCode
    if sourceBase == targetBase {
        return SRString("ERROR:Source and target languages are the same (\(sourceBase)). Choose a different target language.")
    }

    let translatedTexts = ThreadSafeBox<[String]>([])
    let errorMessage = ThreadSafeBox<String?>(nil)
    let semaphore = DispatchSemaphore(value: 0)

    Task { @MainActor in
        do {
            guard #available(macOS 26.0, *) else {
                errorMessage.value = "ERROR:macOS 26.0+ required for translation"
                semaphore.signal()
                return
            }
            // Only block on .unsupported; skip the status check otherwise.
            // LanguageAvailability.status() has a cold-start issue where it
            // returns .supported instead of .installed on first access.
            // Letting TranslationSession handle the actual availability check
            // avoids this false negative.
            let availability = LanguageAvailability()
            let status = await availability.status(from: sourceLanguage, to: targetLanguage)
            if case .unsupported = status {
                errorMessage.value = "ERROR:Language pair (\(sourceLangCode) → \(targetLangCode)) is not supported."
                semaphore.signal()
                return
            }

            let session = TranslationSession(
                installedSource: sourceLanguage,
                target: targetLanguage
            )
            var results: [String] = []
            for text in inputTexts {
                let response = try await session.translate(text)
                results.append(response.targetText)
            }
            translatedTexts.value = results
        } catch {
            errorMessage.value = "ERROR:\(error.localizedDescription)"
        }
        semaphore.signal()
    }

    let waitResult = semaphore.wait(timeout: .now() + 60)
    if waitResult == .timedOut {
        return SRString("ERROR:Translation timed out")
    }
    if let err = errorMessage.value {
        return SRString(err)
    }

    return SRString(translatedTexts.value.joined(separator: "\0"))
}

/// Translates a single text string.
///
/// When `sourceLang` is `"auto"`, `NLLanguageRecognizer` is used to detect
/// the dominant language of `text`. Same-language pairs are rejected by
/// comparing the base language codes of source and target
/// (e.g. `"en"` → `"en-Latn-US"` is rejected).
///
/// The calling thread is blocked for up to **60 seconds** while the async
/// `TranslationSession` completes.
///
/// - Parameters:
///   - text: The source string to translate.
///   - sourceLang: BCP-47 source language identifier, or `"auto"` to
///     enable automatic language detection using `NLLanguageRecognizer`.
///   - targetLang: BCP-47 target language identifier.
/// - Returns: The translated string, or an `"ERROR:<message>"` string
///   on failure (unsupported pair, detection failure, timeout, etc.).
/// - Note: Requires macOS 26.0 or later.
@_cdecl("scripta_translate_single")
public func scriptaTranslateSingle(
    text: SRString,
    sourceLang: SRString,
    targetLang: SRString
) -> SRString {
    guard #available(macOS 26.0, *) else {
        return SRString("ERROR:macOS 26.0+ required for translation")
    }

    let targetLanguage = Locale.Language(identifier: targetLang.toString())
    let targetLangCode = targetLang.toString()
    let inputText = text.toString()

    // Resolve source language: auto-detect or explicit
    let sourceLanguage: Locale.Language
    let sourceLangCode: String
    if sourceLang.toString() == "auto" {
        let recognizer = NLLanguageRecognizer()
        recognizer.processString(inputText)
        guard let detected = recognizer.dominantLanguage else {
            return SRString("ERROR:Could not detect source language")
        }
        sourceLanguage = Locale.Language(identifier: detected.rawValue)
        sourceLangCode = detected.rawValue
    } else {
        sourceLanguage = Locale.Language(identifier: sourceLang.toString())
        sourceLangCode = sourceLang.toString()
    }

    // Reject same-language translation (e.g. "en" → "en-Latn-US")
    let sourceBase = sourceLanguage.languageCode?.identifier ?? sourceLangCode
    let targetBase = targetLanguage.languageCode?.identifier ?? targetLangCode
    if sourceBase == targetBase {
        return SRString("ERROR:Source and target languages are the same (\(sourceBase)). Choose a different target language.")
    }

    let translatedText = ThreadSafeBox("")
    let errorMessage = ThreadSafeBox<String?>(nil)
    let semaphore = DispatchSemaphore(value: 0)

    Task { @MainActor in
        do {
            guard #available(macOS 26.0, *) else {
                errorMessage.value = "ERROR:macOS 26.0+ required for translation"
                semaphore.signal()
                return
            }
            // Only block on .unsupported; skip the status check otherwise.
            // LanguageAvailability.status() has a cold-start issue where it
            // returns .supported instead of .installed on first access.
            let availability = LanguageAvailability()
            let status = await availability.status(from: sourceLanguage, to: targetLanguage)
            if case .unsupported = status {
                errorMessage.value = "ERROR:Language pair (\(sourceLangCode) → \(targetLangCode)) is not supported."
                semaphore.signal()
                return
            }

            let session = TranslationSession(
                installedSource: sourceLanguage,
                target: targetLanguage
            )
            let response = try await session.translate(inputText)
            translatedText.value = response.targetText
        } catch {
            errorMessage.value = "ERROR:\(error.localizedDescription)"
        }
        semaphore.signal()
    }

    let waitResult = semaphore.wait(timeout: .now() + 60)
    if waitResult == .timedOut {
        return SRString("ERROR:Translation timed out")
    }
    if let err = errorMessage.value {
        return SRString(err)
    }

    return SRString(translatedText.value)
}
