// Landing screen: shown as the dockview watermark whenever no panels are
// open (fresh launch, reset layout, or closing everything mid-session) — the
// default startup screen, not a panel you can open as a tab. Quick actions
// reuse the existing dock openers directly — no new opener functions needed.
import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import { chapterCount } from "../api";
import { DUR_BASE, EASE_OUT } from "../motion";
import { useNotes } from "../state/notes";
import { useWorkspace } from "../state/workspace";
import { useDock } from "../workspace/dock";
import {
  BibleIcon,
  ChevronRightIcon,
  ICON,
  NotesIcon,
  SearchIcon,
  SettingsIcon,
} from "../workspace/icons";
import { notePreview } from "./notes/notes";

const RECENT_NOTES_MAX = 5;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const eyebrow =
  "text-(length:--text-xs) uppercase tracking-[0.06em] text-muted";

const quickAction =
  "btn-ghost gap-2.5 px-2 py-1.5 text-(length:--text-sm) text-left";

const noteRow =
  "flex items-center justify-between gap-3 px-2 py-1.5 rounded-(--radius-sm) bg-transparent text-left transition-colors duration-(--dur-fast) ease-(--ease-standard) hover:bg-accent-tint";

export function HomePanel() {
  const ws = useWorkspace();
  const dock = useDock();
  const { notes, anchorIndex } = useNotes();
  const reduce = useReducedMotion();

  const entrance = (delay: number) => ({
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: reduce
      ? { duration: 0 }
      : { duration: DUR_BASE, ease: EASE_OUT, delay },
  });

  const recentNotes = [...notes]
    .sort((a, b) => b.modified.localeCompare(a.modified))
    .slice(0, RECENT_NOTES_MAX);

  const stats = useMemo(() => {
    const distinctBooks = new Set(
      Array.from(anchorIndex.keys()).map((k) => Number(k.split(":")[0])),
    ).size;
    const weekAgo = Date.now() - WEEK_MS;
    const editedThisWeek = notes.filter(
      (n) => new Date(n.modified).getTime() >= weekAgo,
    ).length;
    return { total: notes.length, distinctBooks, editedThisWeek };
  }, [notes, anchorIndex]);

  const pos = ws.lastReaderPosition;

  const proverbsBook = ws.books.find((b) => b.name === "Proverbs");
  const proverbsChapter = proverbsBook
    ? Math.min(new Date().getDate(), chapterCount(proverbsBook.id))
    : null;

  return (
    <div className="panel">
      <div className="panel__scroll mx-auto w-full max-w-[960px] pt-12">
        <motion.div {...entrance(0)}>
          <span className="font-(family-name:--font-serif) text-(length:--text-xl) font-semibold tracking-[0.01em]">
            Shalom
          </span>
          <p className="panel__muted">
            Open a reader, notes, or search to get started.
          </p>
        </motion.div>

        <div className="grid grid-cols-[3fr_2fr] gap-6 mt-5">
          <div className="flex flex-col gap-6 min-w-0">
            <motion.button
              {...entrance(0.04)}
              className="w-full text-left border border-border-strong rounded-(--radius-md) p-5 bg-panel transition-colors duration-(--dur-fast) ease-(--ease-standard) hover:bg-accent-tint"
              onClick={() =>
                pos
                  ? dock.gotoReference(
                      pos.bookId,
                      pos.chapter,
                      pos.verse,
                      pos.translation,
                    )
                  : dock.openReader(ws.defaultTranslation)
              }
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className={eyebrow}>
                    {pos ? "Continue reading" : "Nothing open yet"}
                  </div>
                  {pos ? (
                    <>
                      <div className="mt-1 font-(family-name:--font-serif) text-(length:--text-xl) font-semibold truncate">
                        {ws.bookName(pos.bookId)} {pos.chapter}
                        {pos.verse ? `:${pos.verse}` : ""}
                      </div>
                      <div className="mt-0.5 font-(family-name:--font-mono) text-(length:--text-xs) text-muted tracking-[0.03em]">
                        {pos.translation}
                      </div>
                    </>
                  ) : (
                    <p className="panel__muted my-1!">
                      Start reading to pick up here next time.
                    </p>
                  )}
                </div>
                <ChevronRightIcon
                  size={ICON.lg}
                  strokeWidth={2}
                  className="text-muted shrink-0"
                />
              </div>
            </motion.button>

            {proverbsBook && proverbsChapter && (
              <motion.button
                {...entrance(0.06)}
                className={
                  quickAction + " border border-border rounded-(--radius-sm)"
                }
                onClick={() =>
                  dock.gotoReference(
                    proverbsBook.id,
                    proverbsChapter,
                    undefined,
                    ws.defaultTranslation,
                  )
                }
              >
                <BibleIcon size={ICON.md} strokeWidth={2} />
                <span>
                  Read today's Proverbs
                  <span className="block text-(length:--text-xs) text-muted">
                    Proverbs {proverbsChapter}
                  </span>
                </span>
              </motion.button>
            )}

            <motion.section {...entrance(0.08)}>
              <h3 className={`mb-2 ${eyebrow}`}>Recently edited</h3>
              {recentNotes.length === 0 ? (
                <p className="panel__muted">No notes yet.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {recentNotes.map((n) => (
                    <button
                      key={n.id}
                      className={noteRow}
                      onClick={() => dock.openNotes(n.id)}
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
            </motion.section>
          </div>

          <motion.div
            {...entrance(0.04)}
            className="flex flex-col gap-6 min-w-0"
          >
            <section>
              <h3 className={`mb-2 ${eyebrow}`}>Quick actions</h3>
              <div className="flex flex-col gap-1">
                <button
                  className={quickAction}
                  onClick={() => dock.openReader(ws.defaultTranslation)}
                >
                  <BibleIcon size={ICON.md} strokeWidth={2} />
                  Start reading ({ws.defaultTranslation})
                </button>
                <button
                  className={quickAction}
                  onClick={() => dock.openNotes()}
                >
                  <NotesIcon size={ICON.md} strokeWidth={2} />
                  Open Notes
                </button>
                <button
                  className={quickAction}
                  onClick={() => dock.openSingleton("search")}
                >
                  <SearchIcon size={ICON.md} strokeWidth={2} />
                  Search
                </button>
                <button
                  className={quickAction}
                  onClick={() => dock.openSingleton("settings")}
                >
                  <SettingsIcon size={ICON.md} strokeWidth={2} />
                  Settings
                </button>
              </div>
            </section>

            <section>
              <h3 className={`mb-2 ${eyebrow}`}>Stats</h3>
              <div className="flex flex-col gap-1">
                {(
                  [
                    ["Notes", stats.total],
                    ["Books touched", stats.distinctBooks],
                    ["Edited this week", stats.editedThisWeek],
                  ] as const
                ).map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between px-2 py-1.5"
                  >
                    <span className="text-(length:--text-sm) text-muted">
                      {label}
                    </span>
                    <span className="font-(family-name:--font-mono) text-(length:--text-sm)">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
