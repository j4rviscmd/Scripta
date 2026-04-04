import Foundation
import NaturalLanguage
import SwiftRs
@preconcurrency import Translation

/// Checks whether the Apple Translation framework is available.
@_cdecl("scripta_translation_available")
public func scriptaTranslationAvailable() -> Bool {
    if #available(macOS 26.0, *) {
        return true
    }
    return false
}

/// Detects the dominant language of the given text.
///
/// Returns the BCP-47 base code (e.g. "en", "ja") or empty string on failure.
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
/// Output: `[{"code":"en","name":"English"}, ...]`
@_cdecl("scripta_get_supported_languages")
public func scriptaGetSupportedLanguages() -> SRString {
    guard #available(macOS 26.0, *) else {
        return SRString("[]")
    }

    nonisolated(unsafe) var result = "[]"
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
        result = "[\(entries.joined(separator: ","))]"
        semaphore.signal()
    }

    let waitResult = semaphore.wait(timeout: .now() + 10)
    if waitResult == .timedOut {
        return SRString("[]")
    }
    return SRString(result)
}

/// Checks whether a language pair is installed, supported (not downloaded), or unsupported.
///
/// Returns: "installed", "supported", or "unsupported"
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

    nonisolated(unsafe) var result = "unsupported"
    let semaphore = DispatchSemaphore(value: 0)

    Task { @MainActor in
        let availability = LanguageAvailability()
        let status = await availability.status(from: sourceLanguage, to: targetLanguage)
        switch status {
        case .installed:
            result = "installed"
        case .supported:
            result = "supported"
        case .unsupported:
            result = "unsupported"
        @unknown default:
            result = "unsupported"
        }
        semaphore.signal()
    }

    let waitResult = semaphore.wait(timeout: .now() + 10)
    if waitResult == .timedOut {
        return SRString("unsupported")
    }
    return SRString(result)
}

/// Batch translates texts joined by null bytes.
///
/// Input: texts separated by `\0`
/// Output: translated texts separated by `\0`, or `ERROR:<message>` on failure
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

    nonisolated(unsafe) var translatedTexts: [String] = []
    nonisolated(unsafe) var errorMessage: String? = nil
    let semaphore = DispatchSemaphore(value: 0)

    nonisolated(unsafe) let requests = inputTexts.map {
        TranslationSession.Request(sourceText: $0)
    }

    Task { @MainActor in
        do {
            // Only block on .unsupported; skip the status check otherwise.
            // LanguageAvailability.status() has a cold-start issue where it
            // returns .supported instead of .installed on first access.
            // Letting TranslationSession handle the actual availability check
            // avoids this false negative.
            let availability = LanguageAvailability()
            let status = await availability.status(from: sourceLanguage, to: targetLanguage)
            if case .unsupported = status {
                errorMessage = "ERROR:Language pair (\(sourceLangCode) → \(targetLangCode)) is not supported."
                semaphore.signal()
                return
            }

            let session = TranslationSession(
                installedSource: sourceLanguage,
                target: targetLanguage
            )
            let responses = try await session.translations(from: requests)
            translatedTexts = responses.map { $0.targetText }
        } catch {
            errorMessage = "ERROR:\(error.localizedDescription)"
        }
        semaphore.signal()
    }

    let waitResult = semaphore.wait(timeout: .now() + 60)
    if waitResult == .timedOut {
        return SRString("ERROR:Translation timed out")
    }
    if let err = errorMessage {
        return SRString(err)
    }

    return SRString(translatedTexts.joined(separator: "\0"))
}

/// Translates a single text string.
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

    nonisolated(unsafe) var translatedText: String = ""
    nonisolated(unsafe) var errorMessage: String? = nil
    let semaphore = DispatchSemaphore(value: 0)

    Task { @MainActor in
        do {
            // Only block on .unsupported; skip the status check otherwise.
            // LanguageAvailability.status() has a cold-start issue where it
            // returns .supported instead of .installed on first access.
            let availability = LanguageAvailability()
            let status = await availability.status(from: sourceLanguage, to: targetLanguage)
            if case .unsupported = status {
                errorMessage = "ERROR:Language pair (\(sourceLangCode) → \(targetLangCode)) is not supported."
                semaphore.signal()
                return
            }

            let session = TranslationSession(
                installedSource: sourceLanguage,
                target: targetLanguage
            )
            let responses = try await session.translations(
                from: [TranslationSession.Request(sourceText: inputText)]
            )
            if let first = responses.first {
                translatedText = first.targetText
            }
        } catch {
            errorMessage = "ERROR:\(error.localizedDescription)"
        }
        semaphore.signal()
    }

    let waitResult = semaphore.wait(timeout: .now() + 60)
    if waitResult == .timedOut {
        return SRString("ERROR:Translation timed out")
    }
    if let err = errorMessage {
        return SRString(err)
    }

    return SRString(translatedText)
}
