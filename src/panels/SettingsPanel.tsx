// Settings — theme, default translation (for new Readers), notes editor
// preferences, and the anchor-highlight palette (drives note colors + the
// editor's default highlight; see notes.ts / tokens.css).
import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { importBibleDb } from "../api";
import { useWorkspace } from "../state/workspace";
import { ICON, MoonIcon, SunIcon } from "../workspace/icons";
import { HIGHLIGHT_PALETTES, paletteById, type PaletteId } from "./notes/notes";

export function SettingsPanel() {
  const ws = useWorkspace();
  const swatches = paletteById(ws.anchorPalette).swatches;
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

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
      window.location.reload();
    } catch (e) {
      setImportError(String(e));
      setImporting(false);
    }
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
            <span className="text-(length:--text-sm)">
              Default highlight color
            </span>
            <div
              className="flex gap-2"
              role="group"
              aria-label="Notes highlight color"
            >
              {swatches.map((s) => {
                const value = `var(${s.var})`;
                return (
                  <button
                    key={s.var}
                    type="button"
                    title={s.name}
                    aria-label={`Use ${s.name} as the default notes highlight color`}
                    aria-pressed={ws.notesHighlightColor === value}
                    onClick={() => ws.setNotesHighlightColor(value)}
                    className={
                      "w-[22px] h-[22px] rounded-full border" +
                      (ws.notesHighlightColor === value
                        ? " border-ink ring-2 ring-offset-2 ring-offset-bg ring-ink"
                        : " border-border")
                    }
                    style={{ background: value }}
                  />
                );
              })}
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
