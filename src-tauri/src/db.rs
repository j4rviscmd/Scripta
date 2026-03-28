use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

/// Column projection used by every SELECT on the `notes` table.
///
/// Order must match the indices expected by [`note_from_row`].
const NOTE_COLUMNS: &str =
    "id, title, content, created_at, updated_at, is_pinned, group_id, is_locked";

/// Application-level wrapper around a mutex-guarded SQLite connection.
///
/// Registered as Tauri managed state via [`init_db`] so that every
/// [`#[tauri::command]`] handler can access the database through
/// `tauri::State<DbState>`.
///
/// The inner [`Mutex`] is poisoned if a thread panics while holding the lock;
/// all command handlers propagate the poison error as a `String` to the
/// frontend.
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
    /// Whether the note is pinned to the top of the sidebar.
    pub is_pinned: bool,
    /// The UUID of the group this note belongs to, or `None` for uncategorized.
    pub group_id: Option<String>,
    /// Whether the note is locked (read-only).
    pub is_locked: bool,
}

/// Maps a single result row from the `notes` table to a [`Note`] struct.
///
/// Column order must match the projection used in every SELECT that calls
/// this function: `id, title, content, created_at, updated_at, is_pinned, group_id, is_locked`.
pub(crate) fn note_from_row(row: &rusqlite::Row) -> Result<Note, rusqlite::Error> {
    Ok(Note {
        id: row.get(0)?,
        title: row.get(1)?,
        content: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        is_pinned: row.get(5)?,
        group_id: row.get(6)?,
        is_locked: row.get(7)?,
    })
}

/// Resolves the filesystem path to the SQLite database file.
///
/// The database is stored in the platform-specific application data
/// directory (e.g. `~/Library/Application Support/com.scripta.app/scripta.db`
/// on macOS). The parent directory is created automatically if it does not
/// exist.
///
/// # Errors
///
/// Returns a `String` if the application data directory cannot be resolved
/// or the directory creation fails.
fn db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?;
    std::fs::create_dir_all(&app_dir).map_err(|e| format!("failed to create app data dir: {e}"))?;
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
             updated_at  TEXT NOT NULL,
             is_pinned   INTEGER NOT NULL DEFAULT 0
         );

         CREATE TABLE IF NOT EXISTS groups (
             id          TEXT PRIMARY KEY,
             name        TEXT NOT NULL,
             sort_order  INTEGER NOT NULL DEFAULT 0,
             created_at  TEXT NOT NULL DEFAULT '',
             updated_at  TEXT NOT NULL DEFAULT ''
         );",
    )
    .map_err(|e| format!("failed to init schema: {e}"))?;

    // Migration: add is_pinned column if it does not exist (existing databases).
    let _ = conn.execute(
        "ALTER TABLE notes ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0",
        [],
    );

    // Migration: add group_id column if it does not exist.
    let _ = conn.execute(
        "ALTER TABLE notes ADD COLUMN group_id TEXT REFERENCES groups(id) ON DELETE SET NULL",
        [],
    );

    // Migration: add is_locked column if it does not exist.
    let _ = conn.execute(
        "ALTER TABLE notes ADD COLUMN is_locked INTEGER NOT NULL DEFAULT 0",
        [],
    );

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
        .prepare(&format!("SELECT {NOTE_COLUMNS} FROM notes WHERE id = ?1"))
        .map_err(|e| e.to_string())?;

    let note = stmt.query_row([&id], note_from_row).ok();

    Ok(note)
}

/// Returns all notes sorted by most recently updated first.
///
/// Pinned notes (`is_pinned = true`) are always placed at the top of the
/// result set regardless of their `updated_at` value.
///
/// # Arguments
///
/// * `state` - Managed database state injected by Tauri.
///
/// # Returns
///
/// A vector of [`Note`] entries ordered by `is_pinned DESC, updated_at DESC`.
///
/// # Errors
///
/// Returns a `String` if the database lock is poisoned or the query fails.
#[tauri::command]
pub fn list_notes(state: tauri::State<DbState>) -> Result<Vec<Note>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!(
            "SELECT {NOTE_COLUMNS} FROM notes ORDER BY is_pinned DESC, updated_at DESC"
        ))
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
        "INSERT INTO notes (id, title, content, created_at, updated_at, is_pinned, group_id, is_locked) VALUES (?1, ?2, ?3, ?4, ?5, 0, NULL, 0)",
        rusqlite::params![id, title, content, now, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(Note {
        id,
        title,
        content,
        created_at: now.clone(),
        updated_at: now,
        is_pinned: false,
        group_id: None,
        is_locked: false,
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
            &format!("SELECT {NOTE_COLUMNS} FROM notes WHERE id = ?1"),
            rusqlite::params![id],
            note_from_row,
        )
        .map_err(|e| e.to_string())?;

    Ok(note)
}

/// Toggles the pinned state of a note.
///
/// # Arguments
///
/// * `state` - Managed database state injected by Tauri.
/// * `id` - The UUID of the note to pin or unpin.
/// * `pinned` - `true` to pin, `false` to unpin.
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
pub fn toggle_pin(state: tauri::State<DbState>, id: String, pinned: bool) -> Result<Note, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE notes SET is_pinned = ?1 WHERE id = ?2",
        rusqlite::params![pinned as i32, id],
    )
    .map_err(|e| e.to_string())?;

    let note = conn
        .query_row(
            &format!("SELECT {NOTE_COLUMNS} FROM notes WHERE id = ?1"),
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

/// Duplicates an existing note, copying its content and group membership.
///
/// The duplicated note receives a new UUID, a title suffixed with " (copy)",
/// `is_pinned = false`, and the same `group_id` as the original.
///
/// # Arguments
///
/// * `state` - Managed database state injected by Tauri.
/// * `id` - The UUID of the note to duplicate.
///
/// # Returns
///
/// The newly created [`Note`].
///
/// # Errors
///
/// Returns a `String` if the database lock is poisoned, the source note is
/// not found, or the INSERT fails.
#[tauri::command]
pub fn duplicate_note(state: tauri::State<DbState>, id: String) -> Result<Note, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let source = conn
        .query_row(
            &format!("SELECT {NOTE_COLUMNS} FROM notes WHERE id = ?1"),
            rusqlite::params![id],
            note_from_row,
        )
        .map_err(|e| e.to_string())?;

    let new_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let title = format!("{} (copy)", source.title);

    // Update the first heading block's text in the content JSON so the H1
    // heading also carries the "(copy)" suffix, matching the sidebar label.
    let content = rewrite_first_heading(&source.content, &title);

    conn.execute(
        "INSERT INTO notes (id, title, content, created_at, updated_at, is_pinned, group_id, is_locked) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, 0)",
        rusqlite::params![new_id, title, content, now, now, source.group_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(Note {
        id: new_id,
        title,
        content,
        created_at: now.clone(),
        updated_at: now,
        is_pinned: false,
        group_id: source.group_id,
        is_locked: false,
    })
}

/// Toggles the locked (read-only) state of a note.
///
/// When a note is locked, the frontend disables editing and suppresses auto-save.
///
/// # Arguments
///
/// * `state` - Managed database state injected by Tauri.
/// * `id` - The UUID of the note to lock or unlock.
/// * `locked` - `true` to lock, `false` to unlock.
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
pub fn toggle_lock(state: tauri::State<DbState>, id: String, locked: bool) -> Result<Note, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE notes SET is_locked = ?1, updated_at = datetime('now') WHERE id = ?2",
        rusqlite::params![locked, id],
    )
    .map_err(|e| e.to_string())?;

    let note = conn
        .query_row(
            &format!("SELECT {NOTE_COLUMNS} FROM notes WHERE id = ?1"),
            rusqlite::params![id],
            note_from_row,
        )
        .map_err(|e| e.to_string())?;

    Ok(note)
}

/// Rewrites the text of the first heading block in a BlockNote content JSON.
///
/// BlockNote content is a JSON array of block objects.  Each block may have a
/// `content` array of inline objects whose `text` field holds the visible
/// string.  This function finds the first block whose `type` is `"heading"`
/// and replaces the **concatenated** text of its inline content with `new_title`.
///
/// If the content cannot be parsed or no heading block is found, the original
/// content string is returned unchanged.
fn rewrite_first_heading(content_json: &str, new_title: &str) -> String {
    let mut blocks: Vec<serde_json::Value> = match serde_json::from_str(content_json) {
        Ok(v) => v,
        Err(_) => return content_json.to_owned(),
    };

    for block in blocks.iter_mut() {
        let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if block_type != "heading" {
            continue;
        }
        if let Some(inline_content) = block.get_mut("content").and_then(|c| c.as_array_mut()) {
            if let Some(first_inline) = inline_content.first_mut() {
                first_inline["text"] = serde_json::Value::String(new_title.to_owned());
            }
            // Truncate any additional inline nodes after the first so the
            // title stays coherent (e.g. bold prefix + plain suffix).
            inline_content.truncate(1);
            break;
        }
    }

    serde_json::to_string(&blocks).unwrap_or_else(|_| content_json.to_owned())
}
