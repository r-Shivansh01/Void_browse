mod db;
mod live_view;
mod snapshot;
mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            // Initialize SQLite Database schema on launch
            db::init_db(&app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Card commands
            commands::card::open_card,
            commands::card::close_card,
            commands::card::focus_card,
            commands::card::blur_card,
            commands::card::refresh_snapshot,
            
            // Layout commands
            commands::layout::save_layout,
            commands::layout::restore_layout,
            commands::layout::list_layouts,
            commands::layout::delete_layout,
            
            // Canvas commands
            commands::canvas::get_snapshot_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running VOID application");
}
