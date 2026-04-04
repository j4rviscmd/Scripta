use crate::db::DbState;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::Mutex;

#[cfg(target_os = "macos")]
use swift_rs::{swift, Bool, SRString};

/// In-memory cache for summarization availability check.
pub struct SummarizationAvailable(pub Mutex<Option<bool>>);

// --- Swift FFI declarations (macOS only) -----------------------------------

#[cfg(target_os = "macos")]
swift!(fn scripta_summarization_available() -> Bool);

#[cfg(target_os = "macos")]
swift!(fn scripta_summarize_text(text: &SRString) -> SRString);

#[cfg(target_os = "macos")]
swift!(fn scripta_summarize_combined(text: &SRString) -> SRString);

// --- Constants -------------------------------------------------------------

/// Maximum characters per chunk sent to the language model.
const CHUNK_SIZE_CHARS: usize = 4000;

/// Minimum characters required for summarization.
const MIN_CHARS: usize = 100;

/// Maximum recursion depth to prevent runaway loops.
const MAX_RECURSION_DEPTH: usize = 10;

/// Block types whose text content should be included in the summary.
const SUMMARIZABLE_BLOCK_TYPES: &[&str] = &[
    "heading",
    "paragraph",
    "bulletListItem",
    "numberedListItem",
    "checkListItem",
];

// --- Tauri Commands --------------------------------------------------------

/// Returns `true` when Apple Intelligence summarization is available (macOS 26+).
#[tauri::command]
pub fn is_summarization_available(state: tauri::State<SummarizationAvailable>) -> bool {
    let mut cached = state.0.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(available) = *cached {
        return available;
    }

    #[cfg(target_os = "macos")]
    {
        let available: bool = unsafe { scripta_summarization_available() };
        *cached = Some(available);
        available
    }

    #[cfg(not(target_os = "macos"))]
    {
        *cached = Some(false);
        false
    }
}

/// Retrieves a cached summary for the given note if still fresh.
///
/// Returns `Ok(Some(summary))` when a cached summary exists and its content
/// hash matches the current note content. Returns `Ok(None)` when the cache
/// is stale or missing.
#[tauri::command]
pub fn get_note_summary(
    db: tauri::State<DbState>,
    note_id: String,
) -> Result<Option<String>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let current_content: String = conn
        .query_row("SELECT content FROM notes WHERE id = ?1", [&note_id], |r| {
            r.get(0)
        })
        .map_err(|e| e.to_string())?;
    let current_hash = compute_hash(&extract_plain_text(&current_content));

    let result = conn.query_row(
        "SELECT summary, content_hash FROM note_summaries WHERE note_id = ?1",
        [&note_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    );

    match result {
        Ok((summary, stored_hash)) if stored_hash == current_hash => Ok(Some(summary)),
        _ => Ok(None),
    }
}

/// Summarizes a note's content using recursive chunk summarization.
///
/// The result is automatically cached in the `note_summaries` table.
/// If a cached summary exists with a matching content hash, it is returned
/// without invoking the language model.
///
/// Runs heavy AI inference on a blocking thread so the Tauri event loop
/// remains responsive.
#[tauri::command]
pub async fn summarize_note(
    db: tauri::State<'_, DbState>,
    note_id: String,
) -> Result<String, String> {
    // 1. Load note content (quick DB read)
    let content = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        conn.query_row("SELECT content FROM notes WHERE id = ?1", [&note_id], |r| {
            r.get::<_, String>(0)
        })
        .map_err(|e| format!("Note not found: {e}"))?
    };

    // 2. Extract plain text from BlockNote JSON
    let plain_text = extract_plain_text(&content);

    // 3. Minimum length check
    if plain_text.len() < MIN_CHARS {
        return Err("ERR::CONTENT_TOO_SHORT".to_string());
    }

    // 4. Check cache freshness
    let content_hash = compute_hash(&plain_text);
    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let cached = conn.query_row(
            "SELECT summary, content_hash FROM note_summaries WHERE note_id = ?1",
            [&note_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        );
        if let Ok((summary, hash)) = cached {
            if hash == content_hash {
                return Ok(summary);
            }
        }
    }

    // 5. Run recursive summarization on a blocking thread so we don't freeze
    //    the Tauri event loop during AI inference.
    let note_id_clone = note_id.clone();
    let plain_text_clone = plain_text;
    let content_hash_clone = content_hash.clone();
    let summary = tokio::task::spawn_blocking(move || recursive_summarize(&plain_text_clone))
        .await
        .map_err(|e| format!("Task join error: {e}"))??;

    // 6. Persist result
    {
        let now = chrono::Utc::now().to_rfc3339();
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO note_summaries (note_id, summary, content_hash, updated_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(note_id) DO UPDATE SET summary = ?2, content_hash = ?3, updated_at = ?4",
            rusqlite::params![note_id_clone, summary, content_hash_clone, now],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(summary)
}

// --- Recursive Summarization Algorithm ------------------------------------

/// Recursively summarizes text by chunking and re-summarizing until the
/// result fits within a single chunk.
///
/// Delegates to [`recursive_summarize_inner`] starting at depth 0.
fn recursive_summarize(text: &str) -> Result<String, String> {
    recursive_summarize_inner(text, 0)
}

/// Inner recursive implementation with depth tracking.
///
/// **Base case**: if the text fits within [`CHUNK_SIZE_CHARS`], summarize it
/// directly via [`call_summarize_text`].
///
/// **Recursive case**: split the text at sentence boundaries, summarize each
/// chunk independently, then combine the partial summaries and recurse.
///
/// When `depth` exceeds [`MAX_RECURSION_DEPTH`], the text is forcibly truncated
/// and summarized with [`call_summarize_combined`] to prevent infinite loops.
fn recursive_summarize_inner(text: &str, depth: usize) -> Result<String, String> {
    if depth > MAX_RECURSION_DEPTH {
        // Forcibly truncate and do one final summarization instead of erroring
        let truncated = if text.len() > CHUNK_SIZE_CHARS {
            let mut pos = CHUNK_SIZE_CHARS;
            while !text.is_char_boundary(pos) && pos > 0 {
                pos -= 1;
            }
            &text[..pos]
        } else {
            text
        };
        return call_summarize_combined(truncated);
    }

    // Base case: text fits in a single chunk
    if text.len() <= CHUNK_SIZE_CHARS {
        return call_summarize_text(text);
    }

    // Split into chunks at sentence boundaries
    let chunks = split_at_sentences(text, CHUNK_SIZE_CHARS);

    // Summarize each chunk
    let mut summaries = Vec::with_capacity(chunks.len());
    for chunk in &chunks {
        let summary = call_summarize_text(chunk)?;
        summaries.push(summary);
    }

    if summaries.len() == 1 {
        return Ok(summaries.into_iter().next().unwrap());
    }

    // Combine and re-summarize
    let combined = summaries.join("\n\n");
    if combined.len() <= CHUNK_SIZE_CHARS {
        call_summarize_combined(&combined)
    } else {
        recursive_summarize_inner(&combined, depth + 1)
    }
}

// --- Swift FFI Wrappers ---------------------------------------------------

/// Calls the Swift `scripta_summarize_text` FFI to summarize a single chunk.
///
/// Returns `Err` if the Swift side returns an `"ERROR:"` prefixed string.
#[cfg(target_os = "macos")]
fn call_summarize_text(text: &str) -> Result<String, String> {
    let input = SRString::from(text);
    let result = unsafe { scripta_summarize_text(&input) };
    let s = result.to_string();
    if let Some(err) = s.strip_prefix("ERROR:") {
        Err(err.to_string())
    } else {
        Ok(s)
    }
}

/// Stub for non-macOS platforms — always returns an error.
#[cfg(not(target_os = "macos"))]
fn call_summarize_text(_text: &str) -> Result<String, String> {
    Err("Summarization requires macOS".to_string())
}

/// Calls the Swift `scripta_summarize_combined` FFI to produce a final summary
/// from previously summarized chunks.
///
/// Returns `Err` if the Swift side returns an `"ERROR:"` prefixed string.
#[cfg(target_os = "macos")]
fn call_summarize_combined(text: &str) -> Result<String, String> {
    let input = SRString::from(text);
    let result = unsafe { scripta_summarize_combined(&input) };
    let s = result.to_string();
    if let Some(err) = s.strip_prefix("ERROR:") {
        Err(err.to_string())
    } else {
        Ok(s)
    }
}

/// Stub for non-macOS platforms — always returns an error.
#[cfg(not(target_os = "macos"))]
fn call_summarize_combined(_text: &str) -> Result<String, String> {
    Err("Summarization requires macOS".to_string())
}

// --- Text Processing Helpers -----------------------------------------------

/// Extracts plain text from BlockNote JSON content.
fn extract_plain_text(content_json: &str) -> String {
    let blocks: Vec<serde_json::Value> = match serde_json::from_str(content_json) {
        Ok(b) => b,
        Err(_) => return String::new(),
    };
    let mut texts = Vec::new();
    collect_plain_texts(&blocks, &mut texts);
    let raw = texts.join("\n");
    sanitize_for_llm(&raw)
}

/// Removes URLs and HTML-like tags that may trigger Apple Intelligence safety filters.
fn sanitize_for_llm(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(ch) = chars.next() {
        // Skip URL-like sequences (http:// or https://)
        if ch == 'h' {
            let rest: String = std::iter::once(ch).chain(chars.clone().take(7)).collect();
            if rest.starts_with("http://") || rest.starts_with("https://") {
                // Consume until whitespace or end
                for c in chars.by_ref() {
                    if c.is_whitespace() {
                        result.push(c);
                        break;
                    }
                }
                continue;
            }
        }
        result.push(ch);
    }
    result
}

/// Recursively collects plain text from BlockNote JSON blocks.
///
/// Only blocks whose `type` is in [`SUMMARIZABLE_BLOCK_TYPES`] contribute text.
/// Nested `children` arrays are traversed recursively.
fn collect_plain_texts(blocks: &[serde_json::Value], texts: &mut Vec<String>) {
    for block in blocks {
        let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if SUMMARIZABLE_BLOCK_TYPES.contains(&block_type) {
            if let Some(inline) = block.get("content").and_then(|c| c.as_array()) {
                let text: String = inline
                    .iter()
                    .filter_map(|node| node.get("text").and_then(|t| t.as_str()))
                    .collect::<Vec<_>>()
                    .join("");
                if !text.is_empty() {
                    texts.push(text);
                }
            }
        }
        if let Some(children) = block.get("children").and_then(|c| c.as_array()) {
            collect_plain_texts(children, texts);
        }
    }
}

/// Splits text into chunks of at most `max_chars`, preferring sentence
/// boundaries.
fn split_at_sentences(text: &str, max_chars: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current = String::new();

    for sentence in text.split_inclusive(|c| c == '.' || c == '。' || c == '\n') {
        if !current.is_empty() && current.len() + sentence.len() > max_chars {
            chunks.push(std::mem::take(&mut current));
        }
        current.push_str(sentence);
    }
    if !current.is_empty() {
        chunks.push(current);
    }

    // Hard-split any chunk that still exceeds max_chars
    let mut final_chunks = Vec::new();
    for chunk in chunks {
        if chunk.len() <= max_chars {
            final_chunks.push(chunk);
        } else {
            // Split at char boundaries to avoid breaking multi-byte characters
            let mut remaining = chunk.as_str();
            while !remaining.is_empty() {
                let split_pos = if remaining.len() <= max_chars {
                    remaining.len()
                } else {
                    // Find the last char boundary within max_chars
                    let mut pos = max_chars;
                    while !remaining.is_char_boundary(pos) && pos > 0 {
                        pos -= 1;
                    }
                    if pos == 0 {
                        max_chars
                    } else {
                        pos
                    }
                };
                final_chunks.push(remaining[..split_pos].to_string());
                remaining = &remaining[split_pos..];
            }
        }
    }
    final_chunks
}

/// Computes a fast hash of text for cache invalidation.
fn compute_hash(text: &str) -> String {
    let mut hasher = DefaultHasher::new();
    text.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}
