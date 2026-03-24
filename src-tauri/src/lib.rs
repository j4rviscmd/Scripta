mod db;
mod file_io;
mod link_preview;

use tauri::Manager;

/// Initializes and runs the Tauri application.
///
/// Initializes the SQLite database, registers the `tauri-plugin-opener`
/// plugin, registers all note CRUD commands, and starts the event loop.
/// Panics if the application context cannot be generated or the runtime
/// fails to start.
///
/// On mobile platforms this function serves as the entry point via the
/// `tauri::mobile_entry_point` attribute.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            db::init_db(&app.handle())?;
            app.manage(link_preview::LinkPreviewCache(std::sync::Mutex::new(
                std::collections::HashMap::new(),
            )));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::get_note,
            db::list_notes,
            db::create_note,
            db::update_note,
            db::delete_note,
            db::toggle_pin,
            link_preview::fetch_link_title,
            file_io::read_text_file,
            file_io::write_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
