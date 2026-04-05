//! Sentence embedding generation via Apple NLEmbedding.
//!
//! This module generates vector embeddings for note summaries and stores
//! them in the `note_embeddings` table for future semantic search.
//!
//! Embeddings are generated as a fire-and-forget side-effect of
//! summarization. Errors are silently ignored so that summarization
//! always succeeds regardless of embedding outcome.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::Mutex;

#[cfg(target_os = "macos")]
use swift_rs::{swift, Bool, SRString};

/// In-memory cache for the embedding availability check result.
///
/// Managed as Tauri state so the expensive Swift FFI probe
/// (`scripta_embedding_available`) runs at most once per session.
/// Subsequent calls to [`is_embedding_available`] return the cached value.
pub struct EmbeddingAvailable(pub Mutex<Option<bool>>);

// --- Swift FFI declarations (macOS only) -----------------------------------

#[cfg(target_os = "macos")]
swift!(fn scripta_embedding_available() -> Bool);

#[cfg(target_os = "macos")]
swift!(fn scripta_generate_embedding_auto(text: &SRString) -> SRString);

// --- Tauri Commands --------------------------------------------------------

/// Returns `true` when Apple NLEmbedding sentence models are available.
///
/// The result is cached after the first call so the underlying Swift FFI
/// probe runs at most once per application session.
///
/// # Arguments
///
/// * `state` - Managed [`EmbeddingAvailable`] cache injected by Tauri.
///
/// # Returns
///
/// `true` if at least one NLEmbedding sentence model can be loaded,
/// `false` otherwise. Always returns `false` on non-macOS platforms.
#[tauri::command]
pub fn is_embedding_available(state: tauri::State<EmbeddingAvailable>) -> bool {
    let mut cached = state.0.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(available) = *cached {
        return available;
    }

    #[cfg(target_os = "macos")]
    {
        let available: bool = unsafe { scripta_embedding_available() };
        *cached = Some(available);
        available
    }

    #[cfg(not(target_os = "macos"))]
    {
        *cached = Some(false);
        false
    }
}

// --- Core Embedding Logic --------------------------------------------------

/// Generates a sentence embedding for `summary_text` and stores it in
/// the `note_embeddings` table.
///
/// This is the primary public API of this module. Called from
/// [`summarize_note`](crate::summarization::summarize_note) after a summary
/// is persisted.
///
/// If the detected language lacks an NLEmbedding model, the text is
/// automatically translated to English via
/// [`translate_plain_sync`](crate::translation::translate_plain_sync)
/// before embedding, ensuring all vectors share the same English vector
/// space for cross-language comparability.
///
/// The caller silently ignores errors so that embedding failures never
/// block summarization.
///
/// # Arguments
///
/// * `db` - Managed database state for reading/writing the `note_embeddings` table.
/// * `note_id` - The UUID of the note to associate the embedding with.
/// * `summary_text` - The plain-text summary to embed.
///
/// # Returns
///
/// `Ok(())` on success.
///
/// # Errors
///
/// Returns an error if:
/// - The database lock is poisoned.
/// - The Swift FFI call fails and the translation fallback also fails.
/// - The embedding cannot be persisted to SQLite.
pub fn generate_and_store_embedding(
    db: &tauri::State<crate::db::DbState>,
    note_id: &str,
    summary_text: &str,
) -> Result<(), String> {
    let summary_hash = compute_hash(summary_text);

    // Check if embedding is already up-to-date (short lock scope).
    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let existing_hash: Option<String> = conn
            .query_row(
                "SELECT summary_hash FROM note_embeddings WHERE note_id = ?1",
                [note_id],
                |row| row.get(0),
            )
            .ok();

        if existing_hash.as_deref() == Some(&summary_hash) {
            return Ok(());
        }
    }
    // Lock released here.

    // Call Swift FFI (blocking but fast, ~5ms).
    // TODO: Consider wrapping in spawn_blocking when called from async context,
    // especially for the translation fallback path which may take longer.
    let result = call_generate_embedding_auto(summary_text);

    // If the detected language has no sentence embedding model, translate to
    // English and retry.  All embeddings end up in the English vector space so
    // they remain comparable across languages.
    let (language, vector) = match result {
        Ok(pair) => pair,
        Err(ref e) if e.contains("No sentence embedding model") => {
            #[cfg(target_os = "macos")]
            {
                let english = crate::translation::translate_plain_sync(summary_text, "auto", "en")
                    .map_err(|te| format!("Translation fallback failed: {te}"))?;
                call_generate_embedding_auto(&english)?
            }
            #[cfg(not(target_os = "macos"))]
            {
                return Err(e.clone());
            }
        }
        Err(e) => return Err(e),
    };

    // Serialize vector as raw f64 little-endian bytes.
    let dimensions = vector.len();
    let bytes: Vec<u8> = vector.iter().flat_map(|&f| f.to_le_bytes()).collect();

    // Persist (short lock scope).
    let now = chrono::Utc::now().to_rfc3339();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO note_embeddings (note_id, embedding, language, dimensions, summary_hash, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(note_id) DO UPDATE SET
             embedding = ?2, language = ?3, dimensions = ?4, summary_hash = ?5, updated_at = ?6",
        rusqlite::params![note_id, bytes, language, dimensions as i64, summary_hash, now],
    )
    .map_err(|e| format!("Failed to store embedding: {e}"))?;

    Ok(())
}

// --- Swift FFI Wrappers ---------------------------------------------------

/// Calls the Swift `scripta_generate_embedding_auto` FFI and parses the
/// NUL-delimited response.
///
/// # Arguments
///
/// * `text` - The input text to embed.
///
/// # Returns
///
/// A tuple of `(language_code, vector)` where `language_code` is a BCP-47
/// string and `vector` is the embedding as `Vec<f64>`.
///
/// # Errors
///
/// Returns an error if the Swift side returns an `"ERROR:"`-prefixed string,
/// the response format is invalid, or the parsed vector is empty.
#[cfg(target_os = "macos")]
fn call_generate_embedding_auto(text: &str) -> Result<(String, Vec<f64>), String> {
    let input = SRString::from(text);
    let result = unsafe { scripta_generate_embedding_auto(&input) };
    let s = result.to_string();

    if let Some(err) = s.strip_prefix("ERROR:") {
        return Err(err.to_string());
    }

    // Parse "<lang>\0<json_vector>"
    let parts: Vec<&str> = s.splitn(2, '\0').collect();
    if parts.len() != 2 {
        return Err("Invalid embedding response format".to_string());
    }

    let language = parts[0].to_string();
    let vector: Vec<f64> = serde_json::from_str(parts[1])
        .map_err(|e| format!("Failed to parse embedding vector: {e}"))?;

    if vector.is_empty() {
        return Err("Empty embedding vector".to_string());
    }

    Ok((language, vector))
}

/// Stub for non-macOS platforms — always returns an error.
#[cfg(not(target_os = "macos"))]
fn call_generate_embedding_auto(_text: &str) -> Result<(String, Vec<f64>), String> {
    Err("Embedding requires macOS".to_string())
}

// --- Helpers ---------------------------------------------------------------

/// Computes a fast hash of text for cache invalidation.
fn compute_hash(text: &str) -> String {
    let mut hasher = DefaultHasher::new();
    text.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}
