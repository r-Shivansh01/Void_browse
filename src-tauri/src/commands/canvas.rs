use tauri::AppHandle;
use crate::live_view;

#[tauri::command]
pub fn get_snapshot_path(app_handle: AppHandle, card_id: String) -> Result<Option<String>, String> {
    match live_view::get_snapshot_path(&app_handle, &card_id) {
        Ok(path) => {
            if path.exists() {
                Ok(Some(path.to_string_lossy().to_string()))
            } else {
                Ok(None)
            }
        }
        Err(e) => Err(e),
    }
}
