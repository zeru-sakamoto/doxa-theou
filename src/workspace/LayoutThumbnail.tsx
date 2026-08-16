// Tiny schematic preview of a saved dockview layout — nested boxes mirroring
// the saved grid shape, each labeled with its panel type (+ book/chapter for
// Readers). Not a real screenshot: reads straight off the same JSON dockview
// already persists, so there's nothing to capture or store separately.
import type {
  GroupviewPanelState,
  SerializedDockview,
  SerializedGridObject,
} from "dockview-react";
import { useWorkspace } from "../state/workspace";
import type { ReaderParams } from "../panels/ReaderPanel";

// dockview-core doesn't export GroupPanelViewState (the leaf `data` shape)
// from its public barrel, so it's derived structurally off SerializedDockview
// itself rather than imported by name.
type GridNode = SerializedDockview["grid"]["root"];
type GroupState = GridNode extends SerializedGridObject<infer T> ? T : never;

const LABELS: Record<string, string> = {
  reader: "Reader",
  notes: "Notes",
  search: "Search",
  settings: "Settings",
};

// Dockview doesn't store per-node orientation in the serialized grid — only
// once at the root (SerializedDockview.grid.orientation) — because each
// branch level alternates (row of columns of rows of ...), same as
// dockview-core's own deserializer (gridview.js's `orthogonal`/
// `_deserializeNode`).
type Orientation = "HORIZONTAL" | "VERTICAL";
const orthogonal = (o: Orientation): Orientation =>
  o === "HORIZONTAL" ? "VERTICAL" : "HORIZONTAL";

function leafLabel(
  group: GroupState,
  panels: Record<string, GroupviewPanelState>,
  bookName: (id: number) => string,
): string {
  const id = group.activeView ?? group.views[0];
  const panel = id ? panels[id] : undefined;
  if (!panel?.contentComponent) return "Empty";
  const label = LABELS[panel.contentComponent] ?? panel.contentComponent;
  if (panel.contentComponent === "reader") {
    const params = panel.params as ReaderParams | undefined;
    if (params?.bookId && params?.chapter) {
      return `${label} · ${bookName(params.bookId)} ${params.chapter}`;
    }
  }
  return group.views.length > 1 ? `${label} +${group.views.length - 1}` : label;
}

function Node({
  node,
  orientation,
  panels,
  bookName,
}: {
  node: GridNode;
  orientation: Orientation;
  panels: Record<string, GroupviewPanelState>;
  bookName: (id: number) => string;
}) {
  if (node.type === "leaf") {
    const label = leafLabel(node.data as GroupState, panels, bookName);
    return (
      <div
        className="flex-1 min-w-0 min-h-0 rounded-[2px] border border-border bg-panel px-1 py-0.5 text-[6px] leading-tight text-muted truncate"
        title={label}
      >
        {label}
      </div>
    );
  }
  const children = node.data as GridNode[];
  return (
    <div
      className={
        "flex flex-1 min-w-0 min-h-0 gap-0.5 " +
        (orientation === "HORIZONTAL" ? "flex-row" : "flex-col")
      }
    >
      {children.map((child, i) => (
        <Node
          key={i}
          node={child}
          orientation={orthogonal(orientation)}
          panels={panels}
          bookName={bookName}
        />
      ))}
    </div>
  );
}

export function LayoutThumbnail({ layout }: { layout: SerializedDockview }) {
  const ws = useWorkspace();
  return (
    <div className="flex w-16 h-10 shrink-0 gap-0.5 overflow-hidden">
      <Node
        node={layout.grid.root}
        orientation={layout.grid.orientation as Orientation}
        panels={layout.panels}
        bookName={ws.bookName}
      />
    </div>
  );
}
