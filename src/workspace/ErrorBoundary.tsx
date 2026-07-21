// Top-level error boundary. The dock already contains per-panel crashes
// (PanelErrorBoundary in dock.tsx), but an error in a provider or the shell
// itself had nothing above it — it blanked the whole window (and, in dev, a
// Fast-Refresh update that throws would leave a blank screen needing a manual
// reload). This catches those, shows the message, and offers a reload instead
// of a blank page. Class component: error boundaries have no hook equivalent.
import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("App crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-bg text-ink p-8">
          <div className="max-w-[560px]">
            <h2 className="mb-3 text-(length:--text-xl)">
              Something went wrong
            </h2>
            <pre className="whitespace-pre-wrap rounded-(--radius-sm) border border-border bg-panel p-3 font-(family-name:--font-mono) text-(length:--text-xs) text-muted">
              {this.state.error.message}
            </pre>
            <button
              type="button"
              className="mt-3 inline-flex items-center h-7 px-3 rounded-(--radius-sm) bg-accent-tint text-ink text-(length:--text-sm) hover:bg-accent-tint-strong transition-colors duration-(--dur-fast) ease-(--ease-standard)"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
