// Notes — header (hamburger note list, search, tag/book filter) and the
// editor (live type-to-transform Markdown). Notes live in NotesProvider
// (src/state/notes.tsx): loaded from disk, persisted through Rust on edit,
// and shared with the Reader for verse-anchor highlighting.
import { useMemo, useState } from "react";
import { useNotes } from "../state/notes";
import { formatReference, useWorkspace } from "../state/workspace";
import { Menu } from "../workspace/Menu";
import { MenuIcon, MoreIcon } from "../workspace/icons";
import { NotesColorMenu } from "./notes/NotesColorMenu";
import { NotesDrawer } from "./notes/NotesDrawer";
import { NotesEditor } from "./notes/NotesEditor";
import { NotesFilterMenu } from "./notes/NotesFilterMenu";

export function NotesPanel() {
  const ws = useWorkspace();
  const { notes, createNote, updateNote, deleteNote } = useNotes();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [anchorDraft, setAnchorDraft] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [bookIds, setBookIds] = useState<Set<number>>(new Set());

  const selectedNote = notes.find((n) => n.id === selectedId) ?? null;

  function selectNote(id: string | null) {
    setSelectedId(id);
    setDrawerOpen(false);
    setAnchorDraft(null);
  }

  function handleNewNote() {
    const n = createNote(ws.notesLastColor);
    selectNote(n.id);
  }

  function handleDeleteNote() {
    if (!selectedNote) return;
    deleteNote(selectedNote.id);
    selectNote(null);
  }

  function confirmAnchor(value: string) {
    const v = value.trim();
    if (v && selectedNote && !selectedNote.anchors.includes(v))
      updateNote(selectedNote.id, (n) => ({ anchors: [...n.anchors, v] }));
    setAnchorDraft(null);
  }

  function removeAnchor(anchor: string) {
    if (!selectedNote) return;
    updateNote(selectedNote.id, (n) => ({
      anchors: n.anchors.filter((a) => a !== anchor),
    }));
  }

  function updateColor(color: string | undefined) {
    if (!selectedNote) return;
    updateNote(selectedNote.id, { color });
    ws.setNotesLastColor(color);
  }

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
    <div className="panel">
      <div className="reader__bar">
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
          className="input w-[200px]"
          value={query}
          placeholder="Search notes…"
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.trim()) setDrawerOpen(true);
          }}
        />
        <NotesFilterMenu
          tagQuery={tagQuery}
          onTagQueryChange={setTagQuery}
          books={ws.books}
          selectedBookIds={bookIds}
          onToggleBook={toggleBook}
        />
        <div className="flex items-center gap-2 ml-auto">
          {selectedNote && (
            <NotesColorMenu color={selectedNote.color} onChange={updateColor} />
          )}
          <Menu
            triggerClassName="iconbtn"
            title="More"
            align="right"
            items={[
              { label: "New note", onSelect: handleNewNote },
              {
                label: "Add anchor",
                disabled: !selectedNote,
                onSelect: () =>
                  setAnchorDraft(
                    ws.activeReference
                      ? formatReference(ws.activeReference, ws.bookName)
                      : "",
                  ),
              },
              {
                label: "Delete note",
                disabled: !selectedNote,
                onSelect: handleDeleteNote,
              },
            ]}
          >
            <MoreIcon size={16} />
          </Menu>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <NotesDrawer
          open={drawerOpen}
          notes={filtered}
          onSelect={(note) => selectNote(note.id)}
        />

        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {selectedNote ? (
            <NotesEditor
              key={selectedNote.id}
              note={selectedNote}
              onRemoveAnchor={removeAnchor}
              anchorDraft={anchorDraft}
              onConfirmAnchor={confirmAnchor}
              onCancelAnchor={() => setAnchorDraft(null)}
              onTitleChange={(title) => updateNote(selectedNote.id, { title })}
              onBodyChange={(body) => updateNote(selectedNote.id, { body })}
            />
          ) : (
            <p className="panel__muted p-4">Select a note to start writing.</p>
          )}
        </div>
      </div>
    </div>
  );
}
