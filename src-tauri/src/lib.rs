mod db;
mod logos_import;
mod notes;

use rusqlite::{Connection, OpenFlags};
use std::fs;
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
fn section_headings_for_chapter(
    bible: State<'_, Bible>,
    book_id: i64,
    chapter: i64,
    translation: String,
) -> Result<Vec<db::SectionHeading>, String> {
    let conn = bible.0.lock().map_err(|e| e.to_string())?;
    db::get_section_headings(&conn, book_id, chapter, &translation).map_err(|e| e.to_string())
}

#[tauri::command]
fn find_section_heading(
    bible: State<'_, Bible>,
    title: String,
    translation: String,
) -> Result<Option<db::HeadingMatch>, String> {
    let conn = bible.0.lock().map_err(|e| e.to_string())?;
    db::find_section_heading(&conn, &title, &translation).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_section_headings(
    bible: State<'_, Bible>,
    translation: String,
) -> Result<Vec<db::HeadingSuggestion>, String> {
    let conn = bible.0.lock().map_err(|e| e.to_string())?;
    db::list_section_headings(&conn, &translation).map_err(|e| e.to_string())
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

/// Install a prebuilt `bible.sqlite` (the output of `scripts/import_bible.py`)
/// as the active Bible DB: validate it, copy it into the app-local-data dir over
/// the current one, and swap the live read-only connection. The frontend
/// reloads afterwards to re-read books/translations.
#[tauri::command]
fn import_bible_db(
    bible: State<'_, Bible>,
    app: AppHandle,
    source: String,
) -> Result<(), String> {
    let source = PathBuf::from(&source);
    if !source.is_file() {
        return Err(format!("File not found: {}", source.display()));
    }
    db::validate_source(&source)?;

    let dest = db::db_path(&app)?;
    // Picking the file that's already installed: nothing to copy.
    if dest.exists()
        && fs::canonicalize(&source).ok() == fs::canonicalize(&dest).ok()
    {
        return Ok(());
    }

    let mut guard = bible.0.lock().map_err(|e| e.to_string())?;
    // Drop the live connection first so its file handle releases — Windows
    // locks the open DB file and won't let us overwrite it otherwise.
    *guard = Connection::open_in_memory().map_err(|e| e.to_string())?;

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Copy to a temp path then rename over the target, so a failed/partial copy
    // never leaves a corrupt bible.sqlite in place.
    let tmp = dest.with_extension("sqlite.importing");
    fs::copy(&source, &tmp).map_err(|e| format!("Copy failed: {e}"))?;
    if let Err(e) = fs::rename(&tmp, &dest) {
        let _ = fs::remove_file(&tmp);
        return Err(format!("Install failed: {e}"));
    }

    *guard = Connection::open_with_flags(&dest, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| e.to_string())?;
    Ok(())
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

/// Import one or more Logos Bible Study `.txt` note exports (see
/// logos_import.rs), skipping any passage group that's already been imported.
#[tauri::command]
fn import_logos_notes(
    bible: State<'_, Bible>,
    state: State<'_, Notes>,
    app: AppHandle,
    folder: Option<String>,
    paths: Vec<String>,
    now: String,
    color: Option<String>,
) -> Result<logos_import::ImportSummary, String> {
    let books = book_map(&bible)?;
    // Same "never hold both locks at once" rule as book_map: read every
    // heading for the default translation out of bible.sqlite and drop the
    // lock before touching the notes conn, so import_files can auto-title
    // notes from an in-memory lookup instead of a query per note.
    let headings = {
        let conn = bible.0.lock().map_err(|e| e.to_string())?;
        match db::default_translation_code(&conn).map_err(|e| e.to_string())? {
            Some(t) => db::list_section_heading_ranges(&conn, &t).map_err(|e| e.to_string())?,
            None => Vec::new(),
        }
    };
    let dir = notes_folder(&app, folder)?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    logos_import::import_files(&conn, &books, &headings, &dir, &paths, &now, color)
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
            section_headings_for_chapter,
            find_section_heading,
            list_section_headings,
            search,
            import_bible_db,
            load_notes,
            save_note,
            delete_note,
            notes_for_chapter,
            import_logos_notes
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
