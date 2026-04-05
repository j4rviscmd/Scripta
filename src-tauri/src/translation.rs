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

/// State accumulated while encoding one or more blocks into token strings.
/// After encoding, `into_param_map()` returns a flat `Vec<String>` in the
/// layout `[code_params..., tc_params..., bc_params..., link_params...]` that
/// the frontend and the non-streaming Rust decoder use to restore values.
/// Code text is separated so the translation engine never sees it.
struct EncoderState {
    code_params: Vec<String>,
    tc_params: Vec<String>,
    bc_params: Vec<String>,
    link_params: Vec<String>,
}

impl EncoderState {
    fn new() -> Self {
        Self {
            code_params: Vec::new(),
            tc_params: Vec::new(),
            bc_params: Vec::new(),
            link_params: Vec::new(),
        }
    }

    fn code_count(&self) -> usize {
        self.code_params.len()
    }

    fn tc_count(&self) -> usize {
        self.tc_params.len()
    }

    fn bc_count(&self) -> usize {
        self.bc_params.len()
    }

    /// Returns the flat param_map: `[code_params..., tc_params..., bc_params..., link_params...]`.
    fn into_param_map(self) -> Vec<String> {
        let mut map = self.code_params;
        map.extend(self.tc_params);
        map.extend(self.bc_params);
        map.extend(self.link_params);
        map
    }
}

/// Extracts encoded token strings and a flat param_map from BlockNote JSON.
///
/// Returns `(texts, param_map, code_count, tc_count, bc_count)` where the counts
/// are the section boundaries needed to partition `param_map`:
/// `[0, code_count)` → code texts, `[code_count, code_count+tc_count)` →
/// textColor values, `[code_count+tc_count, code_count+tc_count+bc_count)` →
/// backgroundColor values, `[code_count+tc_count+bc_count, ..)` → link hrefs.
#[allow(clippy::type_complexity)]
fn extract_block_texts(
    content_json: &str,
) -> Result<(Vec<String>, Vec<String>, usize, usize, usize), String> {
    let blocks: Vec<Value> =
        serde_json::from_str(content_json).map_err(|e| format!("invalid JSON: {e}"))?;
    let mut texts = Vec::new();
    let mut state = EncoderState::new();
    collect_texts_from_blocks(&blocks, &mut texts, &mut state);
    let code_count = state.code_count();
    let tc_count = state.tc_count();
    let bc_count = state.bc_count();
    let param_map = state.into_param_map();
    Ok((texts, param_map, code_count, tc_count, bc_count))
}

fn collect_texts_from_blocks(blocks: &[Value], texts: &mut Vec<String>, state: &mut EncoderState) {
    for block in blocks {
        let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");

        if TRANSLATABLE_BLOCK_TYPES.contains(&block_type) {
            if let Some(inline) = block.get("content").and_then(|c| c.as_array()) {
                let block_text = encode_inline_content(inline, state);
                if !block_text.is_empty() {
                    texts.push(block_text);
                }
            }
        }

        if let Some(children) = block.get("children").and_then(|c| c.as_array()) {
            collect_texts_from_blocks(children, texts, state);
        }
    }
}

// --- Inline style encoding / decoding --------------------------------------
//
// BlockNote inline content is an array of nodes:
//   { "type": "text", "text": "...", "styles": { "bold": true, "code": true, ... } }
//   { "type": "link", "href": "...", "content": [ ... ] }
//
// To preserve styles across translation, styled spans are encoded as
// placeholder tokens that Apple's translator treats as opaque text.
// Style parameters (colors, hrefs) are collected into a separate param_map
// so they survive translation without being altered by the engine.
//
//   [[0]]    code             (param_map[code_off + code_idx] holds the original text)
//   [[1]]    bold
//   [[2]]    italic
//   [[3]]    strike
//   [[4]]    underline
//   [[5]]    textColor        (param_map[tc_off + tc_idx])
//   [[9]]    backgroundColor  (param_map[bc_off + bc_idx])
//   [[7]]    link             (param_map[link_off + link_idx])
//
// Multiple styles use nested open/close pairs: [[1]][[2]]bold italic[[/2]][[/1]]
// param_map layout: [code_params..., tc_params..., bc_params..., link_params...]
// Code text is stored in param_map so the translation engine never modifies it.
//
// IMPORTANT: Styled text sits BETWEEN [[N]] and [[/N]] markers so that Apple
// Translation can translate it while leaving the opaque double-bracket markers
// unchanged. The [[...]] format is preserved reliably by Apple Translation.

/// Encodes a BlockNote inline content array into a string with style
/// placeholder tokens, suitable for passing to the translation engine.
/// Color and link parameters are collected into `state` for later retrieval.
fn encode_inline_content(inline: &[Value], state: &mut EncoderState) -> String {
    let mut out = String::new();
    for node in inline {
        let node_type = node.get("type").and_then(|t| t.as_str()).unwrap_or("");

        if node_type == "link" {
            if let Some(href) = node.get("href").and_then(|h| h.as_str()) {
                // Push href before encoding inner content so that nested links
                // are ordered consistently with pre-order traversal during decode.
                state.link_params.push(href.to_owned());
                let inner = node
                    .get("content")
                    .and_then(|c| c.as_array())
                    .map(|arr| encode_inline_content(arr, state))
                    .unwrap_or_default();
                out.push_str(&wrap_style("7", &inner));
            }
        } else if node_type == "text" {
            if let Some(text) = node.get("text").and_then(|t| t.as_str()) {
                if text.is_empty() {
                    continue;
                }
                let styles = node.get("styles").unwrap_or(&Value::Null);
                let encoded = wrap_with_styles(text, styles, state);
                out.push_str(&encoded);
            }
        }
    }
    out
}

/// Wraps text with style placeholder tokens based on the `styles` object.
/// Canonical nesting order (outermost applied last): 0→4→3→2→1→5→6.
/// Code text is stored in `state.code_params` and replaced with an empty
/// placeholder so the translation engine never sees it.
fn wrap_with_styles(text: &str, styles: &Value, state: &mut EncoderState) -> String {
    let mut s = text.to_owned();

    if styles
        .get("code")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        // Store the original text in code_params; use an empty placeholder
        // so the translation engine cannot modify it.
        state.code_params.push(s.clone());
        s = wrap_style("0", "");
    }
    if styles
        .get("underline")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        s = wrap_style("4", &s);
    }
    if styles
        .get("strike")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        s = wrap_style("3", &s);
    }
    if styles
        .get("italic")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        s = wrap_style("2", &s);
    }
    if styles
        .get("bold")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
    {
        s = wrap_style("1", &s);
    }
    if let Some(color) = styles.get("textColor").and_then(|v| v.as_str()) {
        state.tc_params.push(color.to_owned());
        s = wrap_style("5", &s);
    }
    if let Some(color) = styles.get("backgroundColor").and_then(|v| v.as_str()) {
        state.bc_params.push(color.to_owned());
        s = wrap_style("9", &s);
    }

    s
}

/// Returns an open/close marker pair: `[[key]]content[[/key]]`.
/// Text content sits OUTSIDE the opaque `[[...]]` delimiters so the
/// translation engine can translate it while leaving the markers intact.
fn wrap_style(key: &str, content: &str) -> String {
    format!("[[{key}]]{content}[[/{key}]]")
}

/// State shared across all block decodings so that paramMap indices advance
/// consistently. Layout: `[0, code_count)` → code texts,
/// `[code_count, code_count+tc_count)` → textColor values,
/// `[code_count+tc_count, code_count+tc_count+bc_count)` → backgroundColor values,
/// `[code_count+tc_count+bc_count, ..)` → link hrefs.
struct DecoderState<'a> {
    param_map: &'a [String],
    code_off: usize,
    tc_off: usize,
    bc_off: usize,
    link_off: usize,
    code_idx: usize,
    tc_idx: usize,
    bc_idx: usize,
    link_idx: usize,
}

impl<'a> DecoderState<'a> {
    fn new(param_map: &'a [String], code_count: usize, tc_count: usize, bc_count: usize) -> Self {
        Self {
            param_map,
            code_off: 0,
            tc_off: code_count,
            bc_off: code_count + tc_count,
            link_off: code_count + tc_count + bc_count,
            code_idx: 0,
            tc_idx: 0,
            bc_idx: 0,
            link_idx: 0,
        }
    }

    fn next_code(&mut self) -> Option<&str> {
        let idx = self.code_off + self.code_idx;
        self.code_idx += 1;
        self.param_map.get(idx).map(|s| s.as_str())
    }

    fn next_tc(&mut self) -> Option<&str> {
        let idx = self.tc_off + self.tc_idx;
        self.tc_idx += 1;
        self.param_map.get(idx).map(|s| s.as_str())
    }

    fn next_bc(&mut self) -> Option<&str> {
        let idx = self.bc_off + self.bc_idx;
        self.bc_idx += 1;
        self.param_map.get(idx).map(|s| s.as_str())
    }

    /// Returns the absolute param_map index for the next link href,
    /// advancing the internal link counter.
    fn next_link_param_idx(&mut self) -> usize {
        let idx = self.link_off + self.link_idx;
        self.link_idx += 1;
        idx
    }
}

/// Decodes a style-encoded string back into a BlockNote inline content
/// JSON array. Falls back to a single plain-text node on parse failure.
fn decode_inline_content_with_state(encoded: &str, state: &mut DecoderState) -> Vec<Value> {
    let tokens = tokenize(encoded);
    let mut pos = 0;
    let nodes = decode_recursive(&tokens, &mut pos, state);
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
    Open { key: String },
    Close,
}

fn is_known_key(key: &str) -> bool {
    matches!(key, "0" | "1" | "2" | "3" | "4" | "5" | "7" | "9")
}

/// Tokenizes an encoded string into `Tok` values.
/// Token format: `[[N]]` for Open, `[[/N]]` for Close, anything else is Text.
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
        // Check for `[[`
        if i + 1 < chars.len() && chars[i] == '[' && chars[i + 1] == '[' {
            // Look ahead for the matching `]]`
            let inner_start = i + 2;
            let mut k = inner_start;
            while k + 1 < chars.len() && !(chars[k] == ']' && chars[k + 1] == ']') {
                k += 1;
            }

            if k + 1 < chars.len() && chars[k] == ']' && chars[k + 1] == ']' {
                // Found `]]` at position k
                let inner: String = chars[inner_start..k].iter().collect();
                flush_text(&mut text_buf, &mut tokens);
                i = k + 2;

                if let Some(key) = inner.strip_prefix('/') {
                    if is_known_key(key) {
                        tokens.push(Tok::Close);
                    } else {
                        tokens.push(Tok::Text(format!("[[{inner}]]")));
                    }
                } else if is_known_key(&inner) {
                    tokens.push(Tok::Open { key: inner });
                } else {
                    tokens.push(Tok::Text(format!("[[{inner}]]")));
                }
            } else {
                // No closing `]]`: treat `[[` as literal text
                text_buf.push('[');
                text_buf.push('[');
                i += 2;
            }
        } else {
            text_buf.push(chars[i]);
            i += 1;
        }
    }
    flush_text(&mut text_buf, &mut tokens);
    tokens
}

/// Recursive decode that handles link nodes by wrapping inner content.
fn decode_recursive(tokens: &[Tok], pos: &mut usize, state: &mut DecoderState) -> Vec<Value> {
    let mut result = Vec::new();
    let mut text_buf = String::new();
    let mut active_styles: serde_json::Map<String, Value> = serde_json::Map::new();
    // (key, optional param_map index for link hrefs, start index in result)
    let mut style_stack: Vec<(String, Option<usize>, usize)> = Vec::new();

    while *pos < tokens.len() {
        match &tokens[*pos] {
            Tok::Text(t) => {
                text_buf.push_str(t);
            }
            Tok::Open { key } => {
                if !text_buf.is_empty() {
                    result.push(serde_json::json!({
                        "type": "text",
                        "text": std::mem::take(&mut text_buf),
                        "styles": active_styles.clone()
                    }));
                }
                let param_idx = apply_style(&mut active_styles, key, state);
                style_stack.push((key.clone(), param_idx, result.len()));
            }
            Tok::Close => {
                if !text_buf.is_empty() {
                    result.push(serde_json::json!({
                        "type": "text",
                        "text": std::mem::take(&mut text_buf),
                        "styles": active_styles.clone()
                    }));
                }
                if let Some((key, param_idx, start)) = style_stack.pop() {
                    if key == "0" {
                        // Emit code text from param_map BEFORE removing the code
                        // style so the resulting node carries {code: true}.
                        let code_text = state.next_code().unwrap_or("").to_owned();
                        result.push(serde_json::json!({
                            "type": "text",
                            "text": code_text,
                            "styles": active_styles.clone()
                        }));
                    }
                    remove_style(&mut active_styles, &key);
                    if key == "7" {
                        let href = param_idx
                            .and_then(|idx| state.param_map.get(idx))
                            .map(|s| s.as_str())
                            .unwrap_or("");
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

/// Applies the style for `key` to `active_styles`, consuming the next entry
/// from `state.param_map` for parameterised styles (textColor, backgroundColor).
/// Returns the param_map index for link tokens so the Close handler can look
/// up the href; returns `None` for all other tokens.
fn apply_style(
    styles: &mut serde_json::Map<String, Value>,
    key: &str,
    state: &mut DecoderState,
) -> Option<usize> {
    match key {
        "0" => {
            styles.insert("code".to_owned(), Value::Bool(true));
            None
        }
        "1" => {
            styles.insert("bold".to_owned(), Value::Bool(true));
            None
        }
        "2" => {
            styles.insert("italic".to_owned(), Value::Bool(true));
            None
        }
        "3" => {
            styles.insert("strike".to_owned(), Value::Bool(true));
            None
        }
        "4" => {
            styles.insert("underline".to_owned(), Value::Bool(true));
            None
        }
        "5" => {
            if let Some(color) = state.next_tc() {
                styles.insert("textColor".to_owned(), Value::String(color.to_owned()));
            }
            None
        }
        "9" => {
            if let Some(color) = state.next_bc() {
                styles.insert(
                    "backgroundColor".to_owned(),
                    Value::String(color.to_owned()),
                );
            }
            None
        }
        "7" => Some(state.next_link_param_idx()),
        _ => None,
    }
}

fn remove_style(styles: &mut serde_json::Map<String, Value>, key: &str) {
    match key {
        "0" => {
            styles.remove("code");
        }
        "1" => {
            styles.remove("bold");
        }
        "2" => {
            styles.remove("italic");
        }
        "3" => {
            styles.remove("strike");
        }
        "4" => {
            styles.remove("underline");
        }
        "5" => {
            styles.remove("textColor");
        }
        "9" => {
            styles.remove("backgroundColor");
        }
        _ => {}
    }
}

fn merge_translated_texts(
    content_json: &str,
    translated: &[String],
    param_map: &[String],
    code_count: usize,
    tc_count: usize,
    bc_count: usize,
) -> Result<String, String> {
    let mut blocks: Vec<Value> =
        serde_json::from_str(content_json).map_err(|e| format!("invalid JSON: {e}"))?;
    let mut index = 0usize;
    let mut state = DecoderState::new(param_map, code_count, tc_count, bc_count);
    merge_into_blocks(&mut blocks, translated, &mut index, &mut state);
    serde_json::to_string(&blocks).map_err(|e| format!("JSON serialise failed: {e}"))
}

fn merge_into_blocks(
    blocks: &mut [Value],
    translated: &[String],
    index: &mut usize,
    state: &mut DecoderState,
) {
    for block in blocks.iter_mut() {
        let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");

        if TRANSLATABLE_BLOCK_TYPES.contains(&block_type) {
            if let Some(inline) = block.get_mut("content").and_then(|c| c.as_array_mut()) {
                if *index < translated.len() {
                    let decoded = decode_inline_content_with_state(&translated[*index], state);
                    inline.clear();
                    for node in decoded {
                        inline.push(node);
                    }
                    *index += 1;
                }
            }
        }

        if let Some(children) = block.get_mut("children").and_then(|c| c.as_array_mut()) {
            merge_into_blocks(children, translated, index, state);
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

/// Known style keys used in open/close markers.
#[cfg(target_os = "macos")]
const KNOWN_KEYS_LIST: &[char] = &['0', '1', '2', '3', '4', '5', '7', '9'];

/// Encode style markers before sending to Apple Translation.
///
/// Apple Translation recognises `[[...]]` as wiki-link markup and partially or
/// fully drops close markers `[[/N]]` in certain positions.  We re-encode using
/// mathematical Unicode brackets that have no markup significance:
///
/// - Open  `[[N]]`  → `⟦N⟧`  (U+27E6 / U+27E7, MATHEMATICAL WHITE SQUARE BRACKET)
/// - Close `[[/N]]` → `⟨N⟩`  (U+27E8 / U+27E9, MATHEMATICAL ANGLE BRACKET)
///
/// These are visible, standard Unicode symbols preserved verbatim by translation
/// models.  We restore the originals after translation before returning.
#[cfg(target_os = "macos")]
fn encode_for_translation(text: &str) -> String {
    let mut s = text.to_owned();
    for &key in KNOWN_KEYS_LIST {
        s = s.replace(&format!("[[{key}]]"), &format!("\u{27E6}{key}\u{27E7}"));
        s = s.replace(&format!("[[/{key}]]"), &format!("\u{27E8}{key}\u{27E9}"));
    }
    s
}

/// Restore encoded markers back to `[[N]]` / `[[/N]]` after translation.
#[cfg(target_os = "macos")]
fn decode_from_translation(text: &str) -> String {
    let mut s = text.to_owned();
    for &key in KNOWN_KEYS_LIST {
        s = s.replace(&format!("\u{27E6}{key}\u{27E7}"), &format!("[[{key}]]"));
        s = s.replace(&format!("\u{27E8}{key}\u{27E9}"), &format!("[[/{key}]]"));
    }
    s
}

fn translate_texts(
    texts: &[String],
    source_lang: &str,
    target_lang: &str,
) -> Result<Vec<String>, String> {
    #[cfg(target_os = "macos")]
    {
        // Replace [[N]]/[[/N]] style markers with mathematical bracket chars
        // (⟦N⟧ / ⟨N⟩) before sending to Apple Translation.  The ML model
        // interprets [[...]] as wiki-link markup and partially drops close
        // markers (e.g. [[/7]] → ]]) especially at end-of-text.  Mathematical
        // Unicode brackets are preserved verbatim and are restored after.
        let safe_texts: Vec<String> = texts.iter().map(|t| encode_for_translation(t)).collect();
        let joined = safe_texts.join("\0");

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
            if result_str.is_empty() {
                return Err("Translation returned empty result".to_owned());
            }
            let translated: Vec<String> = result_str
                .split('\0')
                .zip(texts.iter())
                .map(|(raw, original)| {
                    let decoded = decode_from_translation(raw);
                    // If the original had balanced [[N]]/[[/N]] pairs but the
                    // translation dropped some closing markers (Apple
                    // Translation sometimes strips mathematical brackets from
                    // segments consisting mainly of proper nouns), fall back to
                    // the original so the inline structure is preserved.
                    let orig_close = original.matches("[[/").count();
                    let decoded_close = decoded.matches("[[/").count();
                    if orig_close > 0 && decoded_close < orig_close {
                        original.clone()
                    } else {
                        decoded
                    }
                })
                .collect();
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

/// Returns true if the app is running on macOS, false on other platforms.
/// Used by the frontend to decide whether to show (but disable) or hide the
/// translation UI entirely on non-macOS systems.
#[tauri::command]
pub fn is_macos() -> bool {
    cfg!(target_os = "macos")
}

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

    let (texts, param_map, code_count, tc_count, bc_count) = extract_block_texts(&note.content)?;
    if texts.is_empty() {
        return Err("No translatable text found".to_owned());
    }

    let translated = translate_texts(&texts, &source_lang, &target_lang)?;

    let translated_content = merge_translated_texts(
        &note.content,
        &translated,
        &param_map,
        code_count,
        tc_count,
        bc_count,
    )?;
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
    let (texts, param_map, code_count, tc_count, bc_count) = extract_block_texts(&content)?;
    if texts.is_empty() {
        return Err("No translatable text found".to_owned());
    }
    let translated = translate_texts(&texts, &source_lang, &target_lang)?;
    merge_translated_texts(
        &content,
        &translated,
        &param_map,
        code_count,
        tc_count,
        bc_count,
    )
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
            let encoded = encode_for_translation(&text);
            let result = unsafe {
                scripta_translate_single(
                    &SRString::from(encoded.as_str()),
                    &SRString::from(source_lang.as_str()),
                    &SRString::from(target_lang.as_str()),
                )
            };
            let translated = decode_from_translation(result.as_str());
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

/// Synchronous single-text translation for internal callers.
///
/// This avoids the async/encoding overhead of [`translate_text`] and is
/// intended for short plain-text inputs (e.g. note summaries) where
/// BlockNote inline markers are absent.
///
/// # Arguments
///
/// * `text` - The plain text to translate.
/// * `source_lang` - BCP-47 source language code, or `"auto"` for auto-detection.
/// * `target_lang` - BCP-47 target language code (e.g. `"en"`).
///
/// # Returns
///
/// The translated text on success.
///
/// # Errors
///
/// Returns an error if the Swift FFI returns an empty string for non-empty
/// input, indicating a translation failure.
#[cfg(target_os = "macos")]
pub fn translate_plain_sync(
    text: &str,
    source_lang: &str,
    target_lang: &str,
) -> Result<String, String> {
    let result = unsafe {
        scripta_translate_single(
            &SRString::from(text),
            &SRString::from(source_lang),
            &SRString::from(target_lang),
        )
    };
    let translated = result.to_string();
    if translated.is_empty() && !text.is_empty() {
        return Err("Translation failed".to_owned());
    }
    Ok(translated)
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
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "event",
    content = "data"
)]
pub enum TranslationStreamEvent {
    Started {
        total_chunks: usize,
        total_blocks: usize,
        param_map: Vec<String>,
        param_code_count: usize,
        param_tc_count: usize,
        param_bc_count: usize,
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
    let (texts, param_map, param_code_count, param_tc_count, param_bc_count) =
        extract_block_texts(&content)?;
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
            param_map,
            param_code_count,
            param_tc_count,
            param_bc_count,
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
                translate_texts(&chunk.texts, &src, &tgt).or_else(|_| {
                    // Chunk failed: fall back to per-text translation so one
                    // untranslatable text does not block the rest of the chunk.
                    // Texts that still fail are kept as-is (original encoded form,
                    // which the TypeScript decoder will restore with styles intact).
                    let fallback: Vec<String> = chunk
                        .texts
                        .iter()
                        .map(|text| {
                            translate_texts(std::slice::from_ref(text), &src, &tgt)
                                .ok()
                                .and_then(|mut v| v.pop())
                                .unwrap_or_else(|| text.clone())
                        })
                        .collect();
                    Ok::<Vec<String>, String>(fallback)
                })
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
                Ok(Err(_)) => unreachable!("or_else always succeeds"),
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

    /// Encode helper: creates a fresh EncoderState and returns just the encoded string.
    fn encode(inline: &[Value]) -> String {
        let mut state = EncoderState::new();
        encode_inline_content(inline, &mut state)
    }

    /// Decode helper: decodes with a given param_map and section counts.
    fn decode_with(
        encoded: &str,
        param_map: &[&str],
        code_count: usize,
        tc_count: usize,
        bc_count: usize,
    ) -> Vec<Value> {
        let pm: Vec<String> = param_map.iter().map(|s| s.to_string()).collect();
        let mut state = DecoderState::new(&pm, code_count, tc_count, bc_count);
        decode_inline_content_with_state(encoded, &mut state)
    }

    #[test]
    fn test_encode_plain_text() {
        let inline = vec![plain("Hello world")];
        assert_eq!(encode(&inline), "Hello world");
    }

    #[test]
    fn test_encode_bold() {
        let inline = vec![plain("Hello "), text_node("world", json!({"bold": true}))];
        assert_eq!(encode(&inline), "Hello [[1]]world[[/1]]");
    }

    #[test]
    fn test_encode_italic() {
        let inline = vec![text_node("ciao", json!({"italic": true}))];
        assert_eq!(encode(&inline), "[[2]]ciao[[/2]]");
    }

    #[test]
    fn test_encode_code() {
        // Code text is stored in param_map; the encoded token has empty content.
        let inline = vec![plain("use "), text_node("rm -rf", json!({"code": true}))];
        assert_eq!(encode(&inline), "use [[0]][[/0]]");
    }

    #[test]
    fn test_encode_combined_styles() {
        let inline = vec![text_node(
            "bold italic",
            json!({"bold": true, "italic": true}),
        )];
        assert_eq!(encode(&inline), "[[1]][[2]]bold italic[[/2]][[/1]]");
    }

    #[test]
    fn test_encode_text_color() {
        let inline = vec![text_node("red text", json!({"textColor": "#ff0000"}))];
        assert_eq!(encode(&inline), "[[5]]red text[[/5]]");
    }

    #[test]
    fn test_encode_bg_color() {
        let inline = vec![text_node(
            "highlighted",
            json!({"backgroundColor": "#ffff00"}),
        )];
        assert_eq!(encode(&inline), "[[9]]highlighted[[/9]]");
    }

    #[test]
    fn test_encode_link() {
        let inline = vec![
            plain("click "),
            json!({"type": "link", "href": "https://example.com", "content": [plain("here")]}),
        ];
        assert_eq!(encode(&inline), "click [[7]]here[[/7]]");
    }

    #[test]
    fn test_encode_link_with_styled_text() {
        let inline = vec![json!({
            "type": "link",
            "href": "https://example.com",
            "content": [text_node("styled link", json!({"bold": true, "italic": true}))]
        })];
        assert_eq!(
            encode(&inline),
            "[[7]][[1]][[2]]styled link[[/2]][[/1]][[/7]]"
        );
    }

    #[test]
    fn test_decode_plain() {
        let result = decode_with("Hello world", &[], 0, 0, 0);
        assert_eq!(result, vec![plain("Hello world")]);
    }

    #[test]
    fn test_decode_bold() {
        let result = decode_with("Hello [[1]]world[[/1]]", &[], 0, 0, 0);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0], plain("Hello "));
        assert_eq!(result[1], text_node("world", json!({"bold": true})));
    }

    #[test]
    fn test_decode_code() {
        // Code text comes from param_map; close marker is [[/0]].
        let result = decode_with("This is [[0]][[/0]] text", &["code"], 1, 0, 0);
        assert_eq!(result.len(), 3);
        assert_eq!(result[1], text_node("code", json!({"code": true})));
    }

    #[test]
    fn test_decode_link() {
        // link href comes from param_map section [code_count+tc_count+bc_count..)
        let result = decode_with("[[7]]click here[[/7]]", &["https://example.com"], 0, 0, 0);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0]["type"], "link");
        assert_eq!(result[0]["href"], "https://example.com");
    }

    #[test]
    fn test_decode_link_with_styles() {
        let result = decode_with("[[7]][[1]]link[[/1]][[/7]]", &["https://x.com"], 0, 0, 0);
        assert_eq!(result.len(), 1);
        let content = result[0]["content"].as_array().unwrap();
        assert_eq!(content.len(), 1);
        assert_eq!(content[0], text_node("link", json!({"bold": true})));
    }

    #[test]
    fn test_decode_text_color() {
        // param_map: ["#ff0000"] with code_count=0, tc_count=1, bc_count=0
        let result = decode_with("[[5]]red text[[/5]]", &["#ff0000"], 0, 1, 0);
        assert_eq!(result.len(), 1);
        assert_eq!(
            result[0],
            text_node("red text", json!({"textColor": "#ff0000"}))
        );
    }

    #[test]
    fn test_decode_combined_styles() {
        let result = decode_with("[[1]][[2]]bold italic[[/2]][[/1]]", &[], 0, 0, 0);
        assert_eq!(result.len(), 1);
        assert_eq!(
            result[0],
            text_node("bold italic", json!({"bold": true, "italic": true}))
        );
    }

    #[test]
    fn test_decode_malformed_fallback() {
        let result = decode_with("[[unknown]]stuff", &[], 0, 0, 0);
        // Unknown key → falls back to plain text node
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], plain("[[unknown]]stuff"));
    }

    #[test]
    fn test_decode_double_bracket_in_text() {
        let result = decode_with("normal [[ text", &[], 0, 0, 0);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0], plain("normal [[ text"));
    }

    #[test]
    fn test_roundtrip_bold() {
        let inline = vec![plain("Hello "), text_node("world", json!({"bold": true}))];
        let encoded = encode(&inline);
        let decoded = decode_with(&encoded, &[], 0, 0, 0);
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
        let mut enc_state = EncoderState::new();
        let encoded = encode_inline_content(&inline, &mut enc_state);
        let code_count = enc_state.code_count();
        let tc_count = enc_state.tc_count();
        let bc_count = enc_state.bc_count();
        let param_map = enc_state.into_param_map();
        let pm_refs: Vec<&str> = param_map.iter().map(|s| s.as_str()).collect();
        let decoded = decode_with(&encoded, &pm_refs, code_count, tc_count, bc_count);
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
        let (texts, _param_map, _code_count, _tc_count, _bc_count) =
            extract_block_texts(&blocks.to_string()).unwrap();
        assert_eq!(texts, vec!["Hello [[1]]world[[/1]]!"]);
    }
}
