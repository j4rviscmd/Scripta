// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Application entry point.
///
/// Delegates to [`scripta_lib::run`] which builds and launches the Tauri
/// runtime. In release builds on Windows the console window is suppressed.
fn main() {
    scripta_lib::run()
}
