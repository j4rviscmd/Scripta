//! Window creation and geometry persistence.
//!
//! This module is responsible for creating the main application window
//! and saving/restoring its position and size across launches. The
//! geometry is stored in `config.json` via the Tauri store plugin and
//! only restored when the user has enabled the
//! `windowStateRestoreEnabled` setting.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_store::StoreExt;

/// Default window width in logical pixels when no saved geometry is restored.
const DEFAULT_WIDTH: f64 = 1200.0;

/// Default window height in logical pixels when no saved geometry is restored.
const DEFAULT_HEIGHT: f64 = 800.0;

/// Title displayed in the window title bar at creation time.
const WINDOW_TITLE: &str = "Scripta";

/// Store key under which the serialized [`WindowGeometry`] is persisted in `config.json`.
const GEOMETRY_STORE_KEY: &str = "windowGeometry";

/// Store key for the boolean flag that controls whether saved geometry
/// is applied on startup. Mirrors the frontend constant in
/// `windowStateConfig.ts`.
const RESTORE_ENABLED_KEY: &str = "windowStateRestoreEnabled";

/// Saved window geometry in logical (DPI-independent) coordinates.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WindowGeometry {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

/// Creates the main application window.
///
/// Reads `config.json` to determine whether to restore the previous
/// window position and size. When restoration is enabled and valid
/// saved geometry exists within the visible monitor area, the window
/// opens at the saved coordinates. Otherwise it opens at the default
/// 1200×800 size, centred by the OS.
///
/// The window is created with `resizable(false)` and
/// `maximizable(false)` so the splash screen cannot be resized.
/// The frontend unlocks these constraints once the splash has faded
/// out.
pub fn create_main_window(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let geometry = read_saved_geometry(app);

    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title(WINDOW_TITLE)
        .resizable(false)
        .maximizable(false);

    match geometry {
        Some(geo) => {
            builder = builder
                .inner_size(geo.width, geo.height)
                .position(geo.x, geo.y);
        }
        None => {
            builder = builder.inner_size(DEFAULT_WIDTH, DEFAULT_HEIGHT);
            // Position is omitted so the OS centres the window.
        }
    }

    builder.build()?;
    Ok(())
}

/// Saves the current window geometry (logical coordinates) to `config.json`.
///
/// Called from the `CloseRequested` window event handler so the
/// position and size are persisted for the next launch.
pub fn save_window_geometry(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    let scale = match window.scale_factor() {
        Ok(s) => s,
        Err(_) => return,
    };
    let Ok(pos) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.inner_size() else {
        return;
    };

    let geo = WindowGeometry {
        x: pos.x as f64 / scale,
        y: pos.y as f64 / scale,
        width: size.width as f64 / scale,
        height: size.height as f64 / scale,
    };

    if let Ok(store) = app.store("config.json") {
        store.set(
            GEOMETRY_STORE_KEY,
            serde_json::to_value(&geo).unwrap_or_default(),
        );
    }
}

/// Reads the saved geometry from `config.json` if restoration is
/// enabled and the saved position is within a visible monitor.
///
/// Returns `None` when:
/// - The `windowStateRestoreEnabled` setting is `false`.
/// - No saved geometry exists.
/// - The saved position is outside all connected monitors (e.g. an
///   external monitor was disconnected).
fn read_saved_geometry(app: &AppHandle) -> Option<WindowGeometry> {
    let store = app.store("config.json").ok()?;

    let restore_enabled = store
        .get(RESTORE_ENABLED_KEY)
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    if !restore_enabled {
        return None;
    }

    let raw = store.get(GEOMETRY_STORE_KEY)?;
    let geo: WindowGeometry = serde_json::from_value(raw).ok()?;

    if geo.width <= 0.0 || geo.height <= 0.0 {
        return None;
    }

    if is_position_on_screen(app, geo.x, geo.y) {
        Some(geo)
    } else {
        None
    }
}

/// Returns `true` when the given logical position falls within at
/// least one connected monitor.
fn is_position_on_screen(app: &AppHandle, x: f64, y: f64) -> bool {
    let monitors = match app.available_monitors() {
        Ok(m) => m,
        Err(_) => return true, // assume on-screen when detection fails
    };

    if monitors.is_empty() {
        return true;
    }

    monitors.iter().any(|m| {
        let pos = m.position();
        let size = m.size();
        let scale = m.scale_factor();
        let mx = pos.x as f64 / scale;
        let my = pos.y as f64 / scale;
        let mw = size.width as f64 / scale;
        let mh = size.height as f64 / scale;

        x >= mx && x < mx + mw && y >= my && y < my + mh
    })
}
