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
