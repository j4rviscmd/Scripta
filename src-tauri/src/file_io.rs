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
