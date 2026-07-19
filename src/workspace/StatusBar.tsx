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
    <footer className="flex items-center gap-2 h-(--statusbar-height) px-3 bg-panel text-muted border-t border-border text-(length:--text-2xs) select-none">
      <span className="whitespace-nowrap font-(family-name:--font-mono) text-ink">
        {formatReference(ws.activeReference, ws.bookName)}
      </span>
      <span className="opacity-50">·</span>
      <span className="whitespace-nowrap">
        {ws.activeReference ? ws.activeTranslation : "—"}
      </span>
      <span className="opacity-50">·</span>
      <span
        className={"whitespace-nowrap" + (ws.loadError ? " text-danger" : "")}
      >
        {status}
      </span>
      <span className="flex-1" />
      <time className="whitespace-nowrap font-(family-name:--font-mono) tabular-nums">
        {now.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </time>
    </footer>
  );
}
