mod db;
mod file_io;
mod groups;
mod link_preview;

use tauri::Manager;
use tauri_plugin_window_state::StateFlags;

/// Initializes and runs the Tauri application.
///
/// Sets up the following plugins before starting the event loop:
///
/// - **opener** — OS-native file/URL opening.
/// - **store** — Persistent key-value config storage.
/// - **dialog** — Native file/message dialogs.
/// - **fs** — Scoped filesystem access.
/// - **window-state** — Saves and optionally restores window position and
///   size across launches (initial restore is skipped for the `"main"`
///   window so the frontend can decide via a user setting).
///
/// During setup the SQLite database is initialized and a
/// [`LinkPreviewCache`](link_preview::LinkPreviewCache) is registered as
/// managed state. All note CRUD and utility commands are then registered
/// via the invoke handler.
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
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::POSITION | StateFlags::SIZE)
                .skip_initial_state("main")
                .build(),
        )
        .setup(|app| {
            db::init_db(app.handle())?;
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
