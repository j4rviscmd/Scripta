use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use scraper::{Html, Selector};

/// In-memory URL → title cache.
///
/// Must be registered as a Tauri managed state via `app.manage()` before
/// any command that references it is invoked. The cache lives for the
/// entire application session and is not persisted to disk.
///
/// # Example
///
/// ```rust,ignore
/// app.manage(LinkPreviewCache(Mutex::new(HashMap::new())));
/// ```
pub struct LinkPreviewCache(pub Mutex<HashMap<String, String>>);

/// Maximum time to wait for an HTTP response.
const FETCH_TIMEOUT_SECS: u64 = 5;

/// Maximum response body size (256 KB).
const MAX_BODY_SIZE: usize = 256 * 1024;

/// Validates that `url` is a well-formed HTTP or HTTPS URL.
fn validate_url(url: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("invalid URL: {e}"))?;
    match parsed.scheme() {
        "http" | "https" => Ok(()),
        other => Err(format!(
            "unsupported scheme '{other}', only http/https allowed"
        )),
    }
}

/// Fetches the HTML body of `url` with a timeout and content-type check.
async fn fetch_html(url: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Scripta/0.1.0")
        .timeout(Duration::from_secs(FETCH_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("failed to build HTTP client: {e}"))?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("fetch failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    // Reject non-HTML responses.
    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if !content_type.contains("text/html") {
        return Err(format!("unexpected content-type: {content_type}"));
    }

    // Read up to MAX_BODY_SIZE bytes.
    let mut bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("read failed: {e}"))?;
    if bytes.len() > MAX_BODY_SIZE {
        bytes.truncate(MAX_BODY_SIZE);
    }

    String::from_utf8(bytes.to_vec()).map_err(|e| format!("non-UTF-8 response: {e}"))
}

/// Extracts the text content of the first `<title>` element from HTML.
fn extract_title(html: &str) -> Option<String> {
    let document = Html::parse_document(html);
    let selector = Selector::parse("title").ok()?;
    let el = document.select(&selector).next()?;
    let text: String = el.text().collect();
    let trimmed = text.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Tauri command: fetches the `<title>` of a URL.
///
/// Returns a cached result when available. On cache miss the page is
/// fetched, parsed, and the result is stored for the session.
///
/// # Arguments
///
/// * `cache` - Managed in-memory cache injected by Tauri.
/// * `url` - The HTTP/HTTPS URL to scrape.
///
/// # Returns
///
/// `Ok(Some(title))` when a title is found,
/// `Ok(None)` when the page has no `<title>` or the response is non-HTML,
/// `Err(String)` for validation errors or unexpected failures.
#[tauri::command]
pub async fn fetch_link_title(
    cache: tauri::State<'_, LinkPreviewCache>,
    url: String,
) -> Result<Option<String>, String> {
    validate_url(&url)?;

    // Check cache.
    {
        let map = cache.0.lock().map_err(|e| e.to_string())?;
        if let Some(title) = map.get(&url) {
            return Ok(Some(title.clone()));
        }
    }

    let html = fetch_html(&url).await?;
    let title = extract_title(&html);

    // Cache successful results.
    if let Some(ref t) = title {
        let mut map = cache.0.lock().map_err(|e| e.to_string())?;
        map.insert(url, t.clone());
    }

    Ok(title)
}
