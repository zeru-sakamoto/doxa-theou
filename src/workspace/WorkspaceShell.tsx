// Top-level workspace grid: header row / dockable center / status-bar row.
// The workspace mounts as soon as data is ready; the LoadingScreen is a
// separate full-window overlay that fades out over it (AnimatePresence), so
// there's no swap flash at the loading→workspace hand-off.
import { AnimatePresence } from "motion/react";
import { useWorkspace } from "../state/workspace";
import { CommandPalette } from "./CommandPalette";
import { DockProvider, Dockview } from "./dock";
import { Header } from "./Header";
import { LoadingScreen } from "./LoadingScreen";
import { StatusBar } from "./StatusBar";
import { Toast } from "./Toast";

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
        ) : ws.ready ? (
          <Dockview />
        ) : (
          // Placeholder keeps the grid's 3 rows intact while the overlay covers
          // this cell; the dock mounts here the moment data is ready.
          <div className="bg-bg" />
        )}
        <StatusBar />
        <CommandPalette />
        <Toast />
      </div>
      <AnimatePresence>
        {!ws.ready && !ws.loadError && <LoadingScreen key="loading" />}
      </AnimatePresence>
    </DockProvider>
  );
}
