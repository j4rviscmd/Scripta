use crate::db::{get_note, DbState, Note};
use serde_json::Value;
use std::sync::Arc;
use std::sync::Mutex;
use tauri::ipc::Channel;
use tauri::Manager;
use tokio::sync::Semaphore;

#[cfg(target_os = "macos")]
use swift_rs::{swift, Bool, SRString};

/// In-memory cache for translation availability check.
pub struct TranslationAvailable(pub Mutex<Option<bool>>);

// --- Swift FFI declarations (macOS only) -----------------------------------

#[cfg(target_os = "macos")]
swift!(fn scripta_translation_available() -> Bool);

#[cfg(target_os = "macos")]
swift!(fn scripta_translate_batch(
    text: &SRString,
    source_lang: &SRString,
    target_lang: &SRString
) -> SRString);

#[cfg(target_os = "macos")]
swift!(fn scripta_translate_single(
    text: &SRString,
    source_lang: &SRString,
    target_lang: &SRString
) -> SRString);

#[cfg(target_os = "macos")]
swift!(fn scripta_get_supported_languages() -> SRString);

#[cfg(target_os = "macos")]
swift!(fn scripta_detect_language(text: &SRString) -> SRString);

#[cfg(target_os = "macos")]
swift!(fn scripta_check_language_pair_status(
    source_lang: &SRString,
    target_lang: &SRString
) -> SRString);

// --- BlockNote JSON helpers ------------------------------------------------

const TRANSLATABLE_BLOCK_TYPES: &[&str] = &[
    "heading",
    "paragraph",
    "bulletListItem",
    "numberedListItem",
    "checkListItem",
];

fn extract_block_texts(content_json: &str) -> Result<Vec<String>, String> {
    let blocks: Vec<Value> =
        serde_json::from_str(content_json).map_err(|e| format!("invalid JSON: {e}"))?;
    let mut texts = Vec::new();
    collect_texts_from_blocks(&blocks, &mut texts);
    Ok(texts)
}

fn collect_texts_from_blocks(blocks: &[Value], texts: &mut Vec<String>) {
    for block in blocks {
        let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");

        if TRANSLATABLE_BLOCK_TYPES.contains(&block_type) {
            if let Some(inline) = block.get("content").and_then(|c| c.as_array()) {
                let block_text = encode_inline_content(inline);
                if !block_text.is_empty() {
                    texts.push(block_text);
                }
            }
        }

        if let Some(children) = block.get("children").and_then(|c| c.as_array()) {
            collect_texts_from_blocks(children, texts);
        }
    }
}

// --- Inline style encoding / decoding --------------------------------------
//
// BlockNote inline content is an array of nodes:
//   { "type": "text", "text": "...", "styles": { "bold": true, "code": true, ... } }
//   { "type": "link", "href": "...", "content": [ ... ] }
//
// To preserve styles across translation we encode styled spans as
// placeholder tokens that Apple's translator treats as opaque text:
//
//   {{C:text}}            code
//   {{B:text}}            bold
//   {{I:text}}            italic
//   {{S:text}}            strikethrough
//   {{U:text}}            underline
//   {{TC:#hexcolor~text}}  textColor
//   {{BC:#hexcolor~text}}  backgroundColor
//   {{L:href~text}}       link (text is recursively encoded)
//
// Multiple styles are nested: {{B:{{I:bold italic}}}}

/// Encodes a BlockNote inline content array into a string with style
/// placeholder tokens, suitable for passing to the translation engine.
fn encode_inline_content(inline: &[Value]) -> String {
    let mut out = String::new();
    for node in inline {
        let node_type = node.get("type").and_then(|t| t.as_str()).unwrap_or("");

        if node_type == "link" {
            if let Some(href) = node.get("href").and_then(|h| h.as_str()) {
                let inner = node
                    .get("content")
                    .and_then(|c| c.as_array())
                    .map(|arr| encode_inline_content(arr))
                    .unwrap_or_default();
                out.push_str("{{L:");
                out.push_str(href);
                out.push('~');
                out.push_str(&inner);
                out.push_str("}}");
            }
        } else if node_type == "text" {
            if let Some(text) = node.get("text").and_then(|t| t.as_str()) {
                if text.is_empty() {
                    continue;
                }
                let styles = node.get("styles").unwrap_or(&Value::Null);
                let encoded = wrap_with_styles(text, styles);
                out.push_str(&encoded);
            }
        }
    }
    out
}

/// Wraps text with style placeholder tokens based on the `styles` object.
/// Canonical nesting order (outermost applied last): C → U → S → I → B → TC → BC.
fn wrap_with_styles(text: &str, styles: &Value) -> String {
    let mut s = text.to_owned();

    if styles.get("code").and_then(|v| v.as_bool()).unwrap_or(false) {
        s = style_token("C", &s);
    }
    if styles.get("underline").and_then(|v| v.as_bool()).unwrap_or(false) {
        s = style_token("U", &s);
    }
    if styles.get("strikethrough").and_then(|v| v.as_bool()).unwrap_or(false) {
        s = style_token("S", &s);
    }
    if styles.get("italic").and_then(|v| v.as_bool()).unwrap_or(false) {
        s = style_token("I", &s);
    }
    if styles.get("bold").and_then(|v| v.as_bool()).unwrap_or(false) {
        s = style_token("B", &s);
    }
    if let Some(color) = styles.get("textColor").and_then(|v| v.as_str()) {
        s = style_token_param("TC", color, &s);
    }
    if let Some(color) = styles
        .get("backgroundColor")
        .and_then(|v| v.as_str())
    {
        s = style_token_param("BC", color, &s);
    }

    s
}

fn style_token(key: &str, text: &str) -> String {
    format!("{{{{{key}:{text}}}}}")
}

fn style_token_param(key: &str, param: &str, text: &str) -> String {
    format!("{{{{{key}:{param}~{text}}}}}")
}

/// Decodes a style-encoded string back into a BlockNote inline content
/// JSON array. Falls back to a single plain-text node on parse failure.
fn decode_inline_content(encoded: &str) -> Vec<Value> {
    let tokens = tokenize(encoded);
    let mut pos = 0;
    let nodes = decode_recursive(&tokens, &mut pos);
    if !nodes.is_empty() {
        nodes
    } else {
        vec![serde_json::json!({
            "type": "text",
            "text": encoded,
            "styles": {}
        })]
    }
}

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    Text(String),
    Open { key: String, param: Option<String> },
    Close,
}

/// Tokenizes an encoded string into `Tok` values.
fn tokenize(s: &str) -> Vec<Tok> {
    let mut tokens = Vec::new();
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;
    let mut text_buf = String::new();

    let flush_text = |buf: &mut String, out: &mut Vec<Tok>| {
        if !buf.is_empty() {
            out.push(Tok::Text(std::mem::take(buf)));
        }
    };

    while i < chars.len() {
        // Check for `{{`
        if i + 1 < chars.len() && chars[i] == '{' && chars[i + 1] == '{' {
            flush_text(&mut text_buf, &mut tokens);
            i += 2;

            // Scan the key up to `:` or `~`
            let mut key = String::new();
            while i < chars.len() && chars[i] != ':' && chars[i] != '~' && chars[i] != '}' {
                key.push(chars[i]);
                i += 1;
            }

            let known = matches!(key.as_str(), "C" | "B" | "I" | "S" | "U" | "TC" | "BC" | "L");
            if !known || i >= chars.len() || chars[i] != ':' {
                // Not a recognized token, emit literal `{{`
                tokens.push(Tok::Text("{{".to_owned()));
                tokens.push(Tok::Text(key));
                if i < chars.len() && chars[i] == ':' {
                    tokens.push(Tok::Text(":".to_owned()));
                    i += 1;
                }
                continue;
            }
            i += 1; // skip `:`

            let param = if matches!(key.as_str(), "TC" | "BC" | "L") {
                // Scan until `|`
                let mut p = String::new();
                while i < chars.len() && chars[i] != '~' {
                    p.push(chars[i]);
                    i += 1;
                }
                if i < chars.len() && chars[i] == '~' {
                    i += 1;
                }
                Some(p)
            } else {
                None
            };

            tokens.push(Tok::Open { key, param });
        } else if i + 1 < chars.len() && chars[i] == '}' && chars[i + 1] == '}' {
            flush_text(&mut text_buf, &mut tokens);
            tokens.push(Tok::Close);
            i += 2;
        } else {
            text_buf.push(chars[i]);
            i += 1;
        }
    }
    flush_text(&mut text_buf, &mut tokens);
    tokens
}

/// Recursive decode that handles link nodes by wrapping inner content.
fn decode_recursive(tokens: &[Tok], pos: &mut usize) -> Vec<Value> {
    let mut result = Vec::new();
    let mut text_buf = String::new();
    let mut active_styles: serde_json::Map<String, Value> = serde_json::Map::new();
    let mut style_stack: Vec<(String, Option<String>, usize)> = Vec::new();

    while *pos < tokens.len() {
        match &tokens[*pos] {
            Tok::Text(t) => {
                text_buf.push_str(t);
            }
            Tok::Open { key, param } => {
                if !text_buf.is_empty() {
                    result.push(serde_json::json!({
                        "type": "text",
                        "text": std::mem::take(&mut text_buf),
                        "styles": active_styles.clone()
                    }));
                }
                style_stack.push((key.clone(), param.clone(), result.len()));
                apply_style(&mut active_styles, key, param);
            }
            Tok::Close => {
                if !text_buf.is_empty() {
                    result.push(serde_json::json!({
                        "type": "text",
                        "text": std::mem::take(&mut text_buf),
                        "styles": active_styles.clone()
                    }));
                }
                if let Some((key, param, start)) = style_stack.pop() {
                    remove_style(&mut active_styles, &key, &param);
                    // If this was a link, wrap only the inner nodes collected
                    // since the Open token (not all preceding nodes).
                    if key == "L" {
                        let href = param.unwrap_or_default();
                        let inner: Vec<Value> = result.drain(start..).collect();
                        result.push(serde_json::json!({
                            "type": "link",
                            "href": href,
                            "content": inner
                        }));
                    }
                }
            }
        }
        *pos += 1;
    }

    if !text_buf.is_empty() {
        result.push(serde_json::json!({
            "type": "text",
            "text": text_buf,
            "styles": active_styles.clone()
        }));
    }
    result
}

fn apply_style(styles: &mut serde_json::Map<String, Value>, key: &str, param: &Option<String>) {
    match key {
        "C" => {
            styles.insert("code".to_owned(), Value::Bool(true));
        }
        "B" => {
            styles.insert("bold".to_owned(), Value::Bool(true));
        }
        "I" => {
            styles.insert("italic".to_owned(), Value::Bool(true));
        }
        "S" => {
            styles.insert("strikethrough".to_owned(), Value::Bool(true));
        }
        "U" => {
            styles.insert("underline".to_owned(), Value::Bool(true));
        }
        "TC" => {
            if let Some(color) = param {
                styles.insert("textColor".to_owned(), Value::String(color.clone()));
            }
        }
        "BC" => {
            if let Some(color) = param {
                styles.insert(
                    "backgroundColor".to_owned(),
                    Value::String(color.clone()),
                );
            }
        }
        _ => {}
    }
}

fn remove_style(styles: &mut serde_json::Map<String, Value>, key: &str, _param: &Option<String>) {
    match key {
        "C" => { styles.remove("code"); }
        "B" => { styles.remove("bold"); }
        "I" => { styles.remove("italic"); }
        "S" => { styles.remove("strikethrough"); }
        "U" => { styles.remove("underline"); }
        "TC" => { styles.remove("textColor"); }
        "BC" => { styles.remove("backgroundColor"); }
        _ => {}
    }
}

fn merge_translated_texts(content_json: &str, translated: &[String]) -> Result<String, String> {
    let mut blocks: Vec<Value> =
        serde_json::from_str(content_json).map_err(|e| format!("invalid JSON: {e}"))?;
    let mut index = 0usize;
    merge_into_blocks(&mut blocks, translated, &mut index);
    serde_json::to_string(&blocks).map_err(|e| format!("JSON serialise failed: {e}"))
}

fn merge_into_blocks(blocks: &mut [Value], translated: &[String], index: &mut usize) {
    for block in blocks.iter_mut() {
        let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");

        if TRANSLATABLE_BLOCK_TYPES.contains(&block_type) {
            if let Some(inline) = block.get_mut("content").and_then(|c| c.as_array_mut()) {
                if *index < translated.len() {
                    let decoded = decode_inline_content(&translated[*index]);
                    inline.clear();
                    for node in decoded {
                        inline.push(node);
                    }
                    *index += 1;
                }
            }
        }

        if let Some(children) = block.get_mut("children").and_then(|c| c.as_array_mut()) {
            merge_into_blocks(children, translated, index);
        }
    }
}

fn extract_title_from_content(content_json: &str) -> String {
    let blocks: Vec<Value> = match serde_json::from_str(content_json) {
        Ok(v) => v,
        Err(_) => return "Untitled".to_owned(),
    };
    for block in &blocks {
        if block.get("type").and_then(|t| t.as_str()) != Some("heading") {
            continue;
        }
        if let Some(inline) = block.get("content").and_then(|c| c.as_array()) {
            let text: String = inline
                .iter()
                .filter_map(|n| n.get("text").and_then(|t| t.as_str()))
                .collect();
            if !text.is_empty() {
                return text;
            }
        }
    }
    "Untitled".to_owned()
}

// --- Shared translation logic -----------------------------------------------

fn translate_texts(texts: &[String], source_lang: &str, target_lang: &str) -> Result<Vec<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let joined = texts.join("\0");
        let mut last_err = String::new();
        for attempt in 0..3 {
            let result = unsafe {
                scripta_translate_batch(
                    &SRString::from(joined.as_str()),
                    &SRString::from(source_lang),
                    &SRString::from(target_lang),
                )
            };
            let result_str = result.as_str();
            if let Some(err) = result_str.strip_prefix("ERROR:") {
                last_err = err.to_owned();
                // Retry on transient cold-start failures from TranslationSession.
                if attempt < 2 {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                    continue;
                }
                return Err(last_err);
            }
            let translated: Vec<String> = if result_str.is_empty() {
                return Err("Translation returned empty result".to_owned());
            } else {
                result_str.split('\0').map(String::from).collect()
            };
            if translated.len() != texts.len() {
                return Err(format!(
                    "Translation count mismatch: expected {}, got {}",
                    texts.len(),
                    translated.len()
                ));
            }
            return Ok(translated);
        }
        Err(last_err)
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (texts, source_lang, target_lang);
        Err("Translation is only available on macOS".to_owned())
    }
}

// --- Tauri commands --------------------------------------------------------

#[tauri::command]
pub fn is_translation_available(state: tauri::State<TranslationAvailable>) -> bool {
    let mut cached = state.0.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(available) = *cached {
        return available;
    }

    #[cfg(target_os = "macos")]
    {
        let available: bool = unsafe { scripta_translation_available() };
        *cached = Some(available);
        available
    }

    #[cfg(not(target_os = "macos"))]
    {
        *cached = Some(false);
        false
    }
}

#[tauri::command]
pub async fn translate_note(
    app: tauri::AppHandle,
    note_id: String,
    source_lang: String,
    target_lang: String,
) -> Result<Note, String> {
    let note = get_note(app.state::<DbState>(), note_id)?.ok_or("Note not found")?;

    let texts = extract_block_texts(&note.content)?;
    if texts.is_empty() {
        return Err("No translatable text found".to_owned());
    }

    let translated = translate_texts(&texts, &source_lang, &target_lang)?;

    let translated_content = merge_translated_texts(&note.content, &translated)?;
    let title = extract_title_from_content(&translated_content);
    let now = chrono::Utc::now().to_rfc3339();

    {
        let db = app.state::<DbState>();
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE notes SET title = ?1, content = ?2, updated_at = ?3 WHERE id = ?4",
            rusqlite::params![title, translated_content, now, note.id],
        )
        .map_err(|e| e.to_string())?;
    }

    get_note(app.state::<DbState>(), note.id.clone())?
        .ok_or_else(|| "Failed to fetch updated note".to_owned())
}

#[tauri::command]
pub async fn translate_blocks(
    content: String,
    source_lang: String,
    target_lang: String,
) -> Result<String, String> {
    let texts = extract_block_texts(&content)?;
    if texts.is_empty() {
        return Err("No translatable text found".to_owned());
    }
    let translated = translate_texts(&texts, &source_lang, &target_lang)?;
    merge_translated_texts(&content, &translated)
}

#[tauri::command]
pub fn get_supported_languages() -> String {
    #[cfg(target_os = "macos")]
    {
        let result = unsafe { scripta_get_supported_languages() };
        result.as_str().to_owned()
    }

    #[cfg(not(target_os = "macos"))]
    {
        "[]".to_owned()
    }
}

#[tauri::command]
pub fn detect_language(text: String) -> String {
    #[cfg(target_os = "macos")]
    {
        let result = unsafe { scripta_detect_language(&SRString::from(text.as_str())) };
        result.as_str().to_owned()
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = text;
        String::new()
    }
}

#[tauri::command]
pub async fn check_language_pair_status(source_lang: String, target_lang: String) -> String {
    tokio::task::spawn_blocking(move || {
        #[cfg(target_os = "macos")]
        {
            let result = unsafe {
                scripta_check_language_pair_status(
                    &SRString::from(source_lang.as_str()),
                    &SRString::from(target_lang.as_str()),
                )
            };
            result.as_str().to_owned()
        }

        #[cfg(not(target_os = "macos"))]
        {
            let _ = (source_lang, target_lang);
            "unsupported".to_owned()
        }
    })
    .await
    .unwrap_or_else(|_| "unsupported".to_owned())
}

#[tauri::command]
pub async fn translate_text(
    text: String,
    source_lang: String,
    target_lang: String,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        #[cfg(target_os = "macos")]
        {
            let result = unsafe {
                scripta_translate_single(
                    &SRString::from(text.as_str()),
                    &SRString::from(source_lang.as_str()),
                    &SRString::from(target_lang.as_str()),
                )
            };
            let translated = result.as_str().to_owned();
            if translated.is_empty() && !text.is_empty() {
                return Err("Translation failed".to_owned());
            }
            Ok(translated)
        }

        #[cfg(not(target_os = "macos"))]
        {
            let _ = (text, source_lang, target_lang);
            Err("Translation is only available on macOS".to_owned())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

// --- Streaming translation --------------------------------------------------

/// Maximum number of concurrent translation sessions.
const MAX_CONCURRENT: usize = 3;
/// Number of blocks per chunk.
const CHUNK_SIZE: usize = 20;
/// Maximum character count per chunk before splitting.
const MAX_CHUNK_CHARS: usize = 50_000;

/// Event payload sent from the backend to the frontend during streaming
/// translation via a Tauri [`Channel`].
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase", tag = "event", content = "data")]
pub enum TranslationStreamEvent {
    Started {
        total_chunks: usize,
        total_blocks: usize,
    },
    ChunkCompleted {
        chunk_index: usize,
        total_chunks: usize,
        start_index: usize,
        translated_texts: Vec<String>,
    },
    Finished {
        total_translated: usize,
    },
    Error {
        chunk_index: usize,
        message: String,
    },
}

/// A contiguous slice of the global block-text array.
struct TextChunk {
    /// Index of the first text in the global extracted-text array.
    start_index: usize,
    texts: Vec<String>,
}

/// Splits extracted texts into chunks respecting both a block-count limit and
/// a character-count limit.
fn chunk_texts(texts: &[String], chunk_size: usize, max_chars: usize) -> Vec<TextChunk> {
    let mut chunks = Vec::new();
    let mut current = Vec::new();
    let mut current_chars = 0usize;
    let mut start = 0usize;

    for (i, text) in texts.iter().enumerate() {
        if !current.is_empty()
            && (current.len() >= chunk_size || current_chars + text.len() > max_chars)
        {
            chunks.push(TextChunk {
                start_index: start,
                texts: std::mem::take(&mut current),
            });
            start = i;
            current_chars = 0;
        }
        current_chars += text.len();
        current.push(text.clone());
    }

    if !current.is_empty() {
        chunks.push(TextChunk {
            start_index: start,
            texts: current,
        });
    }

    chunks
}

/// Translates BlockNote content in parallel chunks, streaming results back
/// via a Tauri [`Channel`]. Does **not** write to the database.
#[tauri::command]
pub async fn translate_blocks_streaming(
    content: String,
    source_lang: String,
    target_lang: String,
    on_event: Channel<TranslationStreamEvent>,
) -> Result<(), String> {
    let texts = extract_block_texts(&content)?;
    if texts.is_empty() {
        return Err("No translatable text found".to_owned());
    }

    let chunks = chunk_texts(&texts, CHUNK_SIZE, MAX_CHUNK_CHARS);
    let total_chunks = chunks.len();
    let total_blocks = texts.len();

    on_event
        .send(TranslationStreamEvent::Started {
            total_chunks,
            total_blocks,
        })
        .map_err(|e| e.to_string())?;

    let semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT));
    let mut handles = Vec::with_capacity(total_chunks);

    for (chunk_index, chunk) in chunks.into_iter().enumerate() {
        let permit = semaphore.clone();
        let src = source_lang.clone();
        let tgt = target_lang.clone();
        let chan = on_event.clone();

        handles.push(tokio::spawn(async move {
            let _guard = permit.acquire().await.unwrap();
            let result = tokio::task::spawn_blocking(move || {
                translate_texts(&chunk.texts, &src, &tgt)
            })
            .await;

            match result {
                Ok(Ok(translated)) => {
                    let count = translated.len();
                    let _ = chan.send(TranslationStreamEvent::ChunkCompleted {
                        chunk_index,
                        total_chunks,
                        start_index: chunk.start_index,
                        translated_texts: translated,
                    });
                    Some(count)
                }
                Ok(Err(e)) => {
                    let _ = chan.send(TranslationStreamEvent::Error {
                        chunk_index,
                        message: e,
                    });
                    None
                }
                Err(e) => {
                    let _ = chan.send(TranslationStreamEvent::Error {
                        chunk_index,
                        message: e.to_string(),
                    });
                    None
                }
            }
        }));
    }

    let mut total_translated = 0usize;
    for handle in handles {
        if let Ok(Some(count)) = handle.await {
            total_translated += count;
        }
    }

    on_event
        .send(TranslationStreamEvent::Finished { total_translated })
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn text_node(text: &str, styles: serde_json::Value) -> Value {
        json!({"type": "text", "text": text, "styles": styles})
    }

    fn plain(text: &str) -> Value {
        text_node(text, json!({}))
    }

    #[test]
    fn test_encode_plain_text() {
        let inline = vec![plain("Hello world")];
        assert_eq!(encode_inline_content(&inline), "Hello world");
    }

    #[test]
    fn test_encode_bold() {
        let inline = vec![plain("Hello "), text_node("world", json!({"bold": true}))];
        assert_eq!(encode_inline_content(&inline), "Hello {{B:world}}");
    }

    #[test]
    fn test_encode_italic() {
        let inline = vec![text_node("ciao", json!({"italic": true}))];
        assert_eq!(encode_inline_content(&inline), "{{I:ciao}}");
    }

    #[test]
    fn test_encode_code() {
        let inline = vec![plain("use "), text_node("rm -rf", json!({"code": true}))];
        assert_eq!(encode_inline_content(&inline), "use {{C:rm -rf}}");
    }

    #[test]
    fn test_encode_combined_styles() {
        let inline = vec![text_node("bold italic", json!({"bold": true, "italic": true}))];
        assert_eq!(encode_inline_content(&inline), "{{B:{{I:bold italic}}}}");
    }

    #[test]
    fn test_encode_text_color() {
        let inline = vec![text_node("red text", json!({"textColor": "#ff0000"}))];
        assert_eq!(encode_inline_content(&inline), "{{TC:#ff0000~red text}}");
    }

    #[test]
    fn test_encode_bg_color() {
        let inline = vec![text_node("highlighted", json!({"backgroundColor": "#ffff00"}))];
        assert_eq!(encode_inline_content(&inline), "{{BC:#ffff00~highlighted}}");
    }

    #[test]
    fn test_encode_link() {
        let inline = vec![
            plain("click "),
            json!({"type": "link", "href": "https://example.com", "content": [plain("here")]}),
        ];
        assert_eq!(encode_inline_content(&inline), "click {{L:https://example.com~here}}");
    }

    #[test]
    fn test_encode_link_with_styled_text() {
        let inline = vec![json!({
            "type": "link",
            "href": "https://example.com",
            "content": [text_node("styled link", json!({"bold": true, "italic": true}))]
        })];
        assert_eq!(
            encode_inline_content(&inline),
            "{{L:https://example.com~{{B:{{I:styled link}}}}}}"
        );
    }

    #[test]
    fn test_decode_plain() {
        let result = decode_inline_content("Hello world");
        assert_eq!(result, vec![plain("Hello world")]);
    }

    #[test]
    fn test_decode_bold() {
        let result = decode_inline_content("Hello {{B:world}}");
        assert_eq!(result.len(), 2);
        assert_eq!(result[0], plain("Hello "));
        assert_eq!(result[1], text_node("world", json!({"bold": true})));
    }

    #[test]
    fn test_decode_code() {
        let result = decode_inline_content("This is {{C:code}} text");
        assert_eq!(result.len(), 3);
        assert_eq!(result[1], text_node("code", json!({"code": true})));
    }

    #[test]
    fn test_decode_link() {
        let result = decode_inline_content("{{L:https://example.com~click here}}");
        assert_eq!(result.len(), 1);
        assert_eq!(result[0]["type"], "link");
        assert_eq!(result[0]["href"], "https://example.com");
    }

    #[test]
    fn test_decode_link_with_styles() {
        let result = decode_inline_content("{{L:https://x.com~{{B:link}}}}");
        assert_eq!(result.len(), 1);
        let content = result[0]["content"].as_array().unwrap();
        assert_eq!(content.len(), 1);
        assert_eq!(content[0], text_node("link", json!({"bold": true})));
    }

    #[test]
    fn test_decode_text_color() {
        let result = decode_inline_content("{{TC:#ff0000~red text}}");
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], text_node("red text", json!({"textColor": "#ff0000"})));
    }

    #[test]
    fn test_decode_combined_styles() {
        let result = decode_inline_content("{{B:{{I:bold italic}}}}");
        assert_eq!(result.len(), 1);
        assert_eq!(
            result[0],
            text_node("bold italic", json!({"bold": true, "italic": true}))
        );
    }

    #[test]
    fn test_decode_malformed_fallback() {
        let result = decode_inline_content("{{unknown:stuff");
        // Should fall back to plain text node
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], plain("{{unknown:stuff"));
    }

    #[test]
    fn test_decode_double_brace_in_text() {
        let result = decode_inline_content("normal {{ text");
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], plain("normal {{ text"));
    }

    #[test]
    fn test_roundtrip_bold() {
        let inline = vec![plain("Hello "), text_node("world", json!({"bold": true}))];
        let encoded = encode_inline_content(&inline);
        let decoded = decode_inline_content(&encoded);
        assert_eq!(decoded.len(), 2);
        assert_eq!(decoded[1], text_node("world", json!({"bold": true})));
    }

    #[test]
    fn test_roundtrip_complex() {
        let inline = vec![
            plain("This is "),
            text_node("code", json!({"code": true})),
            plain(" and "),
            text_node("bold", json!({"bold": true})),
            plain(" text"),
            json!({"type": "link", "href": "https://example.com", "content": [
                text_node("link", json!({"italic": true}))
            ]}),
        ];
        let encoded = encode_inline_content(&inline);
        let decoded = decode_inline_content(&encoded);
        assert_eq!(decoded.len(), 6);
        assert_eq!(decoded[1], text_node("code", json!({"code": true})));
        assert_eq!(decoded[3], text_node("bold", json!({"bold": true})));
        assert_eq!(decoded[5]["type"], "link");
        assert_eq!(decoded[5]["href"], "https://example.com");
    }

    #[test]
    fn test_extract_block_texts_encoded() {
        let blocks = json!([
            {"type": "paragraph", "content": [
                {"type": "text", "text": "Hello ", "styles": {}},
                {"type": "text", "text": "world", "styles": {"bold": true}},
                {"type": "text", "text": "!", "styles": {}}
            ]}
        ]);
        let result = extract_block_texts(&blocks.to_string()).unwrap();
        assert_eq!(result, vec!["Hello {{B:world}}!"]);
    }
}
