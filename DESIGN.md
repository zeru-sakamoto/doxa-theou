# DESIGN — Backend / Verse Data Layer

How verse text gets from the local source Bible DB into the app. Scope here is
the **read path for scripture** (books, chapters, search). Notes, cross-references,
highlighting, and semantic search are on the roadmap and noted where they attach,
but not built yet.

## Overview

```
db/<your source>.db               scripts/import_bible.py         app-local-data/bible.sqlite
(denormalized, 16 versions,  ──▶  one-time transform +      ──▶  (normalized, 5 versions,
 no indexes/FTS)                  clean + FTS5 build)             FTS5)  ──▶  rusqlite ──▶ #[tauri::command] ──▶ React
```

No network calls. The source DB is a pre-built local file (replaces the old
api.esv.org fetch). We normalize it once into the app's schema so that notes,
cross-refs, and embeddings can anchor to a stable `verse_ref_id`.

## Data source

The local source DB (~58 MB, path/table name set in `.env`, not shipped with the
source) is a single denormalized table
`(testament, book, title, chapter, verse, text, version, language)` plus
16 per-version views. It has **no indexes, no FTS, and no license/cross-ref/Greek/
Strong's data**. `book` is canonical order 1–66; text is plain prose.

We import **5 full-Bible English versions**: `ESV` (default), `NASB`, `NKJV`, `AMP`,
`NIV`. Deliberately skipped: Spanish versions (accents corrupted to U+FFFD in the
source), apocryphal book 777, partial ASV/RV1858, fragmentary KSV/RSV.

All five are copyrighted, so both the source DB and the generated `bible.sqlite`
are gitignored and never committed. See the licensing note in `Bible Study App.md`.

## Schema (`bible.sqlite`)

Canonical structure (`books`, `verse_refs`) is separated from per-translation text
(`verse_texts`), so adding a translation later is inserting rows, not redesigning.

- `books` — 66 rows. `id` = canonical order = the source's book number. `abbr` comes
  from a static OSIS-style map in the import script (the source has no abbreviations).
- `verse_refs` — the **union** of `(book_id, chapter, verse)` across the imported
  versions (~31,102 rows; versions differ slightly in versification). This is the
  stable anchor id everything else references.
- `translations` — 5 rows with `code`, `name`, `license`, `source`, `is_default`.
- `verse_texts` — `(verse_ref_id, translation_id) → text` (~155k rows). A version
  missing a given verse simply has no row for it.
- `cross_references` — defined, **empty**. Populated later from STEPBible/TSK.
- `verse_fts` — FTS5 virtual table `(text, verse_ref_id UNINDEXED, translation_id
UNINDEXED)` mirroring `verse_texts`, for search.

## Import pipeline — `scripts/import_bible.py`

One-time, stdlib `sqlite3` only, no deps. `python scripts/import_bible.py [--out PATH] [--src PATH] [--table NAME]`.
The source-DB path and table name come from `BIBLE_SOURCE_DB`/`BIBLE_SOURCE_TABLE` in
`.env` (copy `.env.example`); `--src`/`--table` override them. The DB isn't shipped
with the open-source app, so a fresh clone must set these.

1. Create the schema above (drops/recreates the output file).
2. Seed `books` from the default version's rows (one canonical, stripped title per book).
3. Seed `translations` from the `VERSIONS` table in the script.
4. Insert `verse_refs` from the distinct verse keys across imported versions; keep an
   in-memory `(book,ch,verse) → verse_ref_id` map.
5. Insert `verse_texts` per version (trailing CR/whitespace stripped).
6. Populate `verse_fts` from `verse_texts`.
7. A final `assert`-based self-check (row counts, John 1:1 ESV present, FTS matches).

To change which translations ship, edit `VERSIONS` and re-run.

## DB location & delivery

Rust opens `app.path().app_local_data_dir()/bible.sqlite` (e.g.
`%LOCALAPPDATA%/com.zeru-sakamoto.doxa-theou/bible.sqlite` on Windows). The import
script writes to the repo root; **copy that file into the app-local-data dir once**.
If it's missing, the Rust `db::open` error names the exact expected path and the
import command.

<!-- ponytail: manual one-time copy. Bundle bible.sqlite as a Tauri `resources`
     entry and copy on first run only if this ever ships to other machines. -->

## Rust command surface (`src-tauri/src/db.rs`, wired in `lib.rs`)

The connection is opened **read-only** in `setup` and stored as
`State<Mutex<Connection>>`. Commands (JS `camelCase` args map to Rust `snake_case`):

| Command             | Args                           | Returns                                                                         |
| ------------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| `list_books`        | —                              | `Book[]` (id, testament, name, abbr, canonical_order)                           |
| `list_translations` | —                              | `Translation[]` (id, code, name, license, is_default)                           |
| `get_chapter`       | `bookId, chapter, translation` | `Verse[]` (verse_ref_id, chapter, verse, text)                                  |
| `search`            | `query, translation?`          | `SearchHit[]` (verse_ref_id, book_id, chapter, verse, translation, text, score) |

`rusqlite` uses the `bundled` feature (compiles SQLite in-tree, FTS5 included, no
system dependency). No `capabilities/` change is needed — app-defined commands are
invocable by default in Tauri 2; rusqlite is in-process, not a plugin.

## Search

`get_chapter` is a plain indexed lookup. `search` runs FTS5 `MATCH` ordered by
`bm25()` (lower = better), optionally filtered to one translation, capped at 50 hits.
Query text is passed to `MATCH` as-is for now.

Roadmap (not built): fuzzy/edit-distance tolerance, and offline semantic similarity
(`all-MiniLM-L6-v2` via `fastembed-rs`, vectors cached in SQLite), blended with the
lexical score into one ranked list.

## Where future features attach

`verse_ref_id` is the join point for everything downstream: multi-anchor notes
(note ↔ verse_ref_id ↔ tag), `cross_references.from/to_verse_ref_id`, and cached
verse embeddings. Notes stay Markdown-on-disk (source of truth); the DB is the index.
Those get their own writable store — the verse data here is opened read-only.

## Verification

1. `python scripts/import_bible.py` → self-check passes; prints counts
   (`books=66 translations=5 verse_refs≈31102 verse_texts≈155505`).
2. Copy `bible.sqlite` into the app-local-data dir.
3. From `src-tauri/`: `cargo check`.
4. `npm run tauri dev`, click **Load John 1 (ESV)** (or in devtools:
   `invoke('search', { query: 'shepherd', translation: 'ESV' })`).
