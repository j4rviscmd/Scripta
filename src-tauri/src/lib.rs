mod db;
mod file_io;
mod groups;
mod link_preview;
mod window;

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Manager;

/// Initializes and runs the Tauri application.
///
/// Sets up the following plugins before starting the event loop:
///
/// - **opener** — OS-native file/URL opening.
/// - **store** — Persistent key-value config storage.
/// - **dialog** — Native file/message dialogs.
/// - **fs** — Scoped filesystem access.
///
/// During setup the SQLite database is initialized, a
/// [`LinkPreviewCache`](link_preview::LinkPreviewCache) is registered as
/// managed state, and the main window is created via
/// [`window::create_main_window`]. Window position and size are restored
/// from `config.json` when the user has enabled the setting; otherwise
/// the window opens at the default 1200×800 dimensions.
///
/// On window close the current geometry is persisted to `config.json`
/// so it can be restored on the next launch.
///
/// # Panics
///
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
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            db::init_db(app.handle())?;
            app.manage(link_preview::LinkPreviewCache(Mutex::new(
                HashMap::new(),
            )));
            window::create_main_window(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                window::save_window_geometry(window.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            db::get_note,
            db::list_notes,
            db::create_note,
            db::update_note,
            db::delete_note,
            db::duplicate_note,
            db::toggle_pin,
            groups::list_groups,
            groups::create_group,
            groups::rename_group,
            groups::delete_group,
            groups::reorder_groups,
            groups::set_note_group,
            link_preview::fetch_link_title,
            file_io::read_text_file,
            file_io::write_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
