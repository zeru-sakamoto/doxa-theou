// Bottom status bar — thin and quiet. Active reference · translation · status,
// with a live clock at the far end. (Theme toggle lives in Settings, not here.)
import { useEffect, useState } from "react";
import { formatReference, useWorkspace } from "../state/workspace";

export function StatusBar() {
  const ws = useWorkspace();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const status = ws.loadError ? "DB error" : ws.ready ? "Ready" : "Loading…";

  return (
    <footer className="statusbar">
      <span className="statusbar__item statusbar__ref">
        {formatReference(ws.activeReference, ws.bookName)}
      </span>
      <span className="statusbar__sep">·</span>
      <span className="statusbar__item">
        {ws.activeReference ? ws.activeTranslation : "—"}
      </span>
      <span className="statusbar__sep">·</span>
      <span className={"statusbar__item" + (ws.loadError ? " is-error" : "")}>
        {status}
      </span>
      <span className="statusbar__spacer" />
      <time className="statusbar__item statusbar__clock">
        {now.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </time>
    </footer>
  );
}
