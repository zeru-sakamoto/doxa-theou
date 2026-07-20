//! Read-only access to the normalized Bible DB (bible.sqlite).
//!
//! The file is produced once by `scripts/import_bible.py` from a local source DB
//! (see DESIGN.md) and lives in the app-local-data dir. Verse text is read-only here; notes /
//! embeddings / cross-refs (roadmap) will get their own writable store.

use rusqlite::{Connection, OpenFlags};
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
pub struct Book {
    pub id: i64,
    pub testament: String,
    pub name: String,
    pub abbr: String,
    pub canonical_order: i64,
}

#[derive(Serialize)]
pub struct Translation {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub license: String,
    pub is_default: bool,
}

#[derive(Serialize)]
pub struct Verse {
    pub verse_ref_id: i64,
    pub chapter: i64,
    pub verse: i64,
    pub text: String,
}

#[derive(Serialize)]
pub struct SectionHeading {
    pub chapter: i64,
    pub verse_start: i64,
    pub end_chapter: i64,
    pub verse_end: i64,
    pub heading: String,
}

#[derive(Serialize)]
pub struct SearchHit {
    pub verse_ref_id: i64,
    pub book_id: i64,
    pub chapter: i64,
    pub verse: i64,
    pub translation: String,
    pub text: String,
    pub score: f64,
}

pub fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("bible.sqlite"))
}

/// Open the DB read-only, or return a message telling the user how to create it.
pub fn open(app: &AppHandle) -> Result<Connection, String> {
    let path = db_path(app)?;
    if !path.exists() {
        return Err(format!(
            "bible.sqlite not found at {}.\nRun `python scripts/import_bible.py` and copy the output there.",
            path.display()
        ));
    }
    Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| e.to_string())
}

pub fn list_books(conn: &Connection) -> rusqlite::Result<Vec<Book>> {
    conn.prepare("SELECT id, testament, name, abbr, canonical_order FROM books ORDER BY canonical_order")?
        .query_map([], |r| {
            Ok(Book {
                id: r.get(0)?,
                testament: r.get(1)?,
                name: r.get(2)?,
                abbr: r.get(3)?,
                canonical_order: r.get(4)?,
            })
        })?
        .collect()
}

pub fn list_translations(conn: &Connection) -> rusqlite::Result<Vec<Translation>> {
    conn.prepare("SELECT id, code, name, license, is_default FROM translations ORDER BY code")?
        .query_map([], |r| {
            Ok(Translation {
                id: r.get(0)?,
                code: r.get(1)?,
                name: r.get(2)?,
                license: r.get(3)?,
                is_default: r.get::<_, i64>(4)? != 0,
            })
        })?
        .collect()
}

pub fn get_chapter(
    conn: &Connection,
    book_id: i64,
    chapter: i64,
    translation: &str,
) -> rusqlite::Result<Vec<Verse>> {
    conn.prepare(
        "SELECT r.id, r.chapter, r.verse, vt.text \
         FROM verse_refs r \
         JOIN verse_texts vt ON vt.verse_ref_id = r.id \
         JOIN translations t ON t.id = vt.translation_id \
         WHERE r.book_id = ?1 AND r.chapter = ?2 AND t.code = ?3 \
         ORDER BY r.verse",
    )?
    .query_map((book_id, chapter, translation), |r| {
        Ok(Verse {
            verse_ref_id: r.get(0)?,
            chapter: r.get(1)?,
            verse: r.get(2)?,
            text: r.get(3)?,
        })
    })?
    .collect()
}

/// Headings starting in this chapter, in reading order, for the given translation.
pub fn get_section_headings(
    conn: &Connection,
    book_id: i64,
    chapter: i64,
    translation: &str,
) -> rusqlite::Result<Vec<SectionHeading>> {
    conn.prepare(
        "SELECT sh.chapter, sh.verse_start, sh.end_chapter, sh.verse_end, sh.heading \
         FROM section_headings sh \
         JOIN translations t ON t.id = sh.translation_id \
         WHERE sh.book_id = ?1 AND sh.chapter = ?2 AND t.code = ?3 \
         ORDER BY sh.verse_start, sh.id",
    )?
    .query_map((book_id, chapter, translation), |r| {
        Ok(SectionHeading {
            chapter: r.get(0)?,
            verse_start: r.get(1)?,
            end_chapter: r.get(2)?,
            verse_end: r.get(3)?,
            heading: r.get(4)?,
        })
    })?
    .collect()
}

/// FTS5 search ordered by bm25 (lower = better). `translation` None searches all.
// Raw MATCH passthrough. A stray `"` in the query is an FTS syntax error
// surfaced to the caller; quote/sanitize the input if that becomes a problem.
pub fn search(
    conn: &Connection,
    query: &str,
    translation: Option<&str>,
) -> rusqlite::Result<Vec<SearchHit>> {
    let mut sql = String::from(
        "SELECT f.verse_ref_id, r.book_id, r.chapter, r.verse, t.code, f.text, bm25(verse_fts) \
         FROM verse_fts f \
         JOIN verse_refs r ON r.id = f.verse_ref_id \
         JOIN translations t ON t.id = f.translation_id \
         WHERE verse_fts MATCH ?1",
    );
    if translation.is_some() {
        sql.push_str(" AND t.code = ?2");
    }
    sql.push_str(" ORDER BY bm25(verse_fts) LIMIT 50");

    let map = |r: &rusqlite::Row| {
        Ok(SearchHit {
            verse_ref_id: r.get(0)?,
            book_id: r.get(1)?,
            chapter: r.get(2)?,
            verse: r.get(3)?,
            translation: r.get(4)?,
            text: r.get(5)?,
            score: r.get(6)?,
        })
    };
    let mut stmt = conn.prepare(&sql)?;
    match translation {
        Some(code) => stmt.query_map((query, code), map)?.collect(),
        None => stmt.query_map((query,), map)?.collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Runs against the imported ../bible.sqlite; no-ops if it isn't there
    // (it's gitignored). Run `python scripts/import_bible.py` to populate.
    #[test]
    fn queries_return_expected_rows() {
        let path = std::path::Path::new("../bible.sqlite");
        if !path.exists() {
            eprintln!("skipping: ../bible.sqlite not present");
            return;
        }
        let c = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();

        assert_eq!(list_books(&c).unwrap().len(), 66);
        assert!(list_translations(&c).unwrap().iter().any(|t| t.code == "ESV" && t.is_default));

        let john1 = get_chapter(&c, 43, 1, "ESV").unwrap();
        assert!(john1.len() > 40 && john1[0].text.contains("the Word"));

        let hits = search(&c, "shepherd", Some("ESV")).unwrap();
        assert!(!hits.is_empty());
        assert!(hits.windows(2).all(|w| w[0].score <= w[1].score)); // bm25 ascending
    }
}
