# DESIGN — Backend / Verse Data Layer

How verse text gets from the local source Bible DB into the app. Scope here is
the **read path for scripture** (books, chapters, search). Notes, cross-references,
highlighting, and semantic search are on the roadmap and noted where they attach,
but not built yet.

## Overview

```
db/bible.db                        scripts/import_bible.py         app-local-data/bible.sqlite
(verses + headings,          ──▶  one-time transform +      ──▶  (normalized, 6 translations,
 6 translations, no FTS)          fix + clean + FTS5 build)        FTS5)  ──▶  rusqlite ──▶ #[tauri::command] ──▶ React
```

No network calls. The source DB is a pre-built local file (replaces the old
api.esv.org fetch). We normalize it once into the app's schema so that notes,
cross-refs, and embeddings can anchor to a stable `verse_ref_id`.

## Data source

The local source DB (path set in `.env`, not shipped with the source) has two
tables:

```sql
verses(translation, book, chapter, verse, text)
headings(translation, book, chapter, verse_start, position, text)
```

`book` is the full English book name (e.g. `'1 Chronicles'`, the singular
`'Psalm'`), not a book number — there's no book-metadata table, so
`import_bible.py` supplies a static 66-book canon list (name, testament, abbr)
keyed by that name. `headings.position` distinguishes a section heading (`0`)
from psalm/passage superscription lines (`1`+); every row becomes its own
`section_headings` entry, in reading order.

We import **whatever translations are present** in the source (currently 6:
`ESV` default, `NASB`, `NKJV`, `AMP`, `NIV`, `NLT`) — translation rows are
discovered dynamically, not hardcoded, so adding a 7th to the source just
works (falls back to `name = code` if not in `TRANSLATION_META`).

All are copyrighted, so both the source DB and the generated `bible.sqlite`
are gitignored and never committed. See the licensing note in `Bible Study App.md`.

The source has known data-entry quirks that the import script corrects or
works around:

- **Verse-1 mislabeling**: many chapters' first verse is labeled with
  `verse == chapter number` instead of `1`. Fixed by remapping when doing so
  makes the chapter's verse set contiguous `1..N`; left alone when verse 1 is
  genuinely absent from the source (no data to recover).
- **Trailing scraper artifacts**: literal `" end of footnotes"` /
  `" end of crossrefs"` strings appended to some verses — stripped.
- **Glued text**: missing spaces at some punctuation/case boundaries from
  stripped line breaks — patched with a best-effort (not exhaustive) regex pass.

## Schema (`bible.sqlite`)

Canonical structure (`books`, `verse_refs`) is separated from per-translation text
(`verse_texts`), so adding a translation later is inserting rows, not redesigning.

- `books` — 66 rows. `id` = canonical order. `abbr` comes from a static
  OSIS-style map in the import script (the source has no abbreviations).
- `verse_refs` — the **union** of `(book_id, chapter, verse)` across the imported
  translations (~30,348 rows; translations differ slightly in versification). This
  is the stable anchor id everything else references.
- `translations` — one row per translation actually found in the source, with
  `code`, `name`, `license`, `source`, `is_default`.
- `verse_texts` — `(verse_ref_id, translation_id) → text` (~182k rows). A
  translation missing a given verse simply has no row for it.
- `cross_references` — defined, **empty**. Populated later from STEPBible/TSK.
- `verse_fts` — FTS5 virtual table `(text, verse_ref_id UNINDEXED, translation_id
UNINDEXED)` mirroring `verse_texts`, for search.
- `section_headings` — one row per heading **per translation** (`translation_id`
  column), since the source has real headings for every translation, not just ESV.

## Import pipeline — `scripts/import_bible.py`

One-time, stdlib `sqlite3` only, no deps. `python scripts/import_bible.py [--out PATH] [--src PATH]`.
The source-DB path comes from `BIBLE_SOURCE_DB` in `.env` (copy `.env.example`);
`--src` overrides it. The DB isn't shipped with the open-source app, so a fresh
clone must set this.

1. Create the schema above (drops/recreates the output file).
2. Seed `books` from the static `BOOKS` canon list in the script.
3. Discover translations present in the source (`SELECT DISTINCT translation`) and
   seed `translations`, looking up display name/license in `TRANSLATION_META`.
4. Per translation: read `verses`, apply the verse-1 remap and text cleanup, then
   union the corrected `(book,ch,verse)` keys across translations into `verse_refs`;
   keep an in-memory `(book,ch,verse) → verse_ref_id` map.
5. Insert `verse_texts` per translation.
6. Per translation: read `headings`, compute each anchor's `verse_end` from the next
   heading in the same chapter (or the chapter's last verse), insert into
   `section_headings` with its `translation_id`.
7. Populate `verse_fts` from `verse_texts`.
8. A final `assert`-based self-check (row counts, John 1:1 ESV verse + heading present,
   FTS matches).

Adding a translation to the source DB is picked up automatically on the next run.

## DB location & delivery

Rust opens `app.path().app_local_data_dir()/bible.sqlite` (e.g.
`%LOCALAPPDATA%/com.zeru-sakamoto.doxa-theou/bible.sqlite` on Windows). The import
script writes to the repo root; **copy that file into the app-local-data dir once**.
If it's missing, the Rust `db::open` error names the exact expected path and the
import command.

<!-- Manual one-time copy. Bundle bible.sqlite as a Tauri `resources`
     entry and copy on first run only if this ever ships to other machines. -->

## Rust command surface (`src-tauri/src/db.rs`, wired in `lib.rs`)

The connection is opened **read-only** in `setup` and stored as
`State<Mutex<Connection>>`. Commands (JS `camelCase` args map to Rust `snake_case`):

| Command                        | Args                           | Returns                                                                                     |
| ------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------- |
| `list_books`                   | —                              | `Book[]` (id, testament, name, abbr, canonical_order)                                       |
| `list_translations`            | —                              | `Translation[]` (id, code, name, license, is_default)                                       |
| `get_chapter`                  | `bookId, chapter, translation` | `Verse[]` (verse_ref_id, chapter, verse, text)                                              |
| `section_headings_for_chapter` | `bookId, chapter, translation` | `SectionHeading[]` (chapter, verse_start, end_chapter, verse_end, heading), per translation |
| `search`                       | `query, translation?`          | `SearchHit[]` (verse_ref_id, book_id, chapter, verse, translation, text, score)             |

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
   (`books=66 translations=6 verse_refs≈30348 verse_texts≈181878 section_headings≈15313`).
2. Copy `bible.sqlite` into the app-local-data dir.
3. From `src-tauri/`: `cargo check`.
4. `npm run tauri dev`, click **Load John 1 (ESV)** (or in devtools:
   `invoke('search', { query: 'shepherd', translation: 'ESV' })`).
