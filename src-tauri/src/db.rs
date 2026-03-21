use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

/// Application-level wrapper around a mutex-guarded SQLite connection.
///
/// Registered as Tauri managed state via [`init_db`] so that every
/// [`#[tauri::command]`] handler can access the database through
/// `tauri::State<DbState>`.
pub struct DbState(pub Mutex<rusqlite::Connection>);

/// A single note stored in the database.
///
/// Serialized with `camelCase` field names when crossing the FFI boundary
/// so that the TypeScript frontend receives `createdAt` / `updatedAt`.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    /// UUID v4 primary key.
    pub id: String,
    /// User-visible title extracted from the first heading block.
    pub title: String,
    /// Raw BlockNote document JSON (array of block objects).
    pub content: String,
    /// RFC 3339 timestamp of when the note was created.
    pub created_at: String,
    /// RFC 3339 timestamp of when the note was last modified.
    pub updated_at: String,
}

/// Maps a single result row from the `notes` table to a [`Note`] struct.
///
/// Column order must match the projection used in every SELECT that calls
/// this function: `id, title, content, created_at, updated_at`.
fn note_from_row(row: &rusqlite::Row) -> Result<Note, rusqlite::Error> {
    Ok(Note {
        id: row.get(0)?,
        title: row.get(1)?,
        content: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

/// Resolves the filesystem path to the SQLite database file.
///
/// The database is stored in the platform-specific application data
/// directory (e.g. `~/Library/Application Support/com.scripta.app/scripta.db`
/// on macOS). The parent directory is created automatically if it does not
/// exist.
fn db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("failed to create app data dir: {e}"))?;
    Ok(app_dir.join("scripta.db"))
}

/// Opens (or creates) the SQLite database and registers the connection as
/// managed state.
///
/// This function must be called once during application startup, before any
/// command handler that accesses [`DbState`]. It enables WAL journal mode
/// for improved concurrent read performance and foreign-key enforcement.
///
/// # Errors
///
/// Returns a `String` if the database file cannot be opened or the schema
/// migration fails.
pub fn init_db(app: &tauri::AppHandle) -> Result<(), String> {
    let path = db_path(app)?;
    let conn = rusqlite::Connection::open(&path).map_err(|e| format!("failed to open db: {e}"))?;

    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = ON;

         CREATE TABLE IF NOT EXISTS notes (
             id          TEXT PRIMARY KEY,
             title       TEXT NOT NULL DEFAULT '',
             content     TEXT NOT NULL DEFAULT '[]',
             created_at  TEXT NOT NULL,
             updated_at  TEXT NOT NULL
         );",
    )
    .map_err(|e| format!("failed to init schema: {e}"))?;

    app.manage(DbState(Mutex::new(conn)));
    Ok(())
}

/// Retrieves a single note by its UUID.
///
/// # Arguments
///
/// * `state` - Managed database state injected by Tauri.
/// * `id` - The UUID of the note to fetch.
///
/// # Returns
///
/// `Ok(Some(Note))` when a matching row exists, `Ok(None)` otherwise.
///
/// # Errors
///
/// Returns a `String` if the database lock is poisoned or the query fails.
#[tauri::command]
pub fn get_note(state: tauri::State<DbState>, id: String) -> Result<Option<Note>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, title, content, created_at, updated_at FROM notes WHERE id = ?1")
        .map_err(|e| e.to_string())?;

    let note = stmt.query_row([&id], note_from_row).ok();

    Ok(note)
}

/// Returns all notes sorted by most recently updated first.
///
/// # Arguments
///
/// * `state` - Managed database state injected by Tauri.
///
/// # Returns
///
/// A vector of [`Note`] entries ordered by `updated_at DESC`.
///
/// # Errors
///
/// Returns a `String` if the database lock is poisoned or the query fails.
#[tauri::command]
pub fn list_notes(state: tauri::State<DbState>) -> Result<Vec<Note>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, title, content, created_at, updated_at FROM notes ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let notes = stmt
        .query_map([], note_from_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(notes)
}

/// Creates a new note with a generated UUID v4 and the current timestamp.
///
/// # Arguments
///
/// * `state` - Managed database state injected by Tauri.
/// * `title` - The display title for the new note.
/// * `content` - The raw BlockNote document JSON content.
///
/// # Returns
///
/// The newly created [`Note`] with all fields populated, including the
/// generated `id`, `created_at`, and `updated_at` timestamps.
///
/// # Errors
///
/// Returns a `String` if the database lock is poisoned or the INSERT fails.
#[tauri::command]
pub fn create_note(
    state: tauri::State<DbState>,
    title: String,
    content: String,
) -> Result<Note, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO notes (id, title, content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, title, content, now, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(Note {
        id,
        title,
        content,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// Updates an existing note's title, content, and `updated_at` timestamp.
///
/// Performs the UPDATE and a subsequent SELECT within a single lock scope
/// to avoid TOCTOU race conditions.
///
/// # Arguments
///
/// * `state` - Managed database state injected by Tauri.
/// * `id` - The UUID of the note to update.
/// * `title` - The new display title.
/// * `content` - The new raw BlockNote document JSON content.
///
/// # Returns
///
/// The updated [`Note`] as it exists in the database after the write.
///
/// # Errors
///
/// Returns a `String` if the database lock is poisoned, the UPDATE fails,
/// or the note is not found after the update.
#[tauri::command]
pub fn update_note(
    state: tauri::State<DbState>,
    id: String,
    title: String,
    content: String,
) -> Result<Note, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE notes SET title = ?1, content = ?2, updated_at = ?3 WHERE id = ?4",
        rusqlite::params![title, content, now, id],
    )
    .map_err(|e| e.to_string())?;

    let note = conn
        .query_row(
            "SELECT id, title, content, created_at, updated_at FROM notes WHERE id = ?1",
            rusqlite::params![id],
            note_from_row,
        )
        .map_err(|e| e.to_string())?;

    Ok(note)
}

/// Permanently deletes a note by its UUID.
///
/// # Arguments
///
/// * `state` - Managed database state injected by Tauri.
/// * `id` - The UUID of the note to delete.
///
/// # Errors
///
/// Returns a `String` if the database lock is poisoned or the DELETE fails.
/// Deleting a non-existent ID is not treated as an error.
#[tauri::command]
pub fn delete_note(state: tauri::State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM notes WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
