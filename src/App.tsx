import { NotesProvider } from "./state/notes";
import { WorkspaceProvider } from "./state/workspace";
import { ErrorBoundary } from "./workspace/ErrorBoundary";
import { WorkspaceShell } from "./workspace/WorkspaceShell";

export default function App() {
  return (
    <ErrorBoundary>
      <WorkspaceProvider>
        <NotesProvider>
          <WorkspaceShell />
        </NotesProvider>
      </WorkspaceProvider>
    </ErrorBoundary>
  );
}
