#!/usr/bin/env python3
"""One-time import: local source Bible DB  ->  normalized bible.sqlite.

Pure stdlib (sqlite3), no network, no deps. Run once; then copy the output
into the app's app-local-data dir (see DESIGN.md).

    python scripts/import_bible.py [--out PATH] [--src PATH]

The source DB has two tables, `verses(translation, book, chapter, verse, text)`
and `headings(translation, book, chapter, verse_start, position, text)`, both
keyed by full English book name (not a book number) and covering every
translation present. We import it all into the app's normalized schema
(books / verse_refs / translations / verse_texts / section_headings) so notes,
cross-refs, and embeddings can anchor to a stable verse_ref_id, and build an
FTS5 index for search.
"""
import argparse
import os
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DEFAULT = ROOT / "bible.sqlite"
ENV_VAR = "BIBLE_SOURCE_DB"  # source DB path — set in .env (the DB isn't shipped with the source)

# code -> (full name, license). Any translation present in the source but not
# listed here still imports fine (name falls back to the code itself).
TRANSLATION_META = {
    "ESV": ("English Standard Version", "personal-cache-copyrighted"),
    "NASB": ("New American Standard Bible", "personal-cache-copyrighted"),
    "NKJV": ("New King James Version", "personal-cache-copyrighted"),
    "AMP": ("Amplified Bible", "personal-cache-copyrighted"),
    "NIV": ("New International Version", "personal-cache-copyrighted"),
    "NLT": ("New Living Translation", "personal-cache-copyrighted"),
}
DEFAULT_TRANSLATION = "ESV"

# The 66-book canon in canonical order, (display name, testament, OSIS-style
# abbreviation). Source has no book-metadata table, so this is static.
BOOKS = [
    ("Genesis", "OT", "Gen"), ("Exodus", "OT", "Exod"), ("Leviticus", "OT", "Lev"),
    ("Numbers", "OT", "Num"), ("Deuteronomy", "OT", "Deut"), ("Joshua", "OT", "Josh"),
    ("Judges", "OT", "Judg"), ("Ruth", "OT", "Ruth"), ("1 Samuel", "OT", "1Sam"),
    ("2 Samuel", "OT", "2Sam"), ("1 Kings", "OT", "1Kgs"), ("2 Kings", "OT", "2Kgs"),
    ("1 Chronicles", "OT", "1Chr"), ("2 Chronicles", "OT", "2Chr"), ("Ezra", "OT", "Ezra"),
    ("Nehemiah", "OT", "Neh"), ("Esther", "OT", "Esth"), ("Job", "OT", "Job"),
    ("Psalms", "OT", "Ps"), ("Proverbs", "OT", "Prov"), ("Ecclesiastes", "OT", "Eccl"),
    ("Song of Solomon", "OT", "Song"), ("Isaiah", "OT", "Isa"), ("Jeremiah", "OT", "Jer"),
    ("Lamentations", "OT", "Lam"), ("Ezekiel", "OT", "Ezek"), ("Daniel", "OT", "Dan"),
    ("Hosea", "OT", "Hos"), ("Joel", "OT", "Joel"), ("Amos", "OT", "Amos"),
    ("Obadiah", "OT", "Obad"), ("Jonah", "OT", "Jonah"), ("Micah", "OT", "Mic"),
    ("Nahum", "OT", "Nah"), ("Habakkuk", "OT", "Hab"), ("Zephaniah", "OT", "Zeph"),
    ("Haggai", "OT", "Hag"), ("Zechariah", "OT", "Zech"), ("Malachi", "OT", "Mal"),
    ("Matthew", "NT", "Matt"), ("Mark", "NT", "Mark"), ("Luke", "NT", "Luke"),
    ("John", "NT", "John"), ("Acts", "NT", "Acts"), ("Romans", "NT", "Rom"),
    ("1 Corinthians", "NT", "1Cor"), ("2 Corinthians", "NT", "2Cor"), ("Galatians", "NT", "Gal"),
    ("Ephesians", "NT", "Eph"), ("Philippians", "NT", "Phil"), ("Colossians", "NT", "Col"),
    ("1 Thessalonians", "NT", "1Thess"), ("2 Thessalonians", "NT", "2Thess"),
    ("1 Timothy", "NT", "1Tim"), ("2 Timothy", "NT", "2Tim"), ("Titus", "NT", "Titus"),
    ("Philemon", "NT", "Phlm"), ("Hebrews", "NT", "Heb"), ("James", "NT", "Jas"),
    ("1 Peter", "NT", "1Pet"), ("2 Peter", "NT", "2Pet"), ("1 John", "NT", "1John"),
    ("2 John", "NT", "2John"), ("3 John", "NT", "3John"), ("Jude", "NT", "Jude"),
    ("Revelation", "NT", "Rev"),
]
assert len(BOOKS) == 66

# The source spells the Psalms book in the singular; everything else matches
# the display name above exactly.
SOURCE_BOOK_NAME = {"Psalms": "Psalm"}

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

-- Section/passage headings and psalm-title lines, one row per translation
-- (the source has real headings per translation, not just ESV).
CREATE TABLE section_headings (
  id INTEGER PRIMARY KEY,
  book_id INTEGER NOT NULL REFERENCES books(id),
  chapter INTEGER NOT NULL,
  verse_start INTEGER NOT NULL,
  end_chapter INTEGER NOT NULL,
  verse_end INTEGER NOT NULL,
  heading TEXT NOT NULL,
  translation_id INTEGER NOT NULL REFERENCES translations(id)
);
CREATE INDEX idx_section_headings_loc ON section_headings(book_id, chapter, translation_id);
"""

_ARTIFACTS = (" end of footnotes", " end of crossrefs")


def clean_text(text: str) -> str:
    """Strip trailing scraper artifacts and lightly re-space glued words.

    The source occasionally appends literal " end of footnotes"/" end of
    crossrefs" markers, and strips line breaks (mostly in poetry) without
    inserting a space. The re-spacing is a heuristic, not exhaustive text
    cleanup — it fixes the common punctuation/case-boundary and
    punctuation/opening-quote cases (e.g. `says,"Rejoice` -> `says, "Rejoice`);
    rarer glued words with no case signal (e.g. "Maskilofthe") are left as-is.
    """
    text = text or ""
    changed = True
    while changed:
        changed = False
        for artifact in _ARTIFACTS:
            if text.endswith(artifact):
                text = text[: -len(artifact)]
                changed = True
    text = text.rstrip()
    text = re.sub(r"(?<=[.!?,;:])(?=[A-Za-z])", " ", text)
    text = re.sub(r"(?<=[.!?,;:])(?=[“‘])", " ", text)
    text = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", text)
    return text


def verse1_remap(chapter: int, verses: set) -> dict:
    """{old_verse: 1} if this chapter's verse 1 was mislabeled as `chapter`.

    The source labels each chapter's first verse with verse == chapter number
    instead of 1 in many places. Only remap when doing so makes the verse set
    perfectly contiguous 1..N — otherwise verse 1 is genuinely absent from the
    source (common in genealogy-heavy chapters) and there's nothing to recover.
    """
    if 1 in verses or chapter not in verses:
        return {}
    fixed = (verses - {chapter}) | {1}
    return {chapter: 1} if fixed == set(range(1, len(fixed) + 1)) else {}


def build(src: Path, out: Path) -> sqlite3.Connection:
    if not src.exists():
        raise SystemExit(f"source DB not found: {src}")
    if out.exists():
        out.unlink()

    src_db = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
    db = sqlite3.connect(out)
    db.executescript("PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;")
    db.executescript(SCHEMA)

    codes = [
        r[0] for r in src_db.execute("SELECT DISTINCT translation FROM verses ORDER BY translation")
    ]
    default_code = DEFAULT_TRANSLATION if DEFAULT_TRANSLATION in codes else codes[0]

    # books: static canon list, id = canonical order.
    db.executemany(
        "INSERT INTO books (id, testament, name, abbr, canonical_order) VALUES (?,?,?,?,?)",
        [(i + 1, testament, name, abbr, i + 1) for i, (name, testament, abbr) in enumerate(BOOKS)],
    )
    book_id_by_source_name = {
        SOURCE_BOOK_NAME.get(name, name): i + 1 for i, (name, _t, _a) in enumerate(BOOKS)
    }

    # translations: whatever's actually in the source.
    db.executemany(
        "INSERT INTO translations (code, name, license, source, is_default) VALUES (?,?,?,?,?)",
        [
            (code,) + TRANSLATION_META.get(code, (code, "personal-cache-copyrighted"))
            + (src.name, 1 if code == default_code else 0)
            for code in codes
        ],
    )
    tid = {c: i for c, i in db.execute("SELECT code, id FROM translations")}

    # Read + fix verses per translation (verse-1 remap + text cleanup), then
    # union the corrected (book, chapter, verse) keys across translations for
    # verse_refs.
    fixed = {}
    all_refs = set()
    for code in codes:
        rows = src_db.execute(
            "SELECT book, chapter, verse, text FROM verses WHERE translation=?", (code,)
        ).fetchall()
        by_chapter = {}
        for book, chapter, verse, _text in rows:
            by_chapter.setdefault((book, chapter), set()).add(verse)
        remap = {key: verse1_remap(key[1], verses) for key, verses in by_chapter.items()}
        fixed[code] = [
            (book, chapter, remap[(book, chapter)].get(verse, verse), clean_text(text))
            for book, chapter, verse, text in rows
        ]
        all_refs.update(
            (book_id_by_source_name[book], chapter, verse) for book, chapter, verse, _ in fixed[code]
        )

    db.executemany(
        "INSERT INTO verse_refs (book_id, chapter, verse) VALUES (?,?,?)", sorted(all_refs)
    )
    ref_id = {
        (b, c, v): i
        for i, b, c, v in db.execute("SELECT id, book_id, chapter, verse FROM verse_refs")
    }

    for code in codes:
        db.executemany(
            "INSERT INTO verse_texts (verse_ref_id, translation_id, text) VALUES (?,?,?)",
            [
                (ref_id[(book_id_by_source_name[book], chapter, verse)], tid[code], text)
                for book, chapter, verse, text in fixed[code]
            ],
        )

    # section_headings: every heading row (position 0 = section heading,
    # 1-3 = psalm/passage title lines) becomes its own row, in reading order.
    # A heading's true end is "one verse before the next heading anywhere in
    # the book" — NOT clipped to its own chapter. Some translations' last
    # heading in a chapter genuinely continues into the next chapter(s)
    # before the next heading starts (e.g. ESV's "Israel's Unbelief" starts
    # at Romans 9:30 and the next ESV heading isn't until 10:5, so its real
    # range is 9:30-10:4; NIV has no heading at all in Romans 10, so its
    # 9:30 heading runs all the way to the end of chapter 10). db.rs's
    # cross-chapter matching (see NotesPanel.tsx's maybeAutoTitle) depends on
    # end_chapter/verse_end being correct, not just cosmetic.
    for code in codes:
        hrows = src_db.execute(
            "SELECT book, chapter, verse_start, position, text FROM headings "
            "WHERE translation=? ORDER BY book, chapter, verse_start, position",
            (code,),
        ).fetchall()
        max_verse = {}
        max_chapter = {}
        for book, chapter, verse, _text in fixed[code]:
            vkey = (book, chapter)
            if verse > max_verse.get(vkey, 0):
                max_verse[vkey] = verse
            if chapter > max_chapter.get(book, 0):
                max_chapter[book] = chapter
        anchors_by_book = {}
        for book, chapter, verse_start, _position, _text in hrows:
            anchors_by_book.setdefault(book, set()).add((chapter, verse_start))
        anchors_by_book = {k: sorted(v) for k, v in anchors_by_book.items()}

        insert_rows = []
        for book, chapter, verse_start, _position, text in hrows:
            points = anchors_by_book[book]
            idx = points.index((chapter, verse_start))
            if idx + 1 < len(points):
                end_chapter, next_verse_start = points[idx + 1]
                if next_verse_start > 1:
                    verse_end = next_verse_start - 1
                else:
                    end_chapter -= 1
                    verse_end = max_verse.get((book, end_chapter), next_verse_start)
            else:
                end_chapter = max_chapter.get(book, chapter)
                verse_end = max_verse.get((book, end_chapter), verse_start)
            insert_rows.append(
                (
                    book_id_by_source_name[book],
                    chapter,
                    verse_start,
                    end_chapter,
                    verse_end,
                    clean_text(text),
                    tid[code],
                )
            )
        db.executemany(
            "INSERT INTO section_headings "
            "(book_id, chapter, verse_start, end_chapter, verse_end, heading, translation_id) "
            "VALUES (?,?,?,?,?,?,?)",
            insert_rows,
        )

    # FTS index over the imported text.
    db.execute(
        "INSERT INTO verse_fts (rowid, text, verse_ref_id, translation_id) "
        "SELECT rowid, text, verse_ref_id, translation_id FROM verse_texts"
    )
    db.commit()
    src_db.close()
    return db


def selfcheck(db: sqlite3.Connection) -> None:
    n = lambda q, *a: db.execute(q, a).fetchone()[0]
    translation_count = n("SELECT COUNT(*) FROM translations")
    assert translation_count >= 1
    assert n("SELECT COUNT(*) FROM books") == 66
    # union of versifications across all imported translations.
    assert 29000 <= n("SELECT COUNT(*) FROM verse_refs") <= 32000
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
    # Section headings exist for every imported translation.
    assert 14000 <= n("SELECT COUNT(*) FROM section_headings") <= 16000
    john11_heading = db.execute(
        "SELECT heading FROM section_headings "
        "WHERE book_id=43 AND chapter=1 AND verse_start=1 AND translation_id=?",
        (esv,),
    ).fetchone()
    assert john11_heading and john11_heading[0] == "The Word Became Flesh"
    # Romans 9:30 ESV heading ("Israel's Unbelief") must cross into chapter 10
    # (ends at 10:4, right before the next ESV heading at 10:5) — regression
    # check for the "next heading anywhere in the book" range computation
    # above, not just within the current chapter.
    romans_930 = db.execute(
        "SELECT end_chapter, verse_end FROM section_headings "
        "WHERE book_id=45 AND chapter=9 AND verse_start=30 AND translation_id=?",
        (esv,),
    ).fetchone()
    assert romans_930 == (10, 4), f"Romans 9:30 ESV heading range wrong: {romans_930}"


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


def main() -> None:
    load_dotenv(ROOT / ".env")
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--src", default=None, help=f"source DB path; default from ${ENV_VAR} in .env")
    ap.add_argument("--out", type=Path, default=OUT_DEFAULT)
    args = ap.parse_args()

    db = build(resolve_src(args.src), args.out)
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
