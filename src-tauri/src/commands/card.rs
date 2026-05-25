use tauri::{AppHandle, Manager};
use uuid::Uuid;
use std::time::{SystemTime, UNIX_EPOCH};
use std::fs;
use crate::db;
use crate::live_view;
use crate::snapshot;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Card {
    pub id: String,
    pub layout_id: String,
    pub url: String,
    pub name: Option<String>,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub scroll_x: f64,
    pub scroll_y: f64,
    pub thermal: String,
    pub snapshot_path: Option<String>,
    pub is_live: bool,
}

fn get_now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

const UNOCH: SystemTime = UNIX_EPOCH;

// Ensures that at least one layout exists in the database
fn ensure_active_layout(app_handle: &AppHandle, layout_id: &str) -> Result<(), String> {
    let conn = db::get_connection(app_handle)?;
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM layouts WHERE id = ?)",
            [layout_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if !exists {
        let now = get_now_ms();
        conn.execute(
            "INSERT INTO layouts (id, name, created_at, updated_at, pan_x, pan_y, zoom)
             VALUES (?, ?, ?, ?, 0.0, 0.0, 1.0)",
            [layout_id, "Default Session", &now.to_string(), &now.to_string()],
        )
        .map_err(|e| format!("Failed to create default layout: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_card(
    app_handle: AppHandle,
    layout_id: String,
    url: String,
    x: f64,
    y: f64,
) -> Result<Card, String> {
    ensure_active_layout(&app_handle, &layout_id)?;
    
    let id = Uuid::new_v4().to_string();
    let now = get_now_ms();
    let width = 960.0;
    let height = 640.0;
    
    // Normalize URL
    let mut normalized_url = url.trim().to_string();
    if !normalized_url.starts_with("http://") && !normalized_url.starts_with("https://") {
        if normalized_url.contains('.') && !normalized_url.contains(' ') {
            normalized_url = format!("https://{}", normalized_url);
        } else {
            // Search query fallback
            normalized_url = format!("https://www.google.com/search?q={}", urlencoding::encode(&normalized_url));
        }
    }

    let conn = db::get_connection(&app_handle)?;
    conn.execute(
        "INSERT INTO cards (id, layout_id, url, name, x, y, width, height, scroll_x, scroll_y, created_at, last_active_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 0.0, 0.0, ?, ?)",
        rusqlite::params![id, layout_id, normalized_url, x, y, width, height, now, now],
    ).map_err(|e| format!("Failed to save card to DB: {}", e))?;

    let snap_path = live_view::get_snapshot_path(&app_handle, &id)?;
    let snapshot_exists = snap_path.exists();

    Ok(Card {
        id,
        layout_id,
        url: normalized_url,
        name: None,
        x,
        y,
        width,
        height,
        scroll_x: 0.0,
        scroll_y: 0.0,
        thermal: "hot".to_string(),
        snapshot_path: if snapshot_exists { Some(snap_path.to_string_lossy().to_string()) } else { None },
        is_live: false,
    })
}

#[tauri::command]
pub fn close_card(app_handle: AppHandle, id: String) -> Result<(), String> {
    // 1. Close webview window if it is live
    let window_label = format!("live_card_{}", id);
    if let Some(win) = app_handle.get_webview_window(&window_label) {
        let _ = win.close();
    }

    // 2. Delete snapshot file from disk
    if let Ok(snap_path) = live_view::get_snapshot_path(&app_handle, &id) {
        if snap_path.exists() {
            let _ = fs::remove_file(snap_path);
        }
    }

    // 3. Delete from DB
    let conn = db::get_connection(&app_handle)?;
    conn.execute("DELETE FROM cards WHERE id = ?", [id])
        .map_err(|e| format!("Failed to delete card: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn focus_card(
    app_handle: AppHandle,
    id: String,
    url: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let now = get_now_ms();
    
    // Update DB timestamp to mark as hot
    let conn = db::get_connection(&app_handle)?;
    conn.execute(
        "UPDATE cards SET last_active_at = ? WHERE id = ?",
        rusqlite::params![now, id],
    ).map_err(|e| format!("Failed to update card timestamp: {}", e))?;

    // Focus the live window
    live_view::focus_live_card(&app_handle, id, url, x, y, width, height)?;
    
    Ok(())
}

#[tauri::command]
pub fn blur_card(app_handle: AppHandle, id: String) -> Result<String, String> {
    // 1. Capture current frame and close window
    let snap_path = live_view::blur_live_card(&app_handle, id.clone())?;

    // 2. Update DB with the new snapshot path
    let conn = db::get_connection(&app_handle)?;
    conn.execute(
        "UPDATE cards SET last_active_at = ? WHERE id = ?",
        rusqlite::params![get_now_ms(), id],
    ).map_err(|e| format!("Failed to update card snapshot status: {}", e))?;

    Ok(snap_path)
}

#[tauri::command]
pub async fn refresh_snapshot(
    app_handle: AppHandle,
    id: String,
    url: String,
) -> Result<String, String> {
    // Perform memory and refresher process in background
    let snap_path = snapshot::run_refresh_snapshot(app_handle.clone(), id.clone(), url).await?;
    
    // Update DB last_active_at
    let conn = db::get_connection(&app_handle)?;
    let now = get_now_ms();
    let _ = conn.execute(
        "UPDATE cards SET last_active_at = ? WHERE id = ?",
        rusqlite::params![now, id],
    );

    Ok(snap_path)
}
