/// Initializes and runs the Tauri application.
///
/// Registers the `tauri-plugin-opener` plugin and starts the event loop.
/// Panics if the application context cannot be generated or the runtime
/// fails to start.
///
/// On mobile platforms this function serves as the entry point via the
/// `tauri::mobile_entry_point` attribute.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
