/// Reads a text file and returns its content as a string.
///
/// # Arguments
///
/// * `path` - Absolute path to the file to read.
///
/// # Errors
///
/// Returns a `String` if the file cannot be read or its content is not valid UTF-8.
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("failed to read file: {e}"))
}

/// Writes a string to a text file, creating (or overwriting) the file.
///
/// Parent directories are created automatically if they do not exist.
///
/// # Arguments
///
/// * `path` - Absolute path to the file to write.
/// * `content` - The text content to write.
///
/// # Errors
///
/// Returns a `String` if the file cannot be written.
#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create directories: {e}"))?;
    }
    std::fs::write(&path, &content).map_err(|e| format!("failed to write file: {e}"))
}

/// Downloads a file from a URL and saves it to the given path.
///
/// Handles both remote URLs (via HTTP) and local asset-protocol URLs
/// (by extracting the file path and copying).
///
/// # Arguments
///
/// * `url` - The source URL (remote HTTP or local `asset://localhost/…`).
/// * `dest_path` - Absolute path where the downloaded file should be saved.
///
/// # Errors
///
/// Returns a `String` if the download or file write fails.
#[tauri::command]
pub async fn download_file(url: String, dest_path: String) -> Result<(), String> {
    let data = if let Some(path) = strip_asset_prefix(&url) {
        let decoded = urldecode(path)?;
        std::fs::read(&decoded).map_err(|e| format!("failed to read local file: {e}"))?
    } else {
        let response = reqwest::get(&url)
            .await
            .map_err(|e| format!("failed to download: {e}"))?;
        response
            .bytes()
            .await
            .map_err(|e| format!("failed to read response: {e}"))?
            .to_vec()
    };

    // Ensure parent directory exists
    if let Some(parent) = std::path::Path::new(&dest_path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create directories: {e}"))?;
    }
    std::fs::write(&dest_path, &data).map_err(|e| format!("failed to write file: {e}"))
}

/// Fetches a file from a URL and returns its contents as a Base64-encoded string.
///
/// Handles both remote URLs (via HTTP) and local asset-protocol URLs
/// (by extracting the file path and reading it directly).
/// This is intended for use cases where the file bytes are needed in the frontend
/// without writing to disk (e.g., copying an image to the clipboard).
///
/// # Arguments
///
/// * `url` - The source URL (remote HTTP or local `asset://localhost/…`).
///
/// # Errors
///
/// Returns a `String` error if the file cannot be fetched or read.
#[tauri::command]
pub async fn fetch_image_bytes_base64(url: String) -> Result<String, String> {
    use base64::Engine as _;
    let data = if let Some(path) = strip_asset_prefix(&url) {
        let decoded = urldecode(path)?;
        std::fs::read(&decoded).map_err(|e| format!("failed to read local file: {e}"))?
    } else {
        let response = reqwest::get(&url)
            .await
            .map_err(|e| format!("failed to download: {e}"))?;
        response
            .bytes()
            .await
            .map_err(|e| format!("failed to read response: {e}"))?
            .to_vec()
    };
    Ok(base64::engine::general_purpose::STANDARD.encode(&data))
}

/// Copies an image from a URL directly to the macOS clipboard using `NSPasteboard`.
///
/// Bypasses browser Clipboard API restrictions by fetching the image via Rust
/// and writing it to a temporary file, then invoking `osascript` with the AppKit
/// framework to load the image into `NSPasteboard`.
///
/// Supports all image formats that `NSImage` accepts (PNG, JPEG, GIF, WebP, TIFF).
///
/// # Arguments
///
/// * `url` - The source URL (remote HTTP or local `asset://localhost/…`).
///
/// # Errors
///
/// Returns a `String` error if the fetch, temp-file write, or osascript invocation fails.
#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn copy_image_to_clipboard_native(url: String) -> Result<(), String> {
    let data = if let Some(path) = strip_asset_prefix(&url) {
        let decoded = urldecode(path)?;
        std::fs::read(&decoded).map_err(|e| format!("failed to read local file: {e}"))?
    } else {
        let response = reqwest::get(&url)
            .await
            .map_err(|e| format!("failed to download: {e}"))?;
        response
            .bytes()
            .await
            .map_err(|e| format!("failed to read response: {e}"))?
            .to_vec()
    };

    // Detect format from magic bytes to give NSImage the right file extension.
    let ext = if data.len() >= 8 && data[0..8] == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
        "png"
    } else if data.len() >= 2 && data[0] == 0xFF && data[1] == 0xD8 {
        "jpg"
    } else if data.len() >= 3 && &data[0..3] == b"GIF" {
        "gif"
    } else if data.len() >= 12 && &data[0..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        "webp"
    } else {
        "png"
    };

    let temp_path = std::env::temp_dir().join(format!("scripta_clipboard_img.{ext}"));
    std::fs::write(&temp_path, &data).map_err(|e| format!("failed to write temp file: {e}"))?;

    let temp_path_str = temp_path.to_string_lossy().to_string();

    // Write to NSPasteboard via osascript (available on all macOS versions >= 10.10).
    let status = std::process::Command::new("osascript")
        .args(["-e", "use framework \"AppKit\""])
        .args(["-e", "use scripting additions"])
        .args([
            "-e",
            &format!(
                "set theImage to current application's NSImage's alloc()'s initWithContentsOfFile_(\"{}\")",
                temp_path_str
            ),
        ])
        .args(["-e", "if theImage is missing value then error \"image load failed\""])
        .args(["-e", "set pb to current application's NSPasteboard's generalPasteboard()"])
        .args(["-e", "pb's clearContents()"])
        .args(["-e", "pb's writeObjects_({theImage})"])
        .status()
        .map_err(|e| format!("failed to run osascript: {e}"))?;

    let _ = std::fs::remove_file(&temp_path);

    if !status.success() {
        return Err("failed to write image to clipboard".to_string());
    }

    Ok(())
}

/// Strips a recognised asset-protocol prefix from `url`, returning the
/// encoded path suffix (including the leading `/`), or `None` if the URL
/// is not an asset-protocol URL.
fn strip_asset_prefix(url: &str) -> Option<&str> {
    url.strip_prefix("asset://localhost")
        .or_else(|| url.strip_prefix("https://asset.localhost"))
}

/// Percent-decodes a URL path component.
fn urldecode(s: &str) -> Result<String, String> {
    let mut result = Vec::new();
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(hi), Some(lo)) = (
                char::from(bytes[i + 1]).to_digit(16),
                char::from(bytes[i + 2]).to_digit(16),
            ) {
                result.push((hi * 16 + lo) as u8);
                i += 3;
                continue;
            }
        }
        result.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(result).map_err(|e| format!("invalid UTF-8 in asset URL path: {e}"))
}
