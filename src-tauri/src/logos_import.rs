//! Import Logos Bible Software note exports (`.txt` or `.html`) into Doxa
//! Theou notes.
//!
//! Logos exports have no frontmatter equivalent: no tags, titles, per-note
//! timestamps, or app-style anchors — just a flat, reverse-chapter-order dump
//! of passage-heading groups, each with quoted verse text and bullet
//! commentary (see `logos-to-doxa-md/Romans.txt` / `Romans.html`). This
//! module turns each group into one `Note`: notebook = book name, anchor =
//! the group's own outer heading (dash-normalized), body = the sub-headings,
//! quoted verses (as blockquotes), and bullets reformatted as Markdown.
//!
//! The `.txt` export is `---`-delimited plain text with no styling info. The
//! `.html` export ("Copy Bible Text" from Logos, saved as a page) has the
//! same content but also wraps every passage the user highlighted in a
//! `<span style="background-color:...">` — that's the only place highlight
//! info survives, so importing it is the reason to support HTML at all.
//! `parse_logos_html` carries those spans through as `==highlighted==`,
//! tiptap-markdown's own highlight-mark syntax (see NotesEditor.tsx's
//! `Highlight` extension), so they render as real highlights in the note
//! editor. The specific highlight *color* isn't preserved (tiptap-markdown's
//! default `renderMarkdown` for the mark doesn't serialize the color
//! attribute, and every note already gets one flat anchor color — see
//! `import_files`'s `color` param), just which phrases were highlighted.

use crate::notes::{self, Note};
use ego_tree::NodeRef;
use rusqlite::Connection;
use scraper::{ElementRef, Html, Node};
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use uuid::Uuid;

pub struct ImportedGroup {
    pub anchor: String,
    pub notebook: String,
    pub body: String,
}

#[derive(Serialize)]
pub struct FileImportResult {
    pub file: String,
    pub book: String,
    pub imported: usize,
    pub skipped: usize,
    pub warnings: Vec<String>,
    // ids of the notes actually created by this file (not skipped as
    // already-imported) — lets the frontend offer a one-shot "revert this
    // import" that deletes exactly these notes, nothing else.
    pub imported_ids: Vec<String>,
}

#[derive(Serialize)]
pub struct ImportSummary {
    pub files: Vec<FileImportResult>,
    pub total_imported: usize,
    pub total_skipped: usize,
}

// --- line classification -----------------------------------------------

// "* text" (top-level) or "\t* text" (nested, one level under a bullet above).
fn classify_bullet(line: &str) -> Option<(bool, &str)> {
    if let Some(rest) = line.strip_prefix('\t') {
        return rest.trim_start().strip_prefix("* ").map(|t| (true, t.trim()));
    }
    line.strip_prefix("* ").map(|t| (false, t.trim()))
}

// "<ws>8<ws>Owe no one anything..." — leading whitespace (spaces or tabs,
// both occur in real exports), then a verse number, then whitespace, then text.
fn classify_quote(line: &str) -> Option<(&str, &str)> {
    let trimmed = line.trim_start();
    let digits_end = trimmed.find(|c: char| !c.is_ascii_digit()).unwrap_or(trimmed.len());
    if digits_end == 0 {
        return None;
    }
    let (num, rest) = trimmed.split_at(digits_end);
    let text = rest.trim_start();
    if text.len() == rest.len() {
        return None; // no whitespace between the number and the text
    }
    Some((num, text.trim_end()))
}

// Strips an optional trailing "(Prophecy)" / "(Supporting Verse)" label.
fn strip_label(line: &str) -> &str {
    let t = line.trim_end();
    if t.ends_with(')') {
        if let Some(idx) = t.rfind(" (") {
            return t[..idx].trim_end();
        }
    }
    t
}

// "Chapter[:Verse[-Verse]]" with either an ASCII hyphen or en dash for ranges.
fn valid_rest(rest: &str) -> bool {
    let mut parts = rest.splitn(2, ':');
    let chapter = parts.next().unwrap_or("");
    if chapter.is_empty() || !chapter.chars().all(|c| c.is_ascii_digit()) {
        return false;
    }
    match parts.next() {
        None => true,
        Some(verse_part) => {
            let vparts: Vec<&str> = verse_part.splitn(2, |c| c == '-' || c == '\u{2013}').collect();
            if vparts[0].is_empty() || !vparts[0].chars().all(|c| c.is_ascii_digit()) {
                return false;
            }
            match vparts.get(1) {
                None => true,
                Some(end) => !end.is_empty() && end.chars().all(|c| c.is_ascii_digit()),
            }
        }
    }
}

// Splits a bare reference line into its book-name slice and the rest, e.g.
// "Romans 13:8–14" -> ("Romans", "13:8–14"), against a known book in `books`.
fn heading_rest<'a>(line: &'a str, books: &[(String, i64)]) -> Option<(&'a str, &'a str)> {
    let core = strip_label(line);
    let lower = core.to_lowercase();
    for (name, _) in books {
        if lower.starts_with(name.as_str()) && lower.as_bytes().get(name.len()) == Some(&b' ') {
            return Some((&core[..name.len()], core[name.len() + 1..].trim()));
        }
    }
    None
}

// "chapter[:verse[-verse]]" (dash-normalized), OR a cross-chapter span
// "chapter:verse-chapter:verse" (e.g. Romans 9:30–10:4) — notes::resolve_anchor
// and the Reader's highlight index both understand cross-chapter spans, so
// the full range is kept as-is (dash-normalized), not truncated.
fn normalize_rest(rest: &str) -> Option<String> {
    if valid_rest(rest) {
        return Some(rest.replace('\u{2013}', "-"));
    }
    let (start, end) = rest.split_once(|c| c == '-' || c == '\u{2013}')?;
    if !valid_rest(start) || !start.contains(':') {
        return None;
    }
    let (end_chapter, end_verse) = end.split_once(':')?;
    let is_digits = |s: &str| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit());
    if !is_digits(end_chapter) || !is_digits(end_verse) {
        return None;
    }
    Some(format!("{}-{end_chapter}:{end_verse}", start.replace('\u{2013}', "-")))
}

// A bare reference line, e.g. "Romans 13:8–14" or "Habakkuk 2:4 (Prophecy)".
// Returns the normalized anchor (dash-normalized, label dropped) if `line`
// has that shape against a known book from `books`.
fn heading_anchor(line: &str, books: &[(String, i64)]) -> Option<String> {
    let (book, rest) = heading_rest(line, books)?;
    normalize_rest(rest).map(|r| format!("{book} {r}"))
}

fn is_continuation(line: &str, books: &[(String, i64)]) -> bool {
    classify_bullet(line).is_none() && classify_quote(line).is_none() && heading_anchor(line, books).is_none()
}

// Appends any immediately-following continuation lines (a verse or bullet
// that wraps onto an unindented, unmarked next line — e.g. Romans 1:5-7's
// verse 7 in the real export) onto `lines_in_block`'s last entry.
fn absorb_continuations(seg: &[&str], i: &mut usize, books: &[(String, i64)], lines_in_block: &mut Vec<String>) {
    while *i < seg.len() && is_continuation(seg[*i], books) {
        if let Some(last) = lines_in_block.last_mut() {
            last.push(' ');
            last.push_str(seg[*i].trim());
        }
        *i += 1;
    }
}

fn parse_segment(seg: &[&str], notebook: &str, books: &[(String, i64)], warnings: &mut Vec<String>) -> ImportedGroup {
    let anchor = heading_anchor(seg[0], books).unwrap_or_else(|| {
        warnings.push(format!("could not parse outer heading '{}'; anchor omitted", seg[0]));
        format!("{notebook} (unparsed)")
    });

    let mut blocks: Vec<String> = Vec::new();
    let mut i = 1;
    while i < seg.len() {
        let line = seg[i];

        if classify_bullet(line).is_some() {
            let mut lines_in_block = Vec::new();
            loop {
                let (nested, text) = classify_bullet(seg[i]).unwrap();
                lines_in_block.push(format!("{}{text}", if nested { "  - " } else { "- " }));
                i += 1;
                if i < seg.len() {
                    if let Some((num, vtext)) = classify_quote(seg[i]) {
                        lines_in_block.push(format!("  > **`{num}`** {vtext}"));
                        i += 1;
                        absorb_continuations(seg, &mut i, books, &mut lines_in_block);
                    }
                }
                if i >= seg.len() || classify_bullet(seg[i]).is_none() {
                    break;
                }
            }
            blocks.push(lines_in_block.join("\n"));
            continue;
        }

        if heading_anchor(line, books).is_some() {
            if i + 1 < seg.len() && classify_quote(seg[i + 1]).is_some() {
                let mut lines_in_block = vec![format!("## {}", line.trim())];
                i += 1;
                while i < seg.len() {
                    let Some((num, text)) = classify_quote(seg[i]) else { break };
                    lines_in_block.push(format!("> **`{num}`** {text}"));
                    i += 1;
                    absorb_continuations(seg, &mut i, books, &mut lines_in_block);
                }
                blocks.push(lines_in_block.join("\n"));
            } else {
                warnings.push(format!("orphan reference '{line}' with no quoted verse — dropped"));
                i += 1;
            }
            continue;
        }

        if let Some((num, text)) = classify_quote(line) {
            // Shouldn't happen (headings always precede their quotes in real
            // exports), but keep the data rather than drop it.
            blocks.push(format!("> **`{num}`** {text}"));
            i += 1;
            continue;
        }

        blocks.push(line.trim().to_string());
        i += 1;
    }

    ImportedGroup { anchor, notebook: notebook.to_string(), body: blocks.join("\n\n") }
}

/// Parses one Logos export's raw text into one `ImportedGroup` per
/// `---`-delimited passage group, plus any non-fatal parsing warnings.
pub fn parse_logos_txt(raw: &str, filename_stem: &str, books: &[(String, i64)]) -> (Vec<ImportedGroup>, Vec<String>) {
    let mut warnings = Vec::new();
    let text = raw.strip_prefix('\u{FEFF}').unwrap_or(raw).replace("\r\n", "\n");
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    if lines.is_empty() {
        return (Vec::new(), warnings);
    }

    let book_line = lines[0].trim();
    let notebook = if book_line.eq_ignore_ascii_case(filename_stem.trim()) {
        book_line.to_string()
    } else {
        warnings.push(format!(
            "book name in file ('{book_line}') does not match filename ('{filename_stem}'); using '{filename_stem}'"
        ));
        filename_stem.to_string()
    };

    let mut segments: Vec<Vec<&str>> = vec![Vec::new()];
    for &line in &lines[1..] {
        if line.trim() == "---" {
            segments.push(Vec::new());
        } else {
            segments.last_mut().unwrap().push(line);
        }
    }

    let mut groups = Vec::new();
    for seg in segments {
        if seg.is_empty() {
            continue;
        }
        if seg.len() == 1 && seg[0].trim_start().starts_with("Exported from Logos Bible Study,") {
            continue; // whole-export footer, not a note
        }
        groups.push(parse_segment(&seg, &notebook, books, &mut warnings));
    }
    (groups, warnings)
}

// --- HTML export -----------------------------------------------------

// Plain text of every descendant text node, tags stripped, entities already
// decoded by html5ever.
fn elem_text(e: ElementRef) -> String {
    e.text().collect()
}

// Assembles one element's own inline content (not descending into a nested
// `<ul>` — bullets walk those themselves) into one string per `<br>`-
// separated line, wrapping any highlighted (`background-color`-styled)
// element's text in `==...==`. Mirrors the `.txt` parser's line-based
// classify_quote/classify_bullet inputs, but built from the DOM instead of
// split on newlines, since a highlight span can end mid-line.
fn assemble_segments(e: ElementRef) -> Vec<String> {
    fn walk(node: NodeRef<Node>, segs: &mut Vec<String>) {
        if let Some(el) = ElementRef::wrap(node) {
            let name = el.value().name();
            if name == "br" {
                segs.push(String::new());
                return;
            }
            if name == "ul" {
                return;
            }
            let highlighted = el.attr("style").is_some_and(|s| s.contains("background-color"));
            if highlighted {
                segs.last_mut().unwrap().push_str("==");
            }
            for child in node.children() {
                walk(child, segs);
            }
            if highlighted {
                segs.last_mut().unwrap().push_str("==");
            }
        } else if let Some(t) = node.value().as_text() {
            segs.last_mut().unwrap().push_str(t);
        }
    }
    let mut segs = vec![String::new()];
    for child in e.children() {
        walk(child, &mut segs);
    }
    segs
}

// One `<li>`'s own text (formatted as a "- "/"  - " Markdown bullet line,
// verse-quote segments bolded as "**N** text" same as the top-level blocks),
// followed by any nested `<ul>`'s `<li>`s one level deeper — mirrors the
// `.txt` parser's `classify_bullet` nested-bullet handling.
fn render_li(li: ElementRef, nested: bool, lines: &mut Vec<String>) {
    let mut rendered = Vec::new();
    for seg in assemble_segments(li) {
        let trimmed = seg.trim();
        if trimmed.is_empty() {
            continue;
        }
        match classify_quote(&seg) {
            Some((num, text)) => rendered.push(format!("**{num}** {text}")),
            None => rendered.push(trimmed.to_string()),
        }
    }
    if !rendered.is_empty() {
        lines.push(format!("{}{}", if nested { "  - " } else { "- " }, rendered.join(" ")));
    }
    for ul in li.child_elements().filter(|c| c.value().name() == "ul") {
        for sub_li in ul.child_elements().filter(|c| c.value().name() == "li") {
            render_li(sub_li, true, lines);
        }
    }
}

/// Parses one Logos "Copy Bible Text" HTML export into one `ImportedGroup`
/// per passage group, plus any non-fatal parsing warnings. Passage groups are
/// separated by Logos's own `<div style="...border-bottom...">` dividers
/// (the HTML analogue of the `.txt` export's `---` lines); a trailing
/// non-blank `<div>` is the "Exported from Logos Bible Study, ..." footer and
/// ends parsing.
pub fn parse_logos_html(raw: &str, filename_stem: &str, books: &[(String, i64)]) -> (Vec<ImportedGroup>, Vec<String>) {
    let mut warnings = Vec::new();
    let doc = Html::parse_document(raw);
    let Some(body) = doc.root_element().descendent_elements().find(|e| e.value().name() == "body") else {
        return (Vec::new(), warnings);
    };
    // The book title's `<h1>` isn't necessarily body's first element (a
    // `<style>` tag precedes it in real exports), so find it by name rather
    // than assuming position.
    let notebook = match body.child_elements().find(|e| e.value().name() == "h1") {
        Some(h1) => {
            let title = elem_text(h1).trim().to_string();
            if title.eq_ignore_ascii_case(filename_stem.trim()) {
                title
            } else {
                warnings.push(format!(
                    "book name in file ('{title}') does not match filename ('{filename_stem}'); using '{filename_stem}'"
                ));
                filename_stem.to_string()
            }
        }
        None => filename_stem.to_string(),
    };

    let mut groups = Vec::new();

    // Open-group state: the group's own outer anchor plus its finished
    // blocks (each a "## Ref\n> **N** text..." sub-heading, or a joined
    // bullet-list block).
    let mut anchor: Option<String> = None;
    let mut blocks: Vec<String> = Vec::new();
    // Open sub-heading state, flushed into `blocks` on the next heading/list/
    // group boundary. `sub_ref` is kept separately (rather than re-parsed
    // from `sub_lines[0]`) so the orphan-reference warning can quote it.
    let mut sub_ref: Option<String> = None;
    let mut sub_lines: Vec<String> = Vec::new();

    macro_rules! flush_sub {
        () => {
            if let Some(r) = sub_ref.take() {
                if sub_lines.len() <= 1 {
                    warnings.push(format!("orphan reference '{r}' with no quoted verse — dropped"));
                } else {
                    blocks.push(sub_lines.join("\n"));
                }
                sub_lines.clear();
            }
        };
    }
    macro_rules! flush_group {
        () => {
            flush_sub!();
            if anchor.is_some() || !blocks.is_empty() {
                let a = anchor.take().unwrap_or_else(|| {
                    warnings.push(format!("could not parse an outer heading for a passage group in '{filename_stem}'; anchor omitted"));
                    format!("{notebook} (unparsed)")
                });
                groups.push(ImportedGroup { anchor: a, notebook: notebook.clone(), body: blocks.join("\n\n") });
            }
            blocks.clear();
        };
    }

    for el in body.child_elements() {
        match el.value().name() {
            "h1" | "style" => continue,
            "div" => {
                let trimmed = elem_text(el).trim().to_string();
                if !trimmed.is_empty() {
                    break; // whole-export footer, not a note
                }
                flush_group!();
            }
            "p" => {
                let text = elem_text(el);
                let trimmed = text.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if let Some(a) = heading_anchor(trimmed, books) {
                    if anchor.is_none() {
                        anchor = Some(a);
                    } else {
                        flush_sub!();
                        sub_ref = Some(trimmed.to_string());
                        sub_lines.push(format!("## {trimmed}"));
                    }
                    continue;
                }
                for seg in assemble_segments(el) {
                    if seg.trim().is_empty() {
                        continue;
                    }
                    match classify_quote(&seg) {
                        Some((num, vtext)) => sub_lines.push(format!("> **`{num}`** {vtext}")),
                        None => match sub_lines.last_mut() {
                            Some(last) => {
                                last.push(' ');
                                last.push_str(seg.trim());
                            }
                            None => sub_lines.push(seg.trim().to_string()),
                        },
                    }
                }
            }
            "ul" => {
                flush_sub!();
                let mut lines = Vec::new();
                for li in el.child_elements().filter(|c| c.value().name() == "li") {
                    render_li(li, false, &mut lines);
                }
                if !lines.is_empty() {
                    blocks.push(lines.join("\n"));
                }
            }
            _ => {} // <br>, spacer paragraphs already consumed as "p", etc.
        }
    }
    flush_group!();

    (groups, warnings)
}

/// Parses and imports every path in `paths`, skipping any group whose
/// (notebook, anchor) already matches an existing note.
pub fn import_files(
    notes_conn: &Connection,
    books: &[(String, i64)],
    folder: &Path,
    paths: &[String],
    now: &str,
    color: Option<String>,
) -> Result<ImportSummary, String> {
    let existing = notes::load_notes(notes_conn, books, folder)?;
    let mut seen: HashSet<(String, String)> = existing
        .iter()
        .flat_map(|n| {
            let notebook = n.notebook.to_lowercase();
            n.anchors.iter().map(move |a| (notebook.clone(), a.clone()))
        })
        .collect();

    let mut files = Vec::new();
    let mut total_imported = 0;
    let mut total_skipped = 0;

    for path_str in paths {
        let path = Path::new(path_str);
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("import").to_string();
        let bytes = fs::read(path).map_err(|e| format!("{path_str}: {e}"))?;
        let raw = String::from_utf8_lossy(&bytes).into_owned();
        let is_html = path
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| e.eq_ignore_ascii_case("html") || e.eq_ignore_ascii_case("htm"));
        let (groups, mut warnings) = if is_html {
            parse_logos_html(&raw, &stem, books)
        } else {
            parse_logos_txt(&raw, &stem, books)
        };
        let book = groups.first().map(|g| g.notebook.clone()).unwrap_or_else(|| stem.clone());

        let (mut imported, mut skipped) = (0, 0);
        let mut imported_ids = Vec::new();
        for g in groups {
            let key = (g.notebook.to_lowercase(), g.anchor.clone());
            if !seen.insert(key) {
                skipped += 1;
                continue;
            }
            let note = Note {
                id: format!("logos-{}", Uuid::new_v4()),
                title: String::new(),
                tags: Vec::new(),
                anchors: vec![g.anchor],
                notebook: g.notebook,
                color: color.clone(),
                created: now.to_string(),
                modified: now.to_string(),
                body: g.body,
            };
            notes::save_note(notes_conn, books, folder, &note)?;
            imported_ids.push(note.id);
            imported += 1;
        }

        total_imported += imported;
        total_skipped += skipped;
        warnings.sort();
        warnings.dedup();
        files.push(FileImportResult {
            file: path.file_name().and_then(|s| s.to_str()).unwrap_or(path_str).to_string(),
            book,
            imported,
            skipped,
            warnings,
            imported_ids,
        });
    }

    Ok(ImportSummary { files, total_imported, total_skipped })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn books() -> Vec<(String, i64)> {
        vec![
            ("romans".into(), 45),
            ("john".into(), 43),
            ("isaiah".into(), 23),
            ("deuteronomy".into(), 5),
            ("habakkuk".into(), 35),
            ("hebrews".into(), 58),
        ]
    }

    #[test]
    fn strips_bom_and_crlf() {
        let raw = "\u{FEFF}Romans\r\n\r\nRomans 1:1\r\n\r\n\r\n      1      Paul, a servant.\r\n\r\n\r\n* A note.\r\n";
        let (groups, _) = parse_logos_txt(raw, "Romans", &books());
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].anchor, "Romans 1:1");
        assert!(groups[0].body.contains("> **`1`** Paul, a servant."));
        assert!(groups[0].body.contains("- A note."));
    }

    #[test]
    fn tabs_and_spaces_both_match_quote_lines() {
        let raw = "Romans\n\nRomans 1:1–2\n\nRomans 1:1\n\t\t1\t\t\tPaul, a servant.\n      2      called to be an apostle.\n\n\n* A note.\n";
        let (groups, _) = parse_logos_txt(raw, "Romans", &books());
        assert_eq!(groups.len(), 1);
        assert!(groups[0].body.contains("> **`1`** Paul, a servant."));
        assert!(groups[0].body.contains("> **`2`** called to be an apostle."));
    }

    #[test]
    fn unindented_wrap_joins_previous_quote() {
        let raw = "Romans\n\nRomans 1:7\n\nRomans 1:7\n      7      To all those in Rome:\nGrace to you and peace.\n\n\n* A note.\n";
        let (groups, _) = parse_logos_txt(raw, "Romans", &books());
        assert_eq!(groups.len(), 1);
        assert!(groups[0].body.contains("> **`7`** To all those in Rome: Grace to you and peace."));
    }

    #[test]
    fn orphan_heading_is_dropped_with_warning() {
        let raw = "Romans\n\nRomans 12:9–21\nJohn 13:35\n\n\nRomans 12:9–10\n      9      Let love be genuine.\n\n\n* A note.\n";
        let (groups, warnings) = parse_logos_txt(raw, "Romans", &books());
        assert_eq!(groups.len(), 1);
        assert!(!groups[0].body.contains("John 13:35"));
        assert!(warnings.iter().any(|w| w.contains("John 13:35")));
    }

    #[test]
    fn nested_bullet_with_trailing_quote() {
        let raw = "Romans\n\nRomans 12:9–10\n\nRomans 12:9–10\n      9      Let love be genuine.\n\n\n* Paul encourages love.\n\t* John 13:35\n      35      By this all people will know.\n";
        let (groups, _) = parse_logos_txt(raw, "Romans", &books());
        assert_eq!(groups.len(), 1);
        assert!(groups[0].body.contains("- Paul encourages love."));
        assert!(groups[0].body.contains("  - John 13:35"));
        assert!(groups[0].body.contains("  > **`35`** By this all people will know."));
    }

    #[test]
    fn cross_chapter_heading_keeps_full_range_as_anchor() {
        let raw = "Romans\n\nRomans 9:30–10:4\nRomans 9:30–33\n      30      What shall we say, then?\n\n\n* A note.\n";
        let (groups, _) = parse_logos_txt(raw, "Romans", &books());
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].anchor, "Romans 9:30-10:4");
    }

    #[test]
    fn ascii_hyphen_range_is_accepted() {
        let raw = "Romans\n\nRomans 11:2-5\n\nRomans 11:2-5\n      2      God has not rejected his people.\n\n\n* A note.\n";
        let (groups, _) = parse_logos_txt(raw, "Romans", &books());
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].anchor, "Romans 11:2-5");
    }

    // Full parse of the real checked-in export (skips if absent).
    #[test]
    fn parses_real_romans_fixture() {
        let path = std::path::Path::new("../logos-to-doxa-md/Romans.txt");
        if !path.exists() {
            eprintln!("skipping: fixture not present");
            return;
        }
        let bytes = fs::read(path).unwrap();
        let raw = String::from_utf8_lossy(&bytes).into_owned();
        let (groups, warnings) = parse_logos_txt(&raw, "Romans", &books());

        assert_eq!(groups.len(), 29);
        assert_eq!(groups[0].anchor, "Romans 13:8-14");
        assert_eq!(groups[0].notebook, "Romans");
        assert!(groups[0].body.starts_with("## Romans 13:8\u{2013}10"));
        assert!(groups[0].body.contains("> **`8`** Owe no one anything"));
        // Romans 11:2-5 (line 325) uses an ASCII hyphen for its range, unlike
        // most sub-headings in the file — it's a sub-heading (inside the
        // "Romans 11:1-10" group), not an outer heading/anchor on its own.
        let g = groups.iter().find(|g| g.anchor == "Romans 11:1-10").expect("Romans 11:1-10 group");
        assert!(g.body.contains("## Romans 11:2-5"));
        assert!(!warnings.is_empty()); // the John 13:35 orphan-mention case

        // Romans 9:30–10:4 (line 439) is a cross-chapter outer heading — must
        // resolve to its full range, not the "(unparsed)" fallback.
        assert!(groups.iter().any(|g| g.anchor == "Romans 9:30-10:4"));
        assert!(groups.iter().all(|g| !g.anchor.contains("unparsed")));
    }

    // --- HTML export ---------------------------------------------------

    #[test]
    fn html_parses_heading_verse_and_bullet_with_highlight() {
        let raw = r#"<html><body>
            <style><!-- p { margin:0pt; } --></style>
            <h1><span style="font-weight:bold;">Romans</span></h1>
            <p></p>
            <p style="font-weight:bold;">Romans 1:1</p>
            <p></p>
            <p style="margin:0pt;"><a href="https://ref.ly/Ro1.1"><span style="font-weight:bold;">Romans 1:1</span></a></p>
            <p style="margin:0pt;"><span style="font-weight:bold;">&nbsp;&nbsp;1&nbsp;&nbsp;</span><span style="font-weight:bold; background-color:rgb(0, 96, 166);">Paul, a servant.</span></p>
            <p style="margin:0pt;"><br /></p><br />
            <ul><li><p style="margin:0pt;">A note.</p></li></ul><br />
            <div style="margin-top:4pt; margin-bottom:4pt; border-bottom:1px solid;"></div>
        </body></html>"#;
        let (groups, warnings) = parse_logos_html(raw, "Romans", &books());
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].anchor, "Romans 1:1");
        assert_eq!(groups[0].notebook, "Romans");
        assert!(groups[0].body.contains("## Romans 1:1"));
        assert!(groups[0].body.contains("> **`1`** ==Paul, a servant.=="));
        assert!(groups[0].body.contains("- A note."));
        assert!(warnings.is_empty());
    }

    #[test]
    fn html_nested_bullet_with_inline_reference_quote() {
        // Mirrors the real export's shape for a bullet that expands a cross-
        // reference inline: the ref link is immediately followed, in the same
        // <p>, by a <br>-separated "verse-num text" line.
        let raw = r#"<html><body>
            <h1>Romans</h1>
            <p style="font-weight:bold;">Romans 12:9-10</p>
            <p style="margin:0pt;"><a href="x"><span style="font-weight:bold;">Romans 12:9-10</span></a></p>
            <p style="margin:0pt;"><span style="font-weight:bold;">&nbsp;9&nbsp;</span><span style="font-weight:bold; background-color:rgb(0, 96, 166);">Let love be genuine.</span></p>
            <br />
            <ul>
                <li>
                    <p style="margin:0pt;">Paul encourages love.</p><br />
                    <ul>
                        <li>
                            <p style="margin:0pt;"><a href="y"><span style="font-weight:bold;">John 13:35</span></a><span style="font-weight:bold;"><br />&nbsp;35&nbsp;</span><span style="font-weight:bold; background-color:rgb(0, 96, 166);">By this all people will know.</span></p>
                        </li>
                    </ul><br />
                </li>
            </ul><br />
            <div style="margin-top:4pt; margin-bottom:4pt; border-bottom:1px solid;"></div>
        </body></html>"#;
        let (groups, _) = parse_logos_html(raw, "Romans", &books());
        assert_eq!(groups.len(), 1);
        assert!(groups[0].body.contains("- Paul encourages love."));
        assert!(groups[0]
            .body
            .contains("  - John 13:35 **35** ==By this all people will know.=="));
    }

    // Full parse of the real checked-in HTML export (skips if absent) — same
    // book as parses_real_romans_fixture, so group count/anchors should match
    // the .txt version exactly; the only difference is the `==...==`
    // highlight markers HTML alone carries.
    #[test]
    fn parses_real_romans_html_fixture() {
        let path = std::path::Path::new("../logos-to-doxa-md/Romans.html");
        if !path.exists() {
            eprintln!("skipping: fixture not present");
            return;
        }
        let bytes = fs::read(path).unwrap();
        let raw = String::from_utf8_lossy(&bytes).into_owned();
        let (groups, warnings) = parse_logos_html(&raw, "Romans", &books());

        assert_eq!(groups.len(), 29);
        assert_eq!(groups[0].anchor, "Romans 13:8-14");
        assert_eq!(groups[0].notebook, "Romans");
        assert!(groups[0].body.contains("## Romans 13:8\u{2013}10"));
        assert!(groups[0].body.contains("==Owe no one anything"));
        assert!(!warnings.is_empty());

        assert!(groups.iter().any(|g| g.anchor == "Romans 9:30-10:4"));
        assert!(groups.iter().all(|g| !g.anchor.contains("unparsed")));

        // Every group should carry at least one highlighted phrase — Logos
        // exports these notes precisely because the user highlighted them.
        assert!(groups.iter().all(|g| g.body.contains("==")));
    }
}
