# Database

Two SQLite files are involved. Neither is committed to the repo (both gitignored,
copyrighted verse text).

1. **Source DB**: a local, pre-built DB you provide yourself. Its path is set
   via `BIBLE_SOURCE_DB` in `.env` (copy `.env.example` to start). Two fixed
   tables: `verses(translation, book, chapter, verse, text)` and
   `headings(translation, book, chapter, verse_start, position, text)`, `book`
   keyed by full English name. No indexes, no FTS, no cross-ref data.
2. **`bible.sqlite`**: the normalized DB the app actually reads, built from the
   source DB by `scripts/import_bible.py`.

## Building `bible.sqlite`

```
cp .env.example .env
# edit .env: set BIBLE_SOURCE_DB
python scripts/import_bible.py
```

stdlib-only, one-time. Drops/recreates the output file, then:

1. Seeds `books` (66 rows, canonical order 1–66) from a static canon list.
2. Seeds `translations` from whichever translations are present in the source
   (currently 6: ESV default, NASB, NKJV, AMP, NIV, NLT).
3. Builds `verse_refs`: the union of `(book_id, chapter, verse)` across
   imported translations (~30,348 rows), after fixing the source's verse-1
   mislabeling bug. This is the stable id everything else (notes,
   cross-references, embeddings) will anchor to.
4. Inserts `verse_texts`: `(verse_ref_id, translation_id) → text` (~182k rows),
   with scraper artifacts stripped and glued text lightly re-spaced.
5. Inserts `section_headings` per translation (~15,313 rows total) from the
   source's `headings` table.
6. Populates `verse_fts`, an FTS5 mirror of `verse_texts` for search.
7. Runs an `assert`-based self-check (row counts, a known verse + heading
   present, FTS matches) and prints counts.

`--out`/`--src` flags override the `.env` values if needed.

## Source data quirks the import fixes

The source DB has known data-entry problems, corrected or worked around during
import (not present in the generated `bible.sqlite`):

- **Verse-1 mislabeling**: many chapters' first verse is labeled with
  `verse == chapter number` instead of `1` (e.g. Psalm 23:1 stored as verse 23).
  `verse1_remap()` in the script fixes this whenever swapping that row's verse
  number for `1` makes the chapter's verse set perfectly contiguous `1..N`
  (1,801 chapters across all translations). Where verse 1 is genuinely absent
  from the source with no such row to recover (~4,613 chapters, mostly
  genealogy-heavy (e.g. 1 Chronicles) where the source just starts at verse
  2), it's left as a gap; other translations still supply that `verse_ref` via
  the union.
- **Trailing scraper artifacts**: literal `" end of footnotes"` /
  `" end of crossrefs"` strings appended to some verses' text. Stripped by
  `clean_text()`.
- **Glued text**: missing spaces where line breaks were stripped (mostly
  poetry), e.g. `"pastures.He leads"` or `"TheLordHelps"`. `clean_text()`
  patches the common punctuation- and case-boundary cases with a regex pass;
  this is a heuristic, not exhaustive; rarer glued words with no
  punctuation/case signal (e.g. `"Maskilofthe"`) aren't caught.

## Where the app reads it from

Rust opens `bible.sqlite` **read-only** from the app-local-data dir (e.g.
`%LOCALAPPDATA%/com.zeru-sakamoto.doxa-theou/bible.sqlite` on Windows), not
the repo root. After running the import script, copy the generated file there
once. If it's missing, the `db::open` error prints the exact expected path.

See `DESIGN.md` for the full schema, the Rust command surface
(`src-tauri/src/db.rs`), and the roadmap (cross-references, semantic search).
