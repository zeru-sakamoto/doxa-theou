import { NotesProvider } from "./state/notes";
import { WorkspaceProvider } from "./state/workspace";
import { WorkspaceShell } from "./workspace/WorkspaceShell";

export default function App() {
  return (
    <WorkspaceProvider>
      <NotesProvider>
        <WorkspaceShell />
      </NotesProvider>
    </WorkspaceProvider>
  );
}
