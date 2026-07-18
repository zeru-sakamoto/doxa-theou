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
      <div className="shell">
        <Header />
        {ws.loadError ? (
          <div className="dberror">
            <div className="dberror__box">
              <h2 className="dberror__title">Bible database not found</h2>
              <pre className="dberror__msg">{ws.loadError}</pre>
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
