use serde::{Deserialize, Serialize};

use crate::db::DbState;

/// A note group used to organise notes in the sidebar.
///
/// Groups are ordered by `sort_order` and displayed as collapsible sections.
/// Each note may belong to at most one group; notes without a group are shown
/// in an "Uncategorized" section.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Group {
    /// UUID v4 primary key.
    pub id: String,
    /// User-visible display name.
    pub name: String,
    /// Position in the sidebar (lower values appear first).
    pub sort_order: i32,
    /// RFC 3339 timestamp of when the group was created.
    pub created_at: String,
    /// RFC 3339 timestamp of when the group was last modified.
    pub updated_at: String,
}

/// Maps a single result row from the `groups` table to a [`Group`] struct.
fn group_from_row(row: &rusqlite::Row) -> Result<Group, rusqlite::Error> {
    Ok(Group {
        id: row.get(0)?,
        name: row.get(1)?,
        sort_order: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

/// Returns all groups sorted by their display order.
///
/// # Arguments
///
/// * `state` - Managed database state injected by Tauri.
///
/// # Returns
///
/// A vector of [`Group`] entries ordered by `sort_order ASC`.
///
/// # Errors
///
/// Returns a `String` if the database lock is poisoned or the query fails.
#[tauri::command]
pub fn list_groups(state: tauri::State<DbState>) -> Result<Vec<Group>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, sort_order, created_at, updated_at FROM groups ORDER BY sort_order ASC")
        .map_err(|e| e.to_string())?;

    let groups = stmt
        .query_map([], group_from_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(groups)
}

/// Creates a new group with a generated UUID and the next sort order.
///
/// The `sort_order` is derived by querying the current maximum `sort_order`
/// across all groups and incrementing it by one, placing the new group last
/// in the sidebar.
///
/// # Arguments
///
/// * `state` - Managed database state injected by Tauri.
/// * `name` - The display name for the new group.
///
/// # Returns
///
/// The newly created [`Group`] with all fields populated, including the
/// generated `id`, assigned `sort_order`, and `created_at` / `updated_at`
/// timestamps.
///
/// # Errors
///
/// Returns a `String` if the database lock is poisoned or the INSERT fails.
#[tauri::command]
pub fn create_group(state: tauri::State<DbState>, name: String) -> Result<Group, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let max_order: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM groups",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let sort_order = max_order + 1;

    conn.execute(
        "INSERT INTO groups (id, name, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, name, sort_order, now, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(Group {
        id,
        name,
        sort_order,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// Renames an existing group.
///
/// # Arguments
///
/// * `state` - Managed database state injected by Tauri.
/// * `id` - The UUID of the group to rename.
/// * `name` - The new display name for the group.
///
/// # Returns
///
/// The updated [`Group`] as it exists in the database after the write.
///
/// # Errors
///
/// Returns a `String` if the database lock is poisoned, the UPDATE fails,
/// or the group is not found after the update.
#[tauri::command]
pub fn rename_group(
    state: tauri::State<DbState>,
    id: String,
    name: String,
) -> Result<Group, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE groups SET name = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![name, now, id],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, name, sort_order, created_at, updated_at FROM groups WHERE id = ?1",
        rusqlite::params![id],
        group_from_row,
    )
    .map_err(|e| e.to_string())
}

/// Permanently deletes a group.
///
/// Notes belonging to the deleted group are automatically moved to
/// "Uncategorized" via the `ON DELETE SET NULL` foreign-key constraint.
///
/// # Errors
///
/// Returns a `String` if the database lock is poisoned or the DELETE fails.
#[tauri::command]
pub fn delete_group(state: tauri::State<DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM groups WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Updates the display order of all groups in a single transaction.
///
/// Each group ID in the `ids` vector is assigned a `sort_order` equal to
/// its position in the vector (0-indexed).
///
/// # Arguments
///
/// * `ids` - Ordered list of group UUIDs representing the desired display order.
///
/// # Errors
///
/// Returns a `String` if the database lock is poisoned or any UPDATE fails.
#[tauri::command]
pub fn reorder_groups(state: tauri::State<DbState>, ids: Vec<String>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    for (i, id) in ids.iter().enumerate() {
        conn.execute(
            "UPDATE groups SET sort_order = ?1 WHERE id = ?2",
            rusqlite::params![i as i32, id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Moves a note to a different group (or removes it from any group).
///
/// # Arguments
///
/// * `note_id` - The UUID of the note to move.
/// * `group_id` - The UUID of the target group, or `None` to make it uncategorized.
///
/// # Errors
///
/// Returns a `String` if the database lock is poisoned, the UPDATE fails,
/// or the note is not found after the update.
#[tauri::command]
pub fn set_note_group(
    state: tauri::State<DbState>,
    note_id: String,
    group_id: Option<String>,
) -> Result<crate::db::Note, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE notes SET group_id = ?1 WHERE id = ?2",
        rusqlite::params![group_id, note_id],
    )
    .map_err(|e| e.to_string())?;

    let note = conn
        .query_row(
            &format!(
                "SELECT {} FROM notes WHERE id = ?1",
                crate::db::NOTE_COLUMNS
            ),
            rusqlite::params![note_id],
            crate::db::note_from_row,
        )
        .map_err(|e| e.to_string())?;

    Ok(note)
}
