mod db;

use std::sync::Mutex;
use tauri::Manager;

type Db = Mutex<rusqlite::Connection>;

#[tauri::command]
fn list_books(state: tauri::State<'_, Db>) -> Result<Vec<db::Book>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    db::list_books(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_translations(state: tauri::State<'_, Db>) -> Result<Vec<db::Translation>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    db::list_translations(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_chapter(
    state: tauri::State<'_, Db>,
    book_id: i64,
    chapter: i64,
    translation: String,
) -> Result<Vec<db::Verse>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    db::get_chapter(&conn, book_id, chapter, &translation).map_err(|e| e.to_string())
}

#[tauri::command]
fn search(
    state: tauri::State<'_, Db>,
    query: String,
    translation: Option<String>,
) -> Result<Vec<db::SearchHit>, String> {
    let conn = state.lock().map_err(|e| e.to_string())?;
    db::search(&conn, &query, translation.as_deref()).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let conn = db::open(app.handle())?;
            app.manage(Mutex::new(conn));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_books,
            list_translations,
            get_chapter,
            search
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
