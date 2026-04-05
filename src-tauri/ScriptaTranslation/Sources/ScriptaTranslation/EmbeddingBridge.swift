import Foundation
import NaturalLanguage
import SwiftRs

// MARK: - Availability

/// Checks whether Apple NLEmbedding sentence models are available.
///
/// Performs a quick probe by attempting to load the English sentence
/// embedding model. Returns `true` if at least one model is usable.
@_cdecl("scripta_embedding_available")
public func scriptaEmbeddingAvailable() -> Bool {
    return NLEmbedding.sentenceEmbedding(for: .english) != nil
}

// MARK: - Embedding Generation

/// Generates a sentence embedding vector for the given text in the specified language.
///
/// - Parameters:
///   - text: The input text to embed.
///   - language: BCP-47 language code (e.g. `"en"`, `"ja"`).
/// - Returns: JSON array string `"[0.123,-0.456,...]"` on success,
///   or `"ERROR:<message>"` on failure.
/// - Note: Currently unused from Rust (auto-detect variant is preferred).
///   Kept for future use in semantic search where explicit language control is needed.
@_cdecl("scripta_generate_embedding")
public func scriptaGenerateEmbedding(text: SRString, language: SRString) -> SRString {
    let inputText = text.toString()
    let langCode = language.toString()

    guard !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        return SRString("ERROR:Empty text")
    }

    let nlLanguage = NLLanguage(langCode)
    guard let embedding = NLEmbedding.sentenceEmbedding(for: nlLanguage) else {
        return SRString("ERROR:No sentence embedding model for language: \(langCode)")
    }

    guard let vector = embedding.vector(for: inputText) else {
        return SRString("ERROR:Failed to generate vector for text")
    }

    let json = "[" + vector.map { String($0) }.joined(separator: ",") + "]"
    return SRString(json)
}

/// Auto-detects language and generates a sentence embedding.
///
/// Uses `NLLanguageRecognizer` to identify the dominant language,
/// then loads the corresponding `NLEmbedding` sentence model.
///
/// - Parameter text: The input text to embed.
/// - Returns: `"<lang_code>\0[0.123,...]"` on success (language + NUL + JSON vector),
///   or `"ERROR:<message>"` on failure.
@_cdecl("scripta_generate_embedding_auto")
public func scriptaGenerateEmbeddingAuto(text: SRString) -> SRString {
    let inputText = text.toString()

    guard !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        return SRString("ERROR:Empty text")
    }

    let recognizer = NLLanguageRecognizer()
    recognizer.processString(inputText)
    guard let detectedLang = recognizer.dominantLanguage else {
        return SRString("ERROR:Could not detect language")
    }

    guard let embedding = NLEmbedding.sentenceEmbedding(for: detectedLang) else {
        return SRString("ERROR:No sentence embedding model for language: \(detectedLang.rawValue)")
    }

    guard let vector = embedding.vector(for: inputText) else {
        return SRString("ERROR:Failed to generate vector for text")
    }

    let json = "[" + vector.map { String($0) }.joined(separator: ",") + "]"
    return SRString("\(detectedLang.rawValue)\0\(json)")
}
