use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use rusqlite::Connection;

pub fn get_db_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    // Ensure the app data directory exists
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create app data directory: {}", e))?;
    }
    
    app_dir.push("void.db");
    Ok(app_dir)
}

pub fn get_connection(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let db_path = get_db_path(app_handle)?;
    Connection::open(db_path).map_err(|e| format!("Failed to open SQLite database: {}", e))
}

pub fn init_db(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let conn = get_connection(app_handle)?;
    
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
        
        CREATE TABLE IF NOT EXISTS layouts (
          id          TEXT PRIMARY KEY,
          name        TEXT NOT NULL,
          created_at  INTEGER NOT NULL,
          updated_at  INTEGER NOT NULL,
          pan_x       REAL NOT NULL DEFAULT 0,
          pan_y       REAL NOT NULL DEFAULT 0,
          zoom        REAL NOT NULL DEFAULT 1.0,
          thumbnail   TEXT
        );

        CREATE TABLE IF NOT EXISTS cards (
          id          TEXT PRIMARY KEY,
          layout_id   TEXT NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
          url         TEXT NOT NULL,
          name        TEXT,
          x           REAL NOT NULL,
          y           REAL NOT NULL,
          width       REAL NOT NULL DEFAULT 960,
          height      REAL NOT NULL DEFAULT 640,
          scroll_x    REAL NOT NULL DEFAULT 0,
          scroll_y    REAL NOT NULL DEFAULT 0,
          created_at  INTEGER NOT NULL,
          last_active_at INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS connections (
          id          TEXT PRIMARY KEY,
          layout_id   TEXT NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
          from_card   TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
          to_card     TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
          label       TEXT NOT NULL DEFAULT ''
        );

        CREATE INDEX IF NOT EXISTS idx_cards_layout ON cards(layout_id);
        CREATE INDEX IF NOT EXISTS idx_connections_layout ON connections(layout_id);
        "
    ).map_err(|e| format!("Failed to initialize database schema: {}", e))?;
    
    Ok(())
}
