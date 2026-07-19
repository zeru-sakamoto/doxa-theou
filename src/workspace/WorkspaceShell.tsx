// Top-level workspace grid: header row / dockable center / status-bar row.
import { useWorkspace } from "../state/workspace";
import { CommandPalette } from "./CommandPalette";
import { DockProvider, Dockview } from "./dock";
import { Header } from "./Header";
import { StatusBar } from "./StatusBar";

export function WorkspaceShell() {
  const ws = useWorkspace();
  return (
    <DockProvider>
      <div className="grid h-full grid-rows-[var(--header-height)_1fr_var(--statusbar-height)]">
        <Header />
        {ws.loadError ? (
          <div className="flex items-center justify-center p-8 bg-bg">
            <div className="max-w-[560px]">
              <h2 className="mb-3 text-(length:--text-xl)">
                Bible database not found
              </h2>
              <pre className="whitespace-pre-wrap rounded-(--radius-sm) border border-border bg-panel p-3 font-(family-name:--font-mono) text-(length:--text-xs) text-muted">
                {ws.loadError}
              </pre>
            </div>
          </div>
        ) : (
          <Dockview />
        )}
        <StatusBar />
        <CommandPalette />
      </div>
    </DockProvider>
  );
}
