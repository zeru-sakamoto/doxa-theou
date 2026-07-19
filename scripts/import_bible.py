#!/usr/bin/env python3
"""One-time import: local source Bible DB  ->  normalized bible.sqlite.

Replaces the old api.esv.org fetch. Pure stdlib (sqlite3), no network, no deps.
Run once; then copy the output into the app's app-local-data dir (see DESIGN.md).

    python scripts/import_bible.py [--out PATH] [--src PATH] [--table NAME]

The source DB is a single denormalized table (name set via .env/--table) with
16 versions. We import a chosen subset into the app's normalized schema
(books / verse_refs / translations / verse_texts) so notes, cross-refs, and
embeddings can anchor to a stable verse_ref_id, and build an FTS5 index for search.
"""
import argparse
import os
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DEFAULT = ROOT / "bible.sqlite"
ENV_VAR = "BIBLE_SOURCE_DB"  # source DB path — set in .env (the DB isn't shipped with the source)
TABLE_ENV_VAR = "BIBLE_SOURCE_TABLE"  # source table name — set in .env

# Versions to import (all copyrighted; DB stays gitignored). Default reading = ESV.
# Skipped on purpose: Spanish versions (accents corrupted to U+FFFD in the source),
# apocryphal book 777, partial ASV/RV1858, fragmentary KSV/RSV.
VERSIONS = {
    # code:  (name,                license,                      is_default)
    "ESV":  ("English Standard Version",        "personal-cache-copyrighted", 1),
    "NASB": ("New American Standard Bible",     "personal-cache-copyrighted", 0),
    "NKJV": ("New King James Version",          "personal-cache-copyrighted", 0),
    "AMP":  ("Amplified Bible",                 "personal-cache-copyrighted", 0),
    "NIV":  ("New International Version",        "personal-cache-copyrighted", 0),
}

# Source has no abbreviation field, so supply the 66-book canon abbreviations
# (OSIS-style), keyed by the source's book number (1..66 = Genesis..Revelation).
ABBR = {
    1: "Gen", 2: "Exod", 3: "Lev", 4: "Num", 5: "Deut", 6: "Josh", 7: "Judg",
    8: "Ruth", 9: "1Sam", 10: "2Sam", 11: "1Kgs", 12: "2Kgs", 13: "1Chr",
    14: "2Chr", 15: "Ezra", 16: "Neh", 17: "Esth", 18: "Job", 19: "Ps",
    20: "Prov", 21: "Eccl", 22: "Song", 23: "Isa", 24: "Jer", 25: "Lam",
    26: "Ezek", 27: "Dan", 28: "Hos", 29: "Joel", 30: "Amos", 31: "Obad",
    32: "Jonah", 33: "Mic", 34: "Nah", 35: "Hab", 36: "Zeph", 37: "Hag",
    38: "Zech", 39: "Mal", 40: "Matt", 41: "Mark", 42: "Luke", 43: "John",
    44: "Acts", 45: "Rom", 46: "1Cor", 47: "2Cor", 48: "Gal", 49: "Eph",
    50: "Phil", 51: "Col", 52: "1Thess", 53: "2Thess", 54: "1Tim", 55: "2Tim",
    56: "Titus", 57: "Phlm", 58: "Heb", 59: "Jas", 60: "1Pet", 61: "2Pet",
    62: "1John", 63: "2John", 64: "3John", 65: "Jude", 66: "Rev",
}

SCHEMA = """
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
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  license TEXT NOT NULL,
  source TEXT,
  is_default INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE verse_texts (
  verse_ref_id INTEGER NOT NULL REFERENCES verse_refs(id),
  translation_id INTEGER NOT NULL REFERENCES translations(id),
  text TEXT NOT NULL,
  PRIMARY KEY (verse_ref_id, translation_id)
);

-- Populated separately (STEPBible/TSK) — the source DB has no cross-refs.
CREATE TABLE cross_references (
  id INTEGER PRIMARY KEY,
  from_verse_ref_id INTEGER NOT NULL REFERENCES verse_refs(id),
  to_verse_ref_id INTEGER NOT NULL REFERENCES verse_refs(id),
  source TEXT NOT NULL
);

CREATE VIRTUAL TABLE verse_fts USING fts5(
  text,
  verse_ref_id UNINDEXED,
  translation_id UNINDEXED
);

-- ESV section/passage headings, parsed from db/esv_*_testament_headings.md.
CREATE TABLE section_headings (
  id INTEGER PRIMARY KEY,
  book_id INTEGER NOT NULL REFERENCES books(id),
  chapter INTEGER NOT NULL,
  verse_start INTEGER NOT NULL,
  end_chapter INTEGER NOT NULL,
  verse_end INTEGER NOT NULL,
  heading TEXT NOT NULL
);
CREATE INDEX idx_section_headings_loc ON section_headings(book_id, chapter);
"""

HEADINGS_FILES = [
    "esv_new_testament_headings.md",
    "Torah_ESV_Headings.md",
    "Historical_Books_ESV_Headings.md",
    "Wisdom_Literature_ESV_Headings.md",
    "Prophets_Headings_Part1.md",
    "Prophets_Headings_Part2.md",
]
PSALMS_TITLES_FILE = "Psalms_Titles.md"
# Psalms bullets in the general files above are structural notes ("Book I (1-41)"),
# not real headings — the actual per-psalm titles come from PSALMS_TITLES_FILE.
SKIP_HEADING_BOOKS = {"Psalms"}

# "12" / "12a" -> (12, None); "3:12" / "3:12b" -> (3, 12). Trailing a/b half-verse
# letters are dropped (verse_refs has no half-verse granularity).
_REF_PART = re.compile(r"^(?:(\d+):)?(\d+)[ab]?$")


def parse_headings_md(text: str):
    """Yield (book_name, chapter, verse_start, end_chapter, verse_end, heading).

    Bullets are either `* **Heading** (ref)` or `- Heading (ref)` — both styles
    appear across the source files, so the bullet char and bold markers are optional.
    """
    bullet_re = re.compile(r"^[-*]\s+(.+?)\s+\(([^)]+)\)\s*$")
    book = None
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("## "):
            book = line[3:].strip()
            continue
        m = bullet_re.match(line)
        if not m or book is None or book in SKIP_HEADING_BOOKS:
            continue
        heading, ref = m.group(1).strip(), m.group(2)
        if heading.startswith("**") and heading.endswith("**"):
            heading = heading[2:-2]
        parts = ref.split("–") if "–" in ref else ref.split("-")
        start = _REF_PART.match(parts[0].strip())
        if not start:
            raise SystemExit(f"unparseable heading ref {ref!r} in {book} ({heading!r})")
        start_chapter, start_verse = start.groups()
        start_chapter = int(start_chapter) if start_chapter else 1
        start_verse = int(start_verse)
        if len(parts) == 1:
            end_chapter, end_verse = start_chapter, start_verse
        else:
            end = _REF_PART.match(parts[1].strip())
            if not end:
                raise SystemExit(f"unparseable heading ref {ref!r} in {book} ({heading!r})")
            end_chapter, end_verse = end.groups()
            end_chapter = int(end_chapter) if end_chapter else start_chapter
            end_verse = int(end_verse)
        yield book, start_chapter, start_verse, end_chapter, end_verse, heading


# "- Psalm 23: The LORD is my shepherd" -> (23, "The LORD is my shepherd").
# The "## Book N" section dividers in this file are structural only, and ignored.
_PSALM_LINE = re.compile(r"^-\s+Psalm\s+(\d+):\s*(.+)$")


def parse_psalms_titles(text: str):
    for line in text.splitlines():
        m = _PSALM_LINE.match(line.strip())
        if m:
            yield int(m.group(1)), m.group(2).strip()


def load_headings(db: sqlite3.Connection, root: Path) -> int:
    book_id = {name: bid for bid, name in db.execute("SELECT id, name FROM books")}
    rows = []
    for fname in HEADINGS_FILES:
        path = root / "db" / fname
        text = path.read_text(encoding="utf-8")
        for book, c1, v1, c2, v2, heading in parse_headings_md(text):
            if book not in book_id:
                raise SystemExit(f"unknown book {book!r} in {path.name}")
            rows.append((book_id[book], c1, v1, c2, v2, heading))

    psalms_id = book_id["Psalms"]
    ptext = (root / "db" / PSALMS_TITLES_FILE).read_text(encoding="utf-8")
    for chapter, heading in parse_psalms_titles(ptext):
        verse_end = db.execute(
            "SELECT MAX(verse) FROM verse_refs WHERE book_id=? AND chapter=?",
            (psalms_id, chapter),
        ).fetchone()[0]
        if verse_end is None:
            raise SystemExit(f"Psalm {chapter} not found in verse_refs")
        rows.append((psalms_id, chapter, 1, chapter, verse_end, heading))

    db.executemany(
        "INSERT INTO section_headings (book_id, chapter, verse_start, end_chapter, verse_end, heading) "
        "VALUES (?,?,?,?,?,?)",
        rows,
    )
    db.commit()
    return len(rows)


def build(src: Path, out: Path, table: str) -> sqlite3.Connection:
    if not src.exists():
        raise SystemExit(f"source DB not found: {src}")
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", table):
        raise SystemExit(f"invalid source table name: {table!r}")
    if out.exists():
        out.unlink()

    codes = tuple(VERSIONS)
    placeholders = ",".join("?" * len(codes))

    src_db = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
    db = sqlite3.connect(out)
    db.executescript("PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;")
    db.executescript(SCHEMA)

    # books: one row per canonical book (1..66). Titles vary across versions
    # (trailing CR, "Psalms"/"Psalm"), so take a single canonical title from the
    # default version (which is full-Bible), stripped.
    default_code = next(c for c, (_, _, d) in VERSIONS.items() if d)
    rows = src_db.execute(
        f"SELECT book, testament, title FROM {table} "
        "WHERE book BETWEEN 1 AND 66 AND version = ? GROUP BY book ORDER BY book",
        (default_code,),
    ).fetchall()
    db.executemany(
        "INSERT INTO books (id, testament, name, abbr, canonical_order) VALUES (?,?,?,?,?)",
        [(b, tt.strip(), title.strip(), ABBR[b], b) for (b, tt, title) in rows],
    )

    # translations
    db.executemany(
        "INSERT INTO translations (code, name, license, source, is_default) VALUES (?,?,?,?,?)",
        [(c, n, lic, src.name, d) for c, (n, lic, d) in VERSIONS.items()],
    )
    tid = {c: i for c, i in db.execute("SELECT code, id FROM translations")}

    # verse_refs: union of (book, chapter, verse) across the imported versions.
    refs = src_db.execute(
        f"SELECT DISTINCT book, chapter, verse FROM {table} "
        f"WHERE book BETWEEN 1 AND 66 AND version IN ({placeholders}) "
        f"ORDER BY book, chapter, verse",
        codes,
    ).fetchall()
    db.executemany(
        "INSERT INTO verse_refs (book_id, chapter, verse) VALUES (?,?,?)", refs
    )
    ref_id = {
        (b, c, v): i
        for i, b, c, v in db.execute("SELECT id, book_id, chapter, verse FROM verse_refs")
    }

    # verse_texts: one row per (verse, version), trailing CR/whitespace stripped.
    for code in codes:
        vt = src_db.execute(
            f"SELECT book, chapter, verse, text FROM {table} "
            "WHERE version = ? AND book BETWEEN 1 AND 66",
            (code,),
        ).fetchall()
        db.executemany(
            "INSERT INTO verse_texts (verse_ref_id, translation_id, text) VALUES (?,?,?)",
            [(ref_id[(b, c, v)], tid[code], (t or "").rstrip()) for b, c, v, t in vt],
        )

    # FTS index over the imported text.
    db.execute(
        "INSERT INTO verse_fts (rowid, text, verse_ref_id, translation_id) "
        "SELECT rowid, text, verse_ref_id, translation_id FROM verse_texts"
    )
    db.commit()
    src_db.close()

    load_headings(db, ROOT)
    return db


def selfcheck(db: sqlite3.Connection) -> None:
    n = lambda q, *a: db.execute(q, a).fetchone()[0]
    assert n("SELECT COUNT(*) FROM translations") == len(VERSIONS)
    assert n("SELECT COUNT(*) FROM books") == 66
    # union of versifications is ~31.1k; assert a sane full-Bible range.
    assert 31000 <= n("SELECT COUNT(*) FROM verse_refs") <= 31500
    assert n("SELECT COUNT(*) FROM verse_texts") > 150000
    assert n("SELECT COUNT(*) FROM verse_fts") == n("SELECT COUNT(*) FROM verse_texts")
    # John 1:1 (book 43) ESV present and non-empty.
    esv = n("SELECT id FROM translations WHERE code='ESV'")
    john11 = db.execute(
        "SELECT vt.text FROM verse_texts vt JOIN verse_refs r ON r.id = vt.verse_ref_id "
        "WHERE r.book_id=43 AND r.chapter=1 AND r.verse=1 AND vt.translation_id=?",
        (esv,),
    ).fetchone()
    assert john11 and john11[0].strip(), "John 1:1 ESV missing"
    # FTS actually matches.
    assert n("SELECT COUNT(*) FROM verse_fts WHERE verse_fts MATCH 'beginning'") > 0
    # Section headings parsed from both testament files.
    assert 1800 <= n("SELECT COUNT(*) FROM section_headings") <= 2800
    john11_heading = db.execute(
        "SELECT heading FROM section_headings WHERE book_id=43 AND chapter=1 AND verse_start=1"
    ).fetchone()
    assert john11_heading and john11_heading[0] == "The Word Became Flesh"


def load_dotenv(path: Path) -> None:
    """Minimal .env loader (stdlib only): KEY=value lines, # comments, optional quotes."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, val = line.split("=", 1)
            os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


def resolve_src(cli_src) -> Path:
    """Source DB from --src, else $BIBLE_SOURCE_DB (.env). A relative path is from repo root."""
    raw = cli_src or os.environ.get(ENV_VAR)
    if not raw:
        raise SystemExit(
            f"source DB not set: put `{ENV_VAR}=...` in .env "
            f"(copy .env.example) or pass --src PATH. The DB isn't shipped with the source."
        )
    p = Path(raw)
    return p if p.is_absolute() else ROOT / p


def resolve_table(cli_table) -> str:
    """Source table name from --table, else $BIBLE_SOURCE_TABLE (.env)."""
    raw = cli_table or os.environ.get(TABLE_ENV_VAR)
    if not raw:
        raise SystemExit(f"source table not set: put `{TABLE_ENV_VAR}=...` in .env or pass --table NAME.")
    return raw


def main() -> None:
    load_dotenv(ROOT / ".env")
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--src", default=None, help=f"source DB path; default from ${ENV_VAR} in .env")
    ap.add_argument("--table", default=None, help=f"source table name; default from ${TABLE_ENV_VAR} in .env")
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT)
    args = ap.parse_args()

    db = build(resolve_src(args.src), args.out, resolve_table(args.table))
    selfcheck(db)
    counts = {
        t: db.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        for t in ("books", "translations", "verse_refs", "verse_texts", "section_headings")
    }
    db.close()
    print(f"wrote {args.out}")
    print("  " + "  ".join(f"{k}={v}" for k, v in counts.items()))
    print("copy this file into the app-local-data dir as bible.sqlite (see DESIGN.md)")


if __name__ == "__main__":
    main()
