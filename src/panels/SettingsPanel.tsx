// Settings — home of the theme toggle (moved here, not the status bar),
// default translation, notes editor preferences, and an anchor-highlight
// palette placeholder.
import { open } from "@tauri-apps/plugin-dialog";
import { useWorkspace } from "../state/workspace";
import { MoonIcon, SunIcon } from "../workspace/icons";
import { NOTES_HIGHLIGHT_SWATCHES } from "./notes/notes";

const DEFAULT_SWATCHES = [
  "#E8B84B",
  "#5FA8D3",
  "#7BC47F",
  "#E07A9B",
  "#B58BE0",
  "#E0855B",
];

export function SettingsPanel() {
  const ws = useWorkspace();

  async function chooseNotesFolder() {
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") ws.setNotesFolder(dir);
  }

  return (
    <div className="panel">
      <div className="panel__scroll max-w-[540px]">
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
                <SunIcon size={14} /> Light
              </button>
              <button
                className={"seg__btn" + (ws.theme === "dark" ? " is-on" : "")}
                onClick={() => ws.setTheme("dark")}
              >
                <MoonIcon size={14} /> Dark
              </button>
            </div>
          </div>
        </section>

        <section className="[&+&]:mt-6">
          <h3 className="mb-2 text-(length:--text-xs) uppercase tracking-[0.06em] text-muted">
            Reading
          </h3>
          <div className="flex items-center justify-between gap-3 py-2">
            <span className="text-(length:--text-sm)">Default translation</span>
            <select
              className="input"
              value={ws.activeTranslation}
              onChange={(e) => ws.setActiveTranslation(e.target.value)}
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
            Notes
          </h3>
          <div className="flex items-center justify-between gap-3 py-2">
            <span className="text-(length:--text-sm)">
              Default highlight color
            </span>
            <div
              className="flex gap-2"
              role="group"
              aria-label="Notes highlight color"
            >
              {NOTES_HIGHLIGHT_SWATCHES.map((s) => {
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
                {ws.notesFolder ?? "Using bundled sample notes"}
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
            Palette for verse-anchor highlights in the Reader — coming soon.
          </p>
          <div className="flex gap-2 mt-2" aria-hidden="true">
            {DEFAULT_SWATCHES.map((c) => (
              <span
                key={c}
                className="w-[22px] h-[22px] rounded-full border border-border"
                style={{ background: c }}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
