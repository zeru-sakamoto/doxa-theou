---
tags:
  - Application-Development
  - Logo-Design
  - Side-Project
---

# Δόξα Θεοῦ (Doxa Theou): Bible Study App

Tauri + Rust desktop app. Greek-titled ("Glory of God") per its NT focus. Design-first: brand/theme below is consolidated; functional specs (note-taking, cross-referencing, verse data, etc.) to be filled in later.

## Brand Direction: "Koine Ink"

Utilitarian, low-iconography, information-dense. Built for active note-taking and cross-referencing. The theme recedes so content leads. Mood reference: Logos Bible Software crossed with a modern code editor.

**Tagline:** open item.

**Logo:** open item. Wordmark-only vs. wordmark+glyph not yet decided.

## Color System

Light and dark are both first-class themes (not one default with the other inverted/bolted on).

**Light theme** (`bg`, `bg-panel`, `text`, `text-muted`, `border`, `accent`)

```palette
#F5F6F8, #EAEBEF, #1E2024, #5B6270, #D8DAE0, #3B4C9E
{"gradient": false, "aliases": ["bg", "bg-panel", "text", "text-muted", "border", "accent"]}
```

**Dark theme** (`bg`, `bg-panel`, `text`, `text-muted`, `border`, `accent`)

```palette
#14161C, #1B1E26, #E4E6EB, #8A90A0, #2A2D37, #7C8FE0
{"gradient": false, "aliases": ["bg", "bg-panel", "text", "text-muted", "border", "accent"]}
```

**Highlight/tagging colors** (for verse annotation) are **user-configurable**, not fixed brand tokens. The app ships a sensible default swatch set (~6 colors); the palette itself is a per-user setting. Treat as a functional requirement, not a brand constant.

## Typography

- **Body / verse text:** Newsreader (serif, full Greek + Latin diacritic coverage, reads well dense).
- **UI chrome / labels:** IBM Plex Sans.
- **Verse references / cross-ref tags / scannable data:** IBM Plex Mono.

**Font previews**

<div style="border:1px solid var(--background-modifier-border); border-radius:8px; padding:16px; margin-bottom:10px;">
<div style="font-family:'Newsreader', Georgia, 'Times New Roman', serif; font-size:2em; font-weight:600; line-height:1.3;">Newsreader: body / verse text</div>
<div style="font-family:'Newsreader', Georgia, 'Times New Roman', serif; font-size:1.15em; margin-top:6px;">Ἐν ἀρχῇ ἦν ὁ Λόγος — "In the beginning was the Word" (John 1:1)</div>
</div>

<div style="border:1px solid var(--background-modifier-border); border-radius:8px; padding:16px; margin-bottom:10px;">
<div style="font-family:'IBM Plex Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; font-size:2em; font-weight:600; line-height:1.3;">IBM Plex Sans: UI chrome / labels</div>
<div style="font-family:'IBM Plex Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; font-size:1.15em; margin-top:6px;">Search · Notes · Cross-References · Highlights</div>
</div>

<div style="border:1px solid var(--background-modifier-border); border-radius:8px; padding:16px; margin-bottom:10px;">
<div style="font-family:'IBM Plex Mono', 'Courier New', monospace; font-size:2em; font-weight:600; line-height:1.3;">IBM Plex Mono: verse refs / scannable data</div>
<div style="font-family:'IBM Plex Mono', 'Courier New', monospace; font-size:1.15em; margin-top:6px;">John 3:16 · Rom.8:28 · 1 Cor.13:4-7</div>
</div>

## Voice & Tone

Utilitarian and precise, no devotional flourish in UI copy. Errors and empty states read like a research tool, not a devotional.

- Use: "No cross-references found."
- Avoid: "This passage stands alone for now."

## Layout / Density Philosophy

Theme recedes, content leads: minimal chrome, thin borders over shadows, `bg-panel` tier separates reading pane / notes pane / cross-ref pane without heavy dividers. (Philosophy note for now — token-level spacing scale to be defined alongside actual UI work.)

---

## Functionality

### Translation / Text Data Sourcing

- **Verse source (this build): local source-DB import — no network, no ESV API.** Verse text is imported once from a pre-built local source DB (a denormalized SQLite of 16 versions; path/table name set in `.env`, not shipped with the repo) into the normalized schema below. This replaces the earlier plan of fetching ESV per-chapter from api.esv.org. Full pipeline in `DESIGN.md`.
- **Imported versions:** ESV (default), NASB, NKJV, AMP, NIV — all full-Bible English. Skipped from the source: Spanish versions (accents corrupted to U+FFFD at import time), apocryphal book 777, partial ASV/RV1858, fragmentary KSV/RSV.
- **Repo stays open source; the verse text does not.** All five imported versions are copyrighted. Both the source DB and the generated `bible.sqlite` are gitignored and never committed — same posture the old ESV plan required. **Caveat:** unlike that plan, no public-domain translation is currently bundled as a fallback default. If ever open-sourced, ship a public-domain version (WEB or KJV — both present in the source DB) as the default and make the copyrighted ones an optional per-user import.
- Greek NT + morphology: MorphGNT (SBLGNT text, full morphological tags, GitHub `morphgnt/sblgnt`) or STEPBible (Tyndale House, CC-licensed, includes Strong's-linked glosses) — both freely redistributable, safe to bundle even if open-sourced.
- Definitions: Strong's Greek Dictionary (public domain, e.g. `openscriptures/strongs` JSON) joined to Greek text via Strong's number. LSJ (Perseus, public domain XML) for deeper lexicon lookup if needed.
- **Translation compatibility:** data model is not ESV-specific — `books`/`verse_refs` are separated from per-translation `verse_texts`, so adding a translation is inserting rows. The source DB already supplies several (KJV, WEB, YLT, etc. are present in the source and can be enabled by editing the import script); copyrighted translations not in the source (NLT, CSB) would still use a live-fetch/cached pattern via api.esv.org or api.bible.

**Verse import mechanics (finalized):**

- **Import script:** `scripts/import_bible.py` — standalone one-off Python (stdlib `sqlite3` only; no `requests`, no deps, no API key), not part of the Tauri/Rust build. Run manually once. Reads the source DB path from `BIBLE_SOURCE_DB` in `.env` (the DB isn't shipped with the source; copy `.env.example`), writes a normalized `bible.sqlite`.
- **Import method:** the source has two fixed tables, `verses(translation, book, chapter, verse, text)` and `headings(translation, book, chapter, verse_start, position, text)`, keyed by full English book name and covering whichever translations are present (currently 6: ESV, NASB, NKJV, AMP, NIV, NLT — discovered dynamically, not hardcoded); seed `books` (66 rows; static OSIS abbreviations added since the source has none), `verse_refs` (union of the translations' versifications, after fixing a verse-1 mislabeling bug in the source), `translations` (with license metadata added — the source carries none), `verse_texts` (with scraper artifacts stripped), and `section_headings` per translation (the source has real headings for all 6, not just ESV); build an FTS5 index; end with an `assert` self-check. Produces ~30,348 `verse_refs`, ~182k `verse_texts`, ~15,313 `section_headings`.
- **Storage location:** the generated `bible.sqlite` lives in the OS app-local-data directory (Tauri's path resolver, `%LOCALAPPDATA%/com.zeru-sakamoto.doxa-theou/bible.sqlite` on Windows), not in the repo tree. Copy it there once after running the import; the Rust side prints the exact expected path if it's missing.
- **Git hygiene:** the app is open source, the DB is not. `.gitignore` covers `.env`, `*.sqlite`, `*.db`, and the whole `/db/` folder. `.env` holds `BIBLE_SOURCE_DB` (the local source-DB path); a committed `.env.example` documents it. The import script, schema, and `.env.example` are safe to commit — only the DB data (source and generated) is excluded. No API key anymore.
- **No cross-references in the source** — the source DB has none, and it carries no Greek/Strong's/morphology either. Cross-ref data stays a separate sourcing question (see Cross-Referencing UX below), independent of this import.

### Core Data Model

Translation-independent canonical structure (`books`, `verse_refs`) is separated from per-translation text (`verse_texts`), so adding KJV/NLT/CSB later per-user is just inserting rows, not redesigning tables.

```sql
CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  testament TEXT NOT NULL CHECK (testament IN ('OT','NT')),
  name TEXT NOT NULL,
  abbr TEXT NOT NULL,
  canonical_order INTEGER NOT NULL UNIQUE
);

CREATE TABLE verse_refs (
  id INTEGER PRIMARY KEY,
  book_id INTEGER NOT NULL REFERENCES books(id),
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  UNIQUE (book_id, chapter, verse)
);

CREATE TABLE translations (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,       -- 'ESV', 'KJV', ...
  name TEXT NOT NULL,
  license TEXT NOT NULL,           -- 'personal-cache-copyrighted', 'public-domain'
  source TEXT                      -- 'api.esv.org', ...
);

CREATE TABLE verse_texts (
  verse_ref_id INTEGER NOT NULL REFERENCES verse_refs(id),
  translation_id INTEGER NOT NULL REFERENCES translations(id),
  text TEXT NOT NULL,
  PRIMARY KEY (verse_ref_id, translation_id)
);

-- Schema finalized now; population deferred to Cross-Referencing UX section,
-- since cross-ref sourcing (STEPBible/TSK) is independent of the ESV fetch above.
CREATE TABLE cross_references (
  id INTEGER PRIMARY KEY,
  from_verse_ref_id INTEGER NOT NULL REFERENCES verse_refs(id),
  to_verse_ref_id INTEGER NOT NULL REFERENCES verse_refs(id),
  source TEXT NOT NULL             -- e.g. 'STEPBible', 'TSK', 'user'
);
```

- `books` is seeded once from static canon data (66 rows) — not fetched from any API.
- FTS5 indexing of `verse_texts.text` belongs to the Search section below, not duplicated here.

### Note-Taking & Annotation System

- [ ] Logos-style multi-anchor notes: a single note can attach to multiple verse anchors (not just one verse or a single range) — e.g. one note tying John 1:1, Gen 1:1, and Col 1:16 together.
- [ ] Anchors drive highlighting: each anchor on a note carries its own tag/color, so the same note can highlight different verses differently (e.g. "promise" tag = amber on one anchor, "fulfillment" tag = blue on another) per the user-configurable palette above.
- [ ] Notes stored as **Markdown files on disk**, not DB blobs — each note is its own `.md` file with **frontmatter** holding structured metadata (anchors/verse refs, tags, created/modified dates, note id). Markdown body is freeform annotation text.
- [ ] SQLite index/join table (note id ↔ verse anchor ↔ tag) so cross-referencing and search stay fast — parsed from frontmatter at import/watch time rather than hand-maintained, .md files stay source of truth.

### Cross-Referencing UX

- [ ] Surface cross-refs for a verse (from Greek data source + any user notes anchoring it) in the cross-ref pane.
- [ ] Navigate between anchors of a multi-anchor note directly (jump from John 1:1 to Col 1:16 via the same note).

### Highlight / Tagging System

- [ ] User-configurable palette (per Color System above) rather than fixed brand tokens.
- [ ] Tags apply per-anchor (see Note-Taking section) — same note, different color per verse.

### Search

- [ ] Hybrid search: blend lexical matching (SQLite FTS5 + BM25) with offline semantic similarity, so a query can surface passages/notes that mean roughly the same thing without sharing the same words.
- [ ] Fuzzy layer: edit-distance matching (e.g. `fuzzy-matcher` or `strsim` crate) for typo / near-wording tolerance on top of FTS5.
- [ ] Semantic layer: embed verse text and note bodies at index time with a small locally-bundled model (`all-MiniLM-L6-v2` via `fastembed-rs`, ONNX runtime, ~90MB) — no network calls, fully offline. Cache resulting vectors in SQLite alongside the existing note/tag join table.
- [ ] Query time: embed the query string with the same local model, score cached vectors by cosine similarity. Brute-force scan is sufficient at this corpus size (~8k NT verses + however many notes) — no ANN index needed.
- [ ] Blend lexical (BM25/fuzzy) score and semantic (cosine similarity) score into one ranked list per group.
- [ ] Results presented in two groups — **Verses** and **Notes** — each internally sorted by the blended hybrid score.
- [ ] Tags remain exact-match filters, not part of the fuzzy/semantic layer.

### Tauri/Rust Architecture

- [ ] Backend data layer (SQLite + file-watcher for note `.md` files).
- [ ] Bundle local embedding model (`all-MiniLM-L6-v2` via `fastembed-rs`/ONNX) for offline semantic search; embeddings computed at note-save / verse-import time and cached in SQLite.
- [ ] Frontend framework choice.

### Logo/Mark

- [ ] See open item under Brand Direction above.
