mod db;
mod notes;

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

// Two connections, wrapped so Tauri's type-keyed state can hold both:
// bible.sqlite is read-only verse data; notes.sqlite is the writable index.
struct Bible(Mutex<rusqlite::Connection>);
struct Notes(Mutex<rusqlite::Connection>);

#[tauri::command]
fn list_books(bible: State<'_, Bible>) -> Result<Vec<db::Book>, String> {
    let conn = bible.0.lock().map_err(|e| e.to_string())?;
    db::list_books(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_translations(bible: State<'_, Bible>) -> Result<Vec<db::Translation>, String> {
    let conn = bible.0.lock().map_err(|e| e.to_string())?;
    db::list_translations(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_chapter(
    bible: State<'_, Bible>,
    book_id: i64,
    chapter: i64,
    translation: String,
) -> Result<Vec<db::Verse>, String> {
    let conn = bible.0.lock().map_err(|e| e.to_string())?;
    db::get_chapter(&conn, book_id, chapter, &translation).map_err(|e| e.to_string())
}

#[tauri::command]
fn search(
    bible: State<'_, Bible>,
    query: String,
    translation: Option<String>,
) -> Result<Vec<db::SearchHit>, String> {
    let conn = bible.0.lock().map_err(|e| e.to_string())?;
    db::search(&conn, &query, translation.as_deref()).map_err(|e| e.to_string())
}

// --- Notes: Markdown-on-disk + SQLite index (see notes.rs) ---

fn notes_folder(app: &AppHandle, folder: Option<String>) -> Result<PathBuf, String> {
    match folder {
        Some(f) if !f.trim().is_empty() => Ok(PathBuf::from(f)),
        _ => {
            let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
            Ok(dir.join("notes"))
        }
    }
}

// book_map needs the bible conn; take it, copy the map out, then release the
// bible lock before touching the notes conn (never hold both at once).
fn book_map(bible: &State<'_, Bible>) -> Result<Vec<(String, i64)>, String> {
    let conn = bible.0.lock().map_err(|e| e.to_string())?;
    notes::book_map(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_notes(
    bible: State<'_, Bible>,
    state: State<'_, Notes>,
    app: AppHandle,
    folder: Option<String>,
) -> Result<Vec<notes::Note>, String> {
    let books = book_map(&bible)?;
    let dir = notes_folder(&app, folder)?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    notes::load_notes(&conn, &books, &dir)
}

#[tauri::command]
fn save_note(
    bible: State<'_, Bible>,
    state: State<'_, Notes>,
    app: AppHandle,
    folder: Option<String>,
    note: notes::Note,
) -> Result<(), String> {
    let books = book_map(&bible)?;
    let dir = notes_folder(&app, folder)?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    notes::save_note(&conn, &books, &dir, &note)
}

#[tauri::command]
fn delete_note(
    state: State<'_, Notes>,
    app: AppHandle,
    folder: Option<String>,
    id: String,
) -> Result<(), String> {
    let dir = notes_folder(&app, folder)?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    notes::delete_note(&conn, &dir, &id)
}

#[tauri::command]
fn notes_for_chapter(
    state: State<'_, Notes>,
    book_id: i64,
    chapter: i64,
) -> Result<Vec<notes::ChapterNote>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    notes::notes_for_chapter(&conn, book_id, chapter).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let bible = db::open(app.handle())?;
            app.manage(Bible(Mutex::new(bible)));

            let notes_path = app
                .path()
                .app_local_data_dir()?
                .join("notes.sqlite");
            let notes = notes::open(&notes_path)?;
            app.manage(Notes(Mutex::new(notes)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_books,
            list_translations,
            get_chapter,
            search,
            load_notes,
            save_note,
            delete_note,
            notes_for_chapter
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
