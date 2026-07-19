//! Notes: Markdown-on-disk (source of truth) + a writable SQLite index.
//!
//! `.md` files in the notes folder own the content; `notes.sqlite` is a
//! rebuilt-from-frontmatter index (note ↔ anchor ↔ tag) so cross-ref and
//! search stay fast and semantic vectors have somewhere to attach later
//! (see Bible Study App.md / DESIGN.md). This is separate from the
//! read-only `bible.sqlite` and opened read-write.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone)]
pub struct Note {
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub anchors: Vec<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub created: String,
    #[serde(default)]
    pub modified: String,
    #[serde(default)]
    pub body: String,
}

/// One anchor's worth of highlight info for a chapter — the read side of the
/// index, for the (future) cross-ref pane / "which notes touch this verse".
#[derive(Serialize)]
pub struct ChapterNote {
    pub note_id: String,
    pub title: String,
    pub color: Option<String>,
    pub verse_start: Option<i64>,
    pub verse_end: Option<i64>,
}

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS notes (
  id       TEXT PRIMARY KEY,
  title    TEXT NOT NULL DEFAULT '',
  color    TEXT,
  created  TEXT,
  modified TEXT,
  path     TEXT,
  body     TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS note_tags (
  note_id TEXT NOT NULL,
  tag     TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS note_anchors (
  note_id     TEXT NOT NULL,
  raw         TEXT NOT NULL,
  book_id     INTEGER,
  chapter     INTEGER,
  verse_start INTEGER,
  verse_end   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_note_anchors_loc ON note_anchors(book_id, chapter);
CREATE INDEX IF NOT EXISTS idx_note_tags_note ON note_tags(note_id);
";

// Bundled first-run notes. include_str! reaches into the frontend tree (the
// files' original home) rather than duplicating them — repo-root-relative.
const SAMPLES: &[(&str, &str)] = &[
    ("psalm23-comfort", include_str!("../../src/panels/notes/sample/psalm23-comfort.md")),
    ("covenant-abraham", include_str!("../../src/panels/notes/sample/covenant-abraham.md")),
    ("fruit-of-spirit", include_str!("../../src/panels/notes/sample/fruit-of-spirit.md")),
    ("incarnation-01", include_str!("../../src/panels/notes/sample/incarnation-01.md")),
    ("prayer-model", include_str!("../../src/panels/notes/sample/prayer-model.md")),
];

/// Open (creating) the notes index DB and ensure the schema exists.
pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch(SCHEMA)?;
    Ok(conn)
}

/// `(lowercased book name, id)`, longest name first so multi-word names win.
pub fn book_map(bible: &Connection) -> rusqlite::Result<Vec<(String, i64)>> {
    let mut v: Vec<(String, i64)> = bible
        .prepare("SELECT name, id FROM books")?
        .query_map([], |r| Ok((r.get::<_, String>(0)?.to_lowercase(), r.get::<_, i64>(1)?)))?
        .collect::<rusqlite::Result<_>>()?;
    v.sort_by(|a, b| b.0.len().cmp(&a.0.len()));
    Ok(v)
}

// ponytail: hand-rolled `key: value` / `[a, b]` frontmatter parse, mirroring
// the TS parser in notes.ts. The samples only use flat scalars and lists.
fn parse_list(v: &str) -> Vec<String> {
    let v = v.trim();
    if v.starts_with('[') && v.ends_with(']') {
        v[1..v.len() - 1]
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    } else if v.is_empty() {
        vec![]
    } else {
        vec![v.to_string()]
    }
}

pub fn parse_note(raw: &str) -> Result<Note, String> {
    let text = raw.replace("\r\n", "\n");
    let mut lines = text.lines();
    if lines.next().map(str::trim) != Some("---") {
        return Err("note is missing frontmatter".into());
    }
    let mut id = String::new();
    let (mut title, mut created, mut modified) = (String::new(), String::new(), String::new());
    let (mut tags, mut anchors) = (Vec::new(), Vec::new());
    let mut color: Option<String> = None;
    let mut ended = false;
    let mut body_lines: Vec<&str> = Vec::new();
    for line in lines {
        if !ended && line.trim() == "---" {
            ended = true;
            continue;
        }
        if ended {
            body_lines.push(line);
            continue;
        }
        let Some(i) = line.find(':') else { continue };
        let (key, val) = (line[..i].trim(), line[i + 1..].trim());
        match key {
            "id" => id = val.to_string(),
            "title" => title = val.to_string(),
            "created" => created = val.to_string(),
            "modified" => modified = val.to_string(),
            "tags" => tags = parse_list(val),
            "anchors" => anchors = parse_list(val),
            "color" if !val.is_empty() => color = Some(val.to_string()),
            _ => {}
        }
    }
    if !ended {
        return Err("note frontmatter is unterminated".into());
    }
    Ok(Note {
        id,
        title,
        tags,
        anchors,
        color,
        created,
        modified,
        body: body_lines.join("\n").trim().to_string(),
    })
}

pub fn serialize_note(note: &Note) -> String {
    let mut s = String::from("---\n");
    s.push_str(&format!("id: {}\n", note.id));
    s.push_str(&format!("title: {}\n", note.title));
    s.push_str(&format!("tags: [{}]\n", note.tags.join(", ")));
    s.push_str(&format!("anchors: [{}]\n", note.anchors.join(", ")));
    if let Some(c) = &note.color {
        s.push_str(&format!("color: {c}\n"));
    }
    s.push_str(&format!("created: {}\n", note.created));
    s.push_str(&format!("modified: {}\n", note.modified));
    s.push_str("---\n\n");
    s.push_str(note.body.trim());
    s.push('\n');
    s
}

// "Chapter[:Verse[-Verse]]" -> (chapter, verse_start, verse_end). A bare
// chapter has no verse bounds (whole-chapter anchor); a single verse has
// start == end. Matches parseAnchor in the TS side.
fn parse_ref(rest: &str) -> Option<(i64, Option<i64>, Option<i64>)> {
    let (chap_str, verse_part) = match rest.split_once(':') {
        Some((c, v)) => (c, Some(v)),
        None => (rest, None),
    };
    let chapter: i64 = chap_str.trim().parse().ok()?;
    match verse_part {
        None => Some((chapter, None, None)),
        Some(v) => match v.split_once('-') {
            Some((a, b)) => Some((chapter, Some(a.trim().parse().ok()?), Some(b.trim().parse().ok()?))),
            None => {
                let n: i64 = v.trim().parse().ok()?;
                Some((chapter, Some(n), Some(n)))
            }
        },
    }
}

/// "Book Chapter[:Verse[-Verse]]" -> (book_id, chapter, verse_start, verse_end).
pub fn resolve_anchor(anchor: &str, books: &[(String, i64)]) -> Option<(i64, i64, Option<i64>, Option<i64>)> {
    let lower = anchor.to_lowercase();
    let (name, id) = books.iter().find(|(n, _)| lower.starts_with(&(n.clone() + " ")))?;
    let (chapter, vs, ve) = parse_ref(anchor[name.len()..].trim())?;
    Some((*id, chapter, vs, ve))
}

// Keep the id filename-safe (it crosses a trust boundary from the frontend).
fn safe_stem(id: &str) -> String {
    let s: String = id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect();
    if s.is_empty() { "note".into() } else { s }
}

fn note_path(folder: &Path, id: &str) -> PathBuf {
    folder.join(format!("{}.md", safe_stem(id)))
}

fn upsert_note(conn: &Connection, path: &Path, note: &Note, books: &[(String, i64)]) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO notes (id,title,color,created,modified,path,body) VALUES (?1,?2,?3,?4,?5,?6,?7)",
        params![note.id, note.title, note.color, note.created, note.modified, path.to_string_lossy(), note.body],
    )?;
    conn.execute("DELETE FROM note_tags WHERE note_id=?1", params![note.id])?;
    conn.execute("DELETE FROM note_anchors WHERE note_id=?1", params![note.id])?;
    for tag in &note.tags {
        conn.execute("INSERT INTO note_tags (note_id,tag) VALUES (?1,?2)", params![note.id, tag])?;
    }
    for raw in &note.anchors {
        let (b, c, vs, ve) = match resolve_anchor(raw, books) {
            Some((b, c, vs, ve)) => (Some(b), Some(c), vs, ve),
            None => (None, None, None, None),
        };
        conn.execute(
            "INSERT INTO note_anchors (note_id,raw,book_id,chapter,verse_start,verse_end) VALUES (?1,?2,?3,?4,?5,?6)",
            params![note.id, raw, b, c, vs, ve],
        )?;
    }
    Ok(())
}

fn seed_if_empty(folder: &Path) -> std::io::Result<()> {
    let has_md = fs::read_dir(folder)?
        .filter_map(|e| e.ok())
        .any(|e| e.path().extension().and_then(|x| x.to_str()) == Some("md"));
    if has_md {
        return Ok(());
    }
    for (id, content) in SAMPLES {
        fs::write(folder.join(format!("{id}.md")), content)?;
    }
    Ok(())
}

/// Read every `.md` in `folder`, rebuild the whole index, return the notes.
/// Seeds the bundled samples on first run (empty folder).
pub fn load_notes(conn: &Connection, books: &[(String, i64)], folder: &Path) -> Result<Vec<Note>, String> {
    fs::create_dir_all(folder).map_err(|e| e.to_string())?;
    seed_if_empty(folder).map_err(|e| e.to_string())?;

    let mut loaded: Vec<(PathBuf, Note)> = Vec::new();
    for entry in fs::read_dir(folder).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        if let Ok(mut note) = parse_note(&raw) {
            if note.id.is_empty() {
                note.id = path.file_stem().and_then(|s| s.to_str()).unwrap_or("note").to_string();
            }
            loaded.push((path, note));
        }
        // Malformed files are skipped, not fatal.
    }

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute_batch("DELETE FROM notes; DELETE FROM note_tags; DELETE FROM note_anchors;")
        .map_err(|e| e.to_string())?;
    for (path, note) in &loaded {
        upsert_note(&tx, path, note, books).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;

    Ok(loaded.into_iter().map(|(_, n)| n).collect())
}

/// Write one note to disk (`{id}.md`) and update its index rows.
pub fn save_note(conn: &Connection, books: &[(String, i64)], folder: &Path, note: &Note) -> Result<(), String> {
    fs::create_dir_all(folder).map_err(|e| e.to_string())?;
    let path = note_path(folder, &note.id);
    fs::write(&path, serialize_note(note)).map_err(|e| e.to_string())?;
    upsert_note(conn, &path, note, books).map_err(|e| e.to_string())
}

/// Delete a note's `.md` file and its index rows.
pub fn delete_note(conn: &Connection, folder: &Path, id: &str) -> Result<(), String> {
    let _ = fs::remove_file(note_path(folder, id)); // absent file is fine
    conn.execute("DELETE FROM notes WHERE id=?1", params![id]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM note_tags WHERE note_id=?1", params![id]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM note_anchors WHERE note_id=?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

/// Anchors landing in a given chapter — the index's read side.
pub fn notes_for_chapter(conn: &Connection, book_id: i64, chapter: i64) -> rusqlite::Result<Vec<ChapterNote>> {
    conn.prepare(
        "SELECT a.note_id, n.title, n.color, a.verse_start, a.verse_end \
         FROM note_anchors a JOIN notes n ON n.id = a.note_id \
         WHERE a.book_id = ?1 AND a.chapter = ?2",
    )?
    .query_map(params![book_id, chapter], |r| {
        Ok(ChapterNote {
            note_id: r.get(0)?,
            title: r.get(1)?,
            color: r.get(2)?,
            verse_start: r.get(3)?,
            verse_end: r.get(4)?,
        })
    })?
    .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_resolves() {
        let note = parse_note(
            "---\nid: t\ntitle: T\ntags: [a, b]\nanchors: [John 1:1, Psalms 23:1-4]\ncreated: 2026-01-01\nmodified: 2026-01-02\n---\n\nBody text.\n",
        )
        .unwrap();
        assert_eq!(note.tags, vec!["a", "b"]);
        assert_eq!(note.anchors.len(), 2);
        assert_eq!(note.color, None);
        assert_eq!(note.body, "Body text.");

        let books = vec![("psalms".to_string(), 19), ("john".to_string(), 43)];
        assert_eq!(resolve_anchor("John 1:1", &books), Some((43, 1, Some(1), Some(1))));
        assert_eq!(resolve_anchor("Psalms 23:1-4", &books), Some((19, 23, Some(1), Some(4))));
        assert_eq!(resolve_anchor("John 1", &books), Some((43, 1, None, None)));
        assert_eq!(resolve_anchor("Nope 1:1", &books), None);
    }

    #[test]
    fn roundtrips_through_serialize() {
        let n = Note {
            id: "x".into(),
            title: "Title".into(),
            tags: vec!["t1".into()],
            anchors: vec!["John 3:16".into()],
            color: Some("var(--highlight-rose)".into()),
            created: "2026-01-01".into(),
            modified: "2026-01-02".into(),
            body: "Some body.".into(),
        };
        let parsed = parse_note(&serialize_note(&n)).unwrap();
        assert_eq!(parsed.id, n.id);
        assert_eq!(parsed.anchors, n.anchors);
        assert_eq!(parsed.color, n.color);
        assert_eq!(parsed.body, n.body);
    }

    #[test]
    fn index_rebuild_and_query() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        let books = vec![("john".to_string(), 43)];
        let note = Note {
            id: "n1".into(),
            title: "Word".into(),
            tags: vec![],
            anchors: vec!["John 1:1".into()],
            color: Some("var(--highlight-indigo)".into()),
            created: String::new(),
            modified: String::new(),
            body: String::new(),
        };
        upsert_note(&conn, Path::new("n1.md"), &note, &books).unwrap();
        let hits = notes_for_chapter(&conn, 43, 1).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].verse_start, Some(1));
        assert_eq!(hits[0].color.as_deref(), Some("var(--highlight-indigo)"));
    }

    // Full disk round-trip against the real bible.sqlite (skips if absent, like
    // db.rs). Save -> file on disk -> reload -> index resolves the anchor using
    // the DB's actual book names (catches naming mismatches a stub map hides).
    #[test]
    fn end_to_end_with_real_db() {
        use rusqlite::OpenFlags;
        let bpath = std::path::Path::new("../bible.sqlite");
        if !bpath.exists() {
            eprintln!("skipping: ../bible.sqlite not present");
            return;
        }
        let bible = Connection::open_with_flags(bpath, OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
        let books = book_map(&bible).unwrap();
        let john: String = bible
            .query_row("SELECT name FROM books WHERE id=43", [], |r| r.get(0))
            .unwrap();

        let dir = std::env::temp_dir().join(format!("doxa-notes-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let notes = Connection::open_in_memory().unwrap();
        notes.execute_batch(SCHEMA).unwrap();

        let note = Note {
            id: "e2e".into(),
            title: "Word".into(),
            tags: vec!["x".into()],
            anchors: vec![format!("{john} 1:1")],
            color: Some("var(--highlight-teal)".into()),
            created: "2026-01-01".into(),
            modified: "2026-01-01".into(),
            body: "hello".into(),
        };
        save_note(&notes, &books, &dir, &note).unwrap();
        assert!(dir.join("e2e.md").exists());

        let reloaded = load_notes(&notes, &books, &dir).unwrap();
        assert!(reloaded.iter().any(|n| n.id == "e2e" && n.body == "hello"));
        let hits = notes_for_chapter(&notes, 43, 1).unwrap();
        assert!(hits.iter().any(|h| h.note_id == "e2e" && h.verse_start == Some(1)));

        let _ = fs::remove_dir_all(&dir);
    }
}
