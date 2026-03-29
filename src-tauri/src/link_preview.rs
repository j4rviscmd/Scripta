use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Mutex;
use std::time::Duration;

use reqwest::redirect::Policy;
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
///
/// # Errors
///
/// Returns a `String` describing the parse error when `url` is not a valid
/// [`reqwest::Url`], or when the scheme is anything other than `http` or `https`.
fn validate_url(url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("invalid URL: {e}"))?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed),
        other => Err(format!(
            "unsupported scheme '{other}', only http/https allowed"
        )),
    }
}

/// Returns `true` if the IP address belongs to a private, loopback,
/// link-local, or cloud-metadata range.
///
/// For IPv4 this covers the private (`10.0.0.0/8`, `172.16.0.0/12`,
/// `192.168.0.0/16`), loopback (`127.0.0.0/8`), and link-local
/// (`169.254.0.0/16`, which includes cloud-metadata endpoints).
///
/// For IPv6 this covers the loopback (`::1`), unique-local (`fc00::/7`),
/// and link-local (`fe80::/10`) ranges.
fn is_private_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => v4.is_private() || v4.is_loopback() || v4.is_link_local(),
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || (v6.segments()[0] & 0xffc0) == 0xfe80 // link-local fe80::/10
                || (v6.segments()[0] & 0xfe00) == 0xfc00 // unique local fc00::/7
        }
    }
}

/// Resolves the host of `url` and rejects private/reserved IP addresses.
///
/// This is the core SSRF (Server-Side Request Forgery) guard. It performs a
/// DNS lookup on the URL's host and rejects the request if **any** resolved
/// address falls within a private or reserved range (see [`is_private_ip`]).
///
/// # Errors
///
/// Returns a `String` if the URL has no host, DNS resolution fails, or any
/// resolved IP address is private/reserved.
fn check_ssrf(url: &reqwest::Url) -> Result<(), String> {
    let host = url
        .host_str()
        .ok_or_else(|| "URL has no host".to_string())?;

    let addrs: Vec<IpAddr> = std::net::ToSocketAddrs::to_socket_addrs(&format!("{host}:0"))
        .map_err(|e| format!("DNS resolution failed: {e}"))?
        .map(|a| a.ip())
        .collect();

    if let Some(ip) = addrs.iter().find(|ip| is_private_ip(ip)) {
        return Err(format!("blocked: resolves to private IP {ip}"));
    }

    Ok(())
}

/// Builds a reqwest client with SSRF-safe redirect policy and a timeout.
///
/// # Errors
///
/// Returns a `String` if the client builder fails.
fn build_ssrf_safe_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("Scripta/0.1.0")
        .timeout(Duration::from_secs(FETCH_TIMEOUT_SECS))
        .redirect(Policy::custom(|attempt| {
            if let Err(e) = check_ssrf(attempt.url()) {
                eprintln!("ssrf: redirect blocked: {e}");
                attempt.stop()
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|e| format!("failed to build HTTP client: {e}"))
}

/// Fetches the HTML body of `url` with a timeout, content-type check,
/// and SSRF protection (blocks private/reserved IP addresses including
/// redirect targets).
///
/// The request is sent with a custom User-Agent header (`Scripta/0.1.0`) and
/// a per-redirect SSRF check: if a redirect target resolves to a private IP
/// the redirect is stopped and an error is returned.
///
/// The response body is truncated to [`MAX_BODY_SIZE`] bytes if it exceeds
/// that limit.
///
/// # Errors
///
/// Returns a `String` on URL parse failure, SSRF block, network/timeout
/// errors, non-2xx status codes, non-HTML content types, or non-UTF-8
/// response bodies.
async fn fetch_html(url: &str) -> Result<String, String> {
    let parsed = validate_url(url)?;
    check_ssrf(&parsed)?;

    let client = build_ssrf_safe_client()?;
    let resp = client
        .get(parsed)
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

    String::from_utf8(bytes.into()).map_err(|e| format!("non-UTF-8 response: {e}"))
}

/// Extracts the text content of the first `<title>` element from HTML.
///
/// Leading and trailing whitespace is stripped. Returns `None` if no
/// `<title>` element exists or if its text content is empty after trimming.
fn extract_title(html: &str) -> Option<String> {
    let document = Html::parse_document(html);
    let selector = Selector::parse("title").ok()?;
    let el = document.select(&selector).next()?;
    let text: String = el.text().collect();
    let trimmed = text.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

/// Tauri command: fetches the `<title>` of a URL.
///
/// Returns a cached result when available. On cache miss the page is
/// fetched, parsed, and the result is stored for the session.
///
/// Only `http` and `https` schemes are accepted. Requests targeting
/// private or reserved IP addresses (including through redirects) are
/// blocked by the SSRF protection layer.
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
///
/// # Errors
///
/// Returns a `String` for invalid URLs, SSRF-blocked addresses, network
/// failures, non-2xx HTTP responses, non-HTML content types, or if the
/// internal cache mutex is poisoned.
#[tauri::command]
pub async fn fetch_link_title(
    cache: tauri::State<'_, LinkPreviewCache>,
    url: String,
) -> Result<Option<String>, String> {
    validate_url(&url)?; // Validates scheme; parsed URL discarded (fetch_html re-parses).

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

/// Sends a HEAD request to `url` and returns the `Content-Type` header value.
///
/// Falls back to a GET request with `Range: bytes=0-0` when the server
/// responds with `405 Method Not Allowed`.
///
/// Uses the same SSRF protection, timeout, and redirect policy as
/// [`fetch_link_title`].
///
/// # Errors
///
/// Returns a `String` for invalid URLs, SSRF-blocked addresses, network
/// failures, or non-2xx HTTP responses.
#[tauri::command]
pub async fn check_url_content_type(url: String) -> Result<Option<String>, String> {
    let parsed = validate_url(&url)?;
    check_ssrf(&parsed)?;

    let client = build_ssrf_safe_client()?;

    // Try HEAD first (lightweight).
    let resp = client.head(&url).send().await;

    let resp = match resp {
        Ok(r) if r.status().as_u16() == 405 => {
            // Server doesn't support HEAD; fall back to a minimal GET.
            client
                .get(&url)
                .header("Range", "bytes=0-0")
                .send()
                .await
                .map_err(|e| format!("fetch failed: {e}"))?
        }
        Ok(r) => r,
        Err(e) => return Err(format!("fetch failed: {e}")),
    };

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.to_string());

    Ok(content_type)
}
