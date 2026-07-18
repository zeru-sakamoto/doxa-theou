# Database

Two SQLite files are involved. Neither is committed to the repo (both gitignored,
copyrighted verse text).

1. **Source DB** — a local, pre-built, denormalized DB you provide yourself. Its
   path and table name are set via `BIBLE_SOURCE_DB` / `BIBLE_SOURCE_TABLE` in
   `.env` (copy `.env.example` to start). Single table:
   `(testament, book, title, chapter, verse, text, version, language)`. No
   indexes, no FTS, no license/cross-ref data.
2. **`bible.sqlite`** — the normalized DB the app actually reads, built from the
   source DB by `scripts/import_bible.py`.

## Building `bible.sqlite`

```
cp .env.example .env
# edit .env: set BIBLE_SOURCE_DB and BIBLE_SOURCE_TABLE
python scripts/import_bible.py
```

stdlib-only, one-time. Drops/recreates the output file, then:

1. Seeds `books` (66 rows, canonical order 1–66) from the default version.
2. Seeds `translations` (5 rows: ESV default, NASB, NKJV, AMP, NIV).
3. Builds `verse_refs` — the union of `(book_id, chapter, verse)` across
   imported versions (~31,102 rows). This is the stable id everything else
   (notes, cross-references, embeddings) will anchor to.
4. Inserts `verse_texts` — `(verse_ref_id, translation_id) → text` (~155k rows).
5. Populates `verse_fts`, an FTS5 mirror of `verse_texts` for search.
6. Runs an `assert`-based self-check (row counts, a known verse present, FTS
   matches) and prints counts.

`--out`/`--src`/`--table` flags override the `.env` values if needed.

## Where the app reads it from

Rust opens `bible.sqlite` **read-only** from the app-local-data dir (e.g.
`%LOCALAPPDATA%/com.zeru-sakamoto.doxa-theou/bible.sqlite` on Windows), not
the repo root. After running the import script, copy the generated file there
once. If it's missing, the `db::open` error prints the exact expected path.

See `DESIGN.md` for the full schema, the Rust command surface
(`src-tauri/src/db.rs`), and the roadmap (cross-references, semantic search).
