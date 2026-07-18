import { WorkspaceProvider } from "./state/workspace";
import { WorkspaceShell } from "./workspace/WorkspaceShell";

export default function App() {
  return (
    <WorkspaceProvider>
      <WorkspaceShell />
    </WorkspaceProvider>
  );
}
