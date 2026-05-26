use tauri::{AppHandle, Manager};
use uuid::Uuid;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use crate::db;
use crate::commands::card::Card;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionPayload {
    pub id: String,
    pub from_card: String,
    pub to_card: String,
    pub label: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CanvasStatePayload {
    pub pan_x: f64,
    pub pan_y: f64,
    pub zoom: f64,
    pub cards: Vec<Card>,
    pub connections: Vec<ConnectionPayload>,
    pub thumbnail_b64: Option<String>, // Base64 PNG snapshot of the canvas from PixiJS
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutPayload {
    pub id: String,
    pub name: String,
    pub pan_x: f64,
    pub pan_y: f64,
    pub zoom: f64,
    pub cards: Vec<Card>,
    pub connections: Vec<ConnectionPayload>,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutMeta {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub pan_x: f64,
    pub pan_y: f64,
    pub zoom: f64,
    pub thumbnail: Option<String>,
}

fn get_now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn get_thumbnail_dir(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let mut dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    dir.push("void");
    dir.push("thumbnails");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create thumbnail directory: {}", e))?;
    }
    Ok(dir)
}

#[tauri::command]
pub fn save_layout(
    app_handle: AppHandle,
    name: String,
    state: CanvasStatePayload,
) -> Result<String, String> {
    let mut conn = db::get_connection(&app_handle)?;
    let now = get_now_ms();
    
    // Look up if a layout with this name already exists
    let existing_id: Option<String> = conn
        .query_row(
            "SELECT id FROM layouts WHERE name = ?",
            [&name],
            |row| row.get(0),
        )
        .ok();

    let layout_id = existing_id.unwrap_or_else(|| Uuid::new_v4().to_string());
    
    // Process base64 thumbnail if present
    let mut thumbnail_path: Option<String> = None;
    if let Some(ref b64) = state.thumbnail_b64 {
        if let Some(clean_b64) = b64.strip_prefix("data:image/png;base64,") {
            if let Ok(bytes) = STANDARD.decode(clean_b64) {
                if let Ok(mut path) = get_thumbnail_dir(&app_handle) {
                    path.push(format!("{}.png", layout_id));
                    if fs::write(&path, bytes).is_ok() {
                        thumbnail_path = Some(path.to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    // Begin transaction
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    // 1. Insert or replace layout
    tx.execute(
        "INSERT INTO layouts (id, name, created_at, updated_at, pan_x, pan_y, zoom, thumbnail)
         VALUES (?1, ?2, IFNULL((SELECT created_at FROM layouts WHERE id = ?1), ?3), ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            updated_at = excluded.updated_at,
            pan_x = excluded.pan_x,
            pan_y = excluded.pan_y,
            zoom = excluded.zoom,
            thumbnail = COALESCE(excluded.thumbnail, layouts.thumbnail)",
        rusqlite::params![layout_id, name, now, state.pan_x, state.pan_y, state.zoom, thumbnail_path],
    ).map_err(|e| format!("Save layout transactional error: {}", e))?;

    // 2. Clear old cards for this layout
    tx.execute("DELETE FROM cards WHERE layout_id = ?", [&layout_id])
        .map_err(|e| e.to_string())?;

    // 3. Insert new cards
    for card in &state.cards {
        tx.execute(
            "INSERT INTO cards (id, layout_id, url, name, x, y, width, height, scroll_x, scroll_y, created_at, last_active_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            rusqlite::params![card.id, layout_id, card.url, card.name, card.x, card.y, card.width, card.height, card.scroll_x, card.scroll_y, now, now],
        ).map_err(|e| format!("Save card relational error: {}", e))?;
    }

    // 4. Clear old connections
    tx.execute("DELETE FROM connections WHERE layout_id = ?", [&layout_id])
        .map_err(|e| e.to_string())?;

    // 5. Insert new connections
    for conn in &state.connections {
        tx.execute(
            "INSERT INTO connections (id, layout_id, from_card, to_card, label)
             VALUES (?, ?, ?, ?, ?)",
            rusqlite::params![conn.id, layout_id, conn.from_card, conn.to_card, conn.label],
        ).map_err(|e| format!("Save connection relational error: {}", e))?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    
    Ok(layout_id)
}

#[tauri::command]
pub fn restore_layout(app_handle: AppHandle, id: String) -> Result<LayoutPayload, String> {
    let conn = db::get_connection(&app_handle)?;
    
    // 1. Get layout settings
    let (name, pan_x, pan_y, zoom): (String, f64, f64, f64) = conn
        .query_row(
            "SELECT name, pan_x, pan_y, zoom FROM layouts WHERE id = ?",
            [&id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|e| format!("Layout {} not found: {}", id, e))?;

    // 2. Fetch cards
    let mut stmt = conn
        .prepare(
            "SELECT id, url, name, x, y, width, height, scroll_x, scroll_y FROM cards WHERE layout_id = ?",
        )
        .map_err(|e| e.to_string())?;
    
    let card_rows = stmt
        .query_map([&id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, f64>(3)?,
                row.get::<_, f64>(4)?,
                row.get::<_, f64>(5)?,
                row.get::<_, f64>(6)?,
                row.get::<_, f64>(7)?,
                row.get::<_, f64>(8)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut cards = Vec::new();
    for card_row in card_rows {
        if let Ok((cid, url, name, x, y, w, h, sx, sy)) = card_row {
            let snap_path = crate::live_view::get_snapshot_path(&app_handle, &cid)?;
            let snap_exists = snap_path.exists();
            cards.push(Card {
                id: cid,
                layout_id: id.clone(),
                url,
                name,
                x,
                y,
                width: w,
                height: h,
                scroll_x: sx,
                scroll_y: sy,
                thermal: "cold".to_string(), // Starts as cold during restoration
                snapshot_path: if snap_exists { Some(snap_path.to_string_lossy().to_string()) } else { None },
                is_live: false,
            });
        }
    }

    // 3. Fetch connections
    let mut stmt = conn
        .prepare("SELECT id, from_card, to_card, label FROM connections WHERE layout_id = ?")
        .map_err(|e| e.to_string())?;
    
    let conn_rows = stmt
        .query_map([&id], |row| {
            Ok(ConnectionPayload {
                id: row.get(0)?,
                from_card: row.get(1)?,
                to_card: row.get(2)?,
                label: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut connections = Vec::new();
    for conn_row in conn_rows {
        if let Ok(c) = conn_row {
            connections.push(c);
        }
    }

    // Enforce live card closures
    for (_, win) in app_handle.webview_windows() {
        if win.label().starts_with("live_card_") {
            let _ = win.close();
        }
    }

    Ok(LayoutPayload {
        id,
        name,
        pan_x,
        pan_y,
        zoom,
        cards,
        connections,
    })
}

#[tauri::command]
pub fn list_layouts(app_handle: AppHandle) -> Result<Vec<LayoutMeta>, String> {
    let conn = db::get_connection(&app_handle)?;
    let mut stmt = conn
        .prepare("SELECT id, name, created_at, updated_at, pan_x, pan_y, zoom, thumbnail FROM layouts ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;
    
    let rows = stmt
        .query_map([], |row| {
            Ok(LayoutMeta {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
                pan_x: row.get(4)?,
                pan_y: row.get(5)?,
                zoom: row.get(6)?,
                thumbnail: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut layouts = Vec::new();
    for r in rows {
        if let Ok(layout) = r {
            layouts.push(layout);
        }
    }
    
    Ok(layouts)
}

#[tauri::command]
pub fn delete_layout(app_handle: AppHandle, id: String) -> Result<(), String> {
    let conn = db::get_connection(&app_handle)?;
    
    // Get all card IDs belonging to this layout to clean up snapshots
    let mut stmt = conn
        .prepare("SELECT id FROM cards WHERE layout_id = ?")
        .map_err(|e| e.to_string())?;
    
    let card_ids = stmt
        .query_map([&id], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

    for card_id in card_ids {
        if let Ok(cid) = card_id {
            if let Ok(snap_path) = crate::live_view::get_snapshot_path(&app_handle, &cid) {
                if snap_path.exists() {
                    let _ = fs::remove_file(snap_path);
                }
            }
        }
    }

    // Delete thumbnail
    if let Ok(mut path) = get_thumbnail_dir(&app_handle) {
        path.push(format!("{}.png", id));
        if path.exists() {
            let _ = fs::remove_file(path);
        }
    }

    // Delete layout row (ON DELETE CASCADE handles cards/connections)
    conn.execute("DELETE FROM layouts WHERE id = ?", [id])
        .map_err(|e| format!("Failed to delete layout row: {}", e))?;

    Ok(())
}
