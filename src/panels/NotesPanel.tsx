// Notes — header (hamburger note list, search, tag/book filter) is real;
// the editor body below is still a stub. Backed by sample Markdown-on-disk
// notes with frontmatter (see notes/notes.ts) — no persistence/backend yet.
import { useMemo, useState } from "react";
import { useWorkspace } from "../state/workspace";
import { Menu } from "../workspace/Menu";
import { MenuIcon, MoreIcon } from "../workspace/icons";
import { NotesDrawer } from "./notes/NotesDrawer";
import { NotesFilterMenu } from "./notes/NotesFilterMenu";
import { loadNotes, type Note } from "./notes/notes";

export function NotesPanel() {
  const ws = useWorkspace();
  const [notes] = useState<Note[]>(() => loadNotes());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [bookIds, setBookIds] = useState<Set<number>>(new Set());

  function toggleBook(id: number) {
    setBookIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const tq = tagQuery.trim().toLowerCase();
    const selectedBooks =
      bookIds.size > 0 ? ws.books.filter((b) => bookIds.has(b.id)) : [];

    return notes
      .filter((n) => {
        if (q) {
          const haystack =
            `${n.title} ${n.tags.join(" ")} ${n.body}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        if (tq && !n.tags.some((t) => t.toLowerCase().includes(tq)))
          return false;
        if (
          selectedBooks.length > 0 &&
          !n.anchors.some((a) =>
            selectedBooks.some((b) =>
              a.toLowerCase().startsWith(b.name.toLowerCase() + " "),
            ),
          )
        )
          return false;
        return true;
      })
      .sort((a, b) => (a.modified < b.modified ? 1 : -1));
  }, [notes, query, tagQuery, bookIds, ws.books]);

  return (
    <div className="panel notes">
      <div className="notes__bar reader__bar">
        <button
          className={"iconbtn" + (drawerOpen ? " is-active" : "")}
          title="Notes list"
          aria-label="Notes list"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((o) => !o)}
        >
          <MenuIcon size={16} />
        </button>
        <input
          className="input notes__search"
          value={query}
          placeholder="Search notes…"
          onChange={(e) => setQuery(e.target.value)}
        />
        <NotesFilterMenu
          tagQuery={tagQuery}
          onTagQueryChange={setTagQuery}
          books={ws.books}
          selectedBookIds={bookIds}
          onToggleBook={toggleBook}
        />
        <div className="notes__actions">
          <Menu
            triggerClassName="iconbtn"
            title="More"
            align="right"
            items={[{ label: "New note", disabled: true, onSelect: () => {} }]}
          >
            <MoreIcon size={16} />
          </Menu>
        </div>
      </div>

      <div className="notes__body">
        <NotesDrawer
          open={drawerOpen}
          notes={filtered}
          onSelect={() => setDrawerOpen(false)}
        />

        <div className="notes__pad">
          <p className="panel__muted">
            Notes are Markdown files on disk with multi-anchor verse links. The
            editor lands in a later pass — this pane is a placeholder.
          </p>
          <textarea
            className="notes__editor"
            spellCheck={false}
            placeholder={"# Note\n\nWrite freely…"}
          />
        </div>
      </div>
    </div>
  );
}
