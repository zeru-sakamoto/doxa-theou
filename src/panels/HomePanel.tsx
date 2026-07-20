// Landing screen: shown as the dockview watermark whenever no panels are
// open (fresh launch, reset layout, or closing everything mid-session) — the
// default startup screen, not a panel you can open as a tab. Quick actions
// reuse the existing dock openers directly — no new opener functions needed.
import { useNotes } from "../state/notes";
import { useWorkspace } from "../state/workspace";
import { useDock } from "../workspace/dock";
import {
  BookIcon,
  NotesIcon,
  SearchIcon,
  SettingsIcon,
} from "../workspace/icons";
import { notePreview } from "./notes/notes";

const RECENT_NOTES_MAX = 5;

const action =
  "flex items-center gap-2.5 px-3 py-2.5 border border-border-strong rounded-(--radius-md) bg-transparent text-ink text-(length:--text-sm) text-left transition-colors duration-(--dur-fast) ease-(--ease-standard) hover:bg-accent-tint active:bg-accent-tint-strong";

export function HomePanel() {
  const ws = useWorkspace();
  const dock = useDock();
  const { notes } = useNotes();

  const recentNotes = [...notes]
    .sort((a, b) => b.modified.localeCompare(a.modified))
    .slice(0, RECENT_NOTES_MAX);

  return (
    <div className="panel">
      <div className="panel__scroll mx-auto w-full max-w-[820px]">
        <span className="font-(family-name:--font-serif) text-(length:--text-xl) font-semibold tracking-[0.01em]">
          Shalom
        </span>
        <p className="panel__muted">
          Open a reader, notes, or search to get started.
        </p>

        <section className="mt-5">
          <h3 className="mb-2 text-(length:--text-xs) uppercase tracking-[0.06em] text-muted">
            Quick actions
          </h3>
          <div className="grid grid-cols-4 gap-3">
            <button
              className={action}
              onClick={() => dock.openReader(ws.defaultTranslation)}
            >
              <BookIcon size={17} strokeWidth={2} />
              Start reading ({ws.defaultTranslation})
            </button>
            <button className={action} onClick={() => dock.openNotes()}>
              <NotesIcon size={17} strokeWidth={2} />
              Open Notes
            </button>
            <button
              className={action}
              onClick={() => dock.openSingleton("search")}
            >
              <SearchIcon size={17} strokeWidth={2} />
              Search
            </button>
            <button
              className={action}
              onClick={() => dock.openSingleton("settings")}
            >
              <SettingsIcon size={17} strokeWidth={2} />
              Settings
            </button>
          </div>
        </section>

        <section className="mt-6">
          <h3 className="mb-2 text-(length:--text-xs) uppercase tracking-[0.06em] text-muted">
            Recently edited
          </h3>
          {recentNotes.length === 0 ? (
            <p className="panel__muted">No notes yet.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {recentNotes.map((n) => (
                <button
                  key={n.id}
                  className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-(--radius-sm) bg-transparent text-left transition-colors duration-(--dur-fast) ease-(--ease-standard) hover:bg-accent-tint"
                  onClick={() => dock.openNotes()}
                >
                  <span className="text-(length:--text-sm) truncate">
                    {notePreview(n)}
                  </span>
                  <span className="text-(length:--text-xs) text-muted shrink-0">
                    {new Date(n.modified).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
