// Settings — home of the theme toggle (moved here, not the status bar),
// default translation, and a highlight-palette placeholder.
import { useWorkspace } from "../state/workspace";
import { MoonIcon, SunIcon } from "../workspace/icons";

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
  return (
    <div className="panel settings">
      <div className="panel__scroll settings__scroll">
        <section className="set">
          <h3 className="set__head">Appearance</h3>
          <div className="set__row">
            <span className="set__label">Theme</span>
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

        <section className="set">
          <h3 className="set__head">Reading</h3>
          <div className="set__row">
            <span className="set__label">Default translation</span>
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

        <section className="set">
          <h3 className="set__head">Highlights</h3>
          <p className="panel__muted">
            User-configurable highlight palette — coming soon.
          </p>
          <div className="swatches" aria-hidden="true">
            {DEFAULT_SWATCHES.map((c) => (
              <span key={c} className="swatch" style={{ background: c }} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
