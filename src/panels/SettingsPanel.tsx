// Settings — theme, default translation (for new Readers), notes editor
// preferences, and the anchor-highlight palette (drives note colors + the
// editor's default highlight; see notes.ts / tokens.css).
import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { importBibleDb, importLogosNotes, type ImportSummary } from "../api";
import { useNotes } from "../state/notes";
import { useWorkspace } from "../state/workspace";
import { ICON, MoonIcon, SunIcon } from "../workspace/icons";
import { HIGHLIGHT_PALETTES, paletteById, type PaletteId } from "./notes/notes";
import {
  NOTES_READING_WIDTH_MAX,
  NOTES_READING_WIDTH_MIN,
} from "../state/workspace";

export function SettingsPanel() {
  const ws = useWorkspace();
  const { refreshNotes, lastImportedIds, recordImport, revertImport } =
    useNotes();
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importingLogos, setImportingLogos] = useState(false);
  const [logosError, setLogosError] = useState<string | null>(null);
  const [logosSummary, setLogosSummary] = useState<ImportSummary | null>(null);

  async function chooseNotesFolder() {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") ws.setNotesFolder(dir);
  }

  // Pick a prebuilt bible.sqlite and install it as the active DB. Rust
  // validates + swaps it; on success we reload so the whole app re-reads the
  // new books/translations (the layout is restored from localStorage).
  async function importDb() {
    const file = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "SQLite database", extensions: ["sqlite", "db"] }],
    });
    if (typeof file !== "string") return;
    setImporting(true);
    setImportError(null);
    try {
      await importBibleDb(file);
      // The native file dialog above can leave the frameless (decorations:
      // false) webview window unfocused/un-foregrounded on Windows;
      // reloading immediately afterward can leave stale paint on screen that
      // visually overlaps the header until something forces a repaint.
      // Refocusing first (and awaiting it) gives the window a tick to
      // resettle before the full navigation fires.
      await getCurrentWindow().setFocus();
      window.location.reload();
    } catch (e) {
      setImportError(String(e));
      setImporting(false);
    }
  }

  // Pick one or more Logos Bible Study exports (.txt or the HTML "Copy Bible
  // Text" export — HTML also carries inline highlight spans, which the
  // plain .txt export drops) and turn each passage-heading group into a
  // note. Rust does the parsing/dedupe/writes; we just refresh the
  // in-memory store so the Notes panel/Reader highlights pick up the new
  // files without a full app reload.
  async function importLogos() {
    const files = await open({
      multiple: true,
      directory: false,
      filters: [{ name: "Logos export", extensions: ["txt", "html", "htm"] }],
    });
    const paths = Array.isArray(files) ? files : files ? [files] : [];
    if (paths.length === 0) return;
    setImportingLogos(true);
    setLogosError(null);
    try {
      const summary = await importLogosNotes(
        paths,
        ws.notesFolder,
        ws.notesLastColor,
      );
      setLogosSummary(summary);
      recordImport(summary.files.flatMap((f) => f.imported_ids));
      await refreshNotes();
    } catch (e) {
      setLogosError(String(e));
    } finally {
      setImportingLogos(false);
    }
  }

  // Undoes exactly the notes this import created (skipped/pre-existing ones
  // are untouched). Available until the app restarts — recordImport's state
  // lives in NotesProvider, not this panel, so switching tabs doesn't lose it.
  function undoLogosImport() {
    revertImport();
    setLogosSummary(null);
  }

  // Switching palette resets the default highlight color to that palette's
  // first swatch, so the picker below always has a valid selection.
  function choosePalette(id: PaletteId) {
    ws.setAnchorPalette(id);
    ws.setNotesHighlightColor(`var(${paletteById(id).swatches[0].var})`);
  }

  return (
    <div className="panel">
      <div className="panel__scroll mx-auto w-full max-w-[640px]">
        <section className="[&+&]:mt-6">
          <h3 className="mb-2 text-(length:--text-xs) uppercase tracking-[0.06em] text-muted">
            Startup
          </h3>
          <div className="flex items-center justify-between gap-3 py-2">
            <div className="flex flex-col">
              <span className="text-(length:--text-sm)">On launch</span>
              <span className="panel__muted">
                Reopen where you left off, or start at the dashboard
              </span>
            </div>
            <div className="seg" role="group" aria-label="On launch">
              <button
                className={
                  "seg__btn" + (ws.startupMode === "layout" ? " is-on" : "")
                }
                onClick={() => ws.setStartupMode("layout")}
              >
                Restore last layout
              </button>
              <button
                className={
                  "seg__btn" + (ws.startupMode === "dashboard" ? " is-on" : "")
                }
                onClick={() => ws.setStartupMode("dashboard")}
              >
                Show dashboard
              </button>
            </div>
          </div>
        </section>

        <section className="[&+&]:mt-6">
          <h3 className="mb-2 text-(length:--text-xs) uppercase tracking-[0.06em] text-muted">
            Appearance
          </h3>
          <div className="flex items-center justify-between gap-3 py-2">
            <span className="text-(length:--text-sm)">Theme</span>
            <div className="seg" role="group" aria-label="Theme">
              <button
                className={"seg__btn" + (ws.theme === "light" ? " is-on" : "")}
                onClick={() => ws.setTheme("light")}
              >
                <SunIcon size={ICON.sm} /> Light
              </button>
              <button
                className={"seg__btn" + (ws.theme === "dark" ? " is-on" : "")}
                onClick={() => ws.setTheme("dark")}
              >
                <MoonIcon size={ICON.sm} /> Dark
              </button>
            </div>
          </div>
        </section>

        <section className="[&+&]:mt-6">
          <h3 className="mb-2 text-(length:--text-xs) uppercase tracking-[0.06em] text-muted">
            Reading
          </h3>
          <div className="flex items-center justify-between gap-3 py-2">
            <div className="flex flex-col">
              <span className="text-(length:--text-sm)">
                Default translation
              </span>
              <span className="panel__muted">
                Used when opening a new Reader
              </span>
            </div>
            <select
              className="input"
              value={ws.defaultTranslation}
              onChange={(e) => ws.setDefaultTranslation(e.target.value)}
            >
              {ws.translations.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.code} — {t.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="[&+&]:mt-6">
          <h3 className="mb-2 text-(length:--text-xs) uppercase tracking-[0.06em] text-muted">
            Bible database
          </h3>
          <div className="flex items-center justify-between gap-3 py-2">
            <div className="flex flex-col min-w-0">
              <span className="text-(length:--text-sm)">Import database</span>
              <span className="panel__muted">
                Replace the active Bible data with a{" "}
                <span className="font-(family-name:--font-mono)">
                  bible.sqlite
                </span>{" "}
                built by{" "}
                <span className="font-(family-name:--font-mono)">
                  scripts/import_bible.py
                </span>
                . The app reloads after a successful import.
              </span>
            </div>
            <button
              type="button"
              disabled={importing}
              className="shrink-0 inline-flex items-center h-7 px-3 rounded-(--radius-sm) bg-accent-tint text-ink text-(length:--text-sm) hover:bg-accent-tint-strong disabled:opacity-50 disabled:cursor-default transition-colors duration-(--dur-fast) ease-(--ease-standard)"
              onClick={importDb}
            >
              {importing ? "Importing…" : "Import database…"}
            </button>
          </div>
          {importError && (
            <p className="mt-1 text-danger text-(length:--text-xs)">
              {importError}
            </p>
          )}
        </section>

        <section className="[&+&]:mt-6">
          <h3 className="mb-2 text-(length:--text-xs) uppercase tracking-[0.06em] text-muted">
            Notes
          </h3>
          <div className="flex items-center justify-between gap-3 py-2">
            <div className="flex flex-col">
              <span className="text-(length:--text-sm)">Open notes on</span>
              <span className="panel__muted">
                Side to split a note to, or tab it into whatever's active, when
                no Notes tab is open yet
              </span>
            </div>
            <div className="seg" role="group" aria-label="Open notes on">
              <button
                className={
                  "seg__btn" + (ws.notesSplitSide === "active" ? " is-on" : "")
                }
                onClick={() => ws.setNotesSplitSide("active")}
              >
                Active
              </button>
              <button
                className={
                  "seg__btn" + (ws.notesSplitSide === "left" ? " is-on" : "")
                }
                onClick={() => ws.setNotesSplitSide("left")}
              >
                Left
              </button>
              <button
                className={
                  "seg__btn" + (ws.notesSplitSide === "right" ? " is-on" : "")
                }
                onClick={() => ws.setNotesSplitSide("right")}
              >
                Right
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 py-2">
            <div className="flex flex-col">
              <span className="text-(length:--text-sm)">Reading width</span>
              <span className="panel__muted">
                Max line width of the note editor
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                className="slider"
                min={NOTES_READING_WIDTH_MIN}
                max={NOTES_READING_WIDTH_MAX}
                step={5}
                value={ws.notesReadingWidth}
                onChange={(e) =>
                  ws.setNotesReadingWidth(Number(e.target.value))
                }
                aria-label="Note reading width"
              />
              <span className="w-[5ch] shrink-0 text-right text-(length:--text-xs) font-(family-name:--font-mono) text-muted">
                {ws.notesReadingWidth}ch
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 py-2">
            <div className="flex flex-col">
              <span className="text-(length:--text-sm)">Notes folder</span>
              <span className="panel__muted">
                {ws.notesFolder ?? "Default folder (app data)"}
              </span>
            </div>
            <button
              type="button"
              className="shrink-0 inline-flex items-center h-7 px-3 rounded-(--radius-sm) bg-accent-tint text-ink text-(length:--text-sm) hover:bg-accent-tint-strong transition-colors duration-(--dur-fast) ease-(--ease-standard)"
              onClick={chooseNotesFolder}
            >
              Choose folder…
            </button>
          </div>
          <div className="flex items-center justify-between gap-3 py-2">
            <div className="flex flex-col min-w-0">
              <span className="text-(length:--text-sm)">
                Import Logos notes
              </span>
              <span className="panel__muted">
                Import Logos Bible Study .txt or HTML exports — one file per
                book, or select several at once. The HTML export also carries
                over highlighted passages. Already-imported passages are
                skipped.
              </span>
            </div>
            <button
              type="button"
              disabled={importingLogos}
              className="shrink-0 inline-flex items-center h-7 px-3 rounded-(--radius-sm) bg-accent-tint text-ink text-(length:--text-sm) hover:bg-accent-tint-strong disabled:opacity-50 disabled:cursor-default transition-colors duration-(--dur-fast) ease-(--ease-standard)"
              onClick={importLogos}
            >
              {importingLogos ? "Importing…" : "Import Logos notes…"}
            </button>
          </div>
          {logosError && (
            <p className="mt-1 text-danger text-(length:--text-xs)">
              {logosError}
            </p>
          )}
          {logosSummary && (
            <>
              <ul className="mt-1 text-(length:--text-xs) text-muted">
                {logosSummary.files.map((f) => (
                  <li key={f.file}>
                    {f.file} — {f.imported} imported, {f.skipped} skipped
                    {f.retitled > 0 && ` (${f.retitled} retitled)`}
                    {f.warnings.length > 0 && (
                      <ul className="ml-3 list-disc list-inside panel__muted">
                        {f.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
              {lastImportedIds && lastImportedIds.length > 0 && (
                <button
                  type="button"
                  className="mt-2 inline-flex items-center h-7 px-3 rounded-(--radius-sm) bg-danger-tint text-danger text-(length:--text-sm) hover:opacity-80 transition-opacity duration-(--dur-fast) ease-(--ease-standard)"
                  onClick={undoLogosImport}
                >
                  Undo import ({lastImportedIds.length} note
                  {lastImportedIds.length === 1 ? "" : "s"})
                </button>
              )}
            </>
          )}
        </section>

        <section className="[&+&]:mt-6">
          <h3 className="mb-2 text-(length:--text-xs) uppercase tracking-[0.06em] text-muted">
            Anchor highlights
          </h3>
          <p className="panel__muted">
            Palette for verse-anchor highlights in the Reader. Existing notes
            keep their color when you switch.
          </p>
          <div
            className="flex flex-col gap-2 mt-3"
            role="radiogroup"
            aria-label="Anchor highlight palette"
          >
            {HIGHLIGHT_PALETTES.map((p) => {
              const selected = ws.anchorPalette === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => choosePalette(p.id)}
                  className={
                    "flex items-center justify-between gap-3 px-3 py-2 rounded-(--radius-md) border text-left transition-colors duration-(--dur-fast)" +
                    (selected
                      ? " border-accent bg-accent-tint"
                      : " border-border hover:bg-accent-tint")
                  }
                >
                  <span className="text-(length:--text-sm)">{p.name}</span>
                  <span className="flex gap-1.5">
                    {p.swatches.map((s) => (
                      <span
                        key={s.var}
                        className="w-[18px] h-[18px] rounded-full border border-border"
                        style={{ background: `var(${s.var})` }}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
