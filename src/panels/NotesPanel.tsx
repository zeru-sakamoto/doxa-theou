// Notes — header (hamburger note list, search, tag/book filter) and the
// editor (live type-to-transform Markdown). Notes live in NotesProvider
// (src/state/notes.tsx): loaded from disk, persisted through Rust on edit,
// and shared with the Reader for verse-anchor highlighting.
import { useEffect, useMemo, useState } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import { useNotes } from "../state/notes";
import { formatReference, useWorkspace } from "../state/workspace";
import { useDock } from "../workspace/dock";
import { Menu } from "../workspace/Menu";
import { CloseIcon, MenuIcon, MoreIcon } from "../workspace/icons";
import { NotesColorMenu } from "./notes/NotesColorMenu";
import { NotesDrawer } from "./notes/NotesDrawer";
import { NotesEditor } from "./notes/NotesEditor";
import { NotesFilterMenu } from "./notes/NotesFilterMenu";

export interface NotesParams {
  noteId?: string;
}

export function NotesPanel({ api, params }: IDockviewPanelProps<NotesParams>) {
  const ws = useWorkspace();
  const dock = useDock();
  const { notes, createNote, updateNote, deleteNote } = useNotes();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    params.noteId ?? null,
  );

  // Mirror the currently-open note into the panel's own params so
  // "Duplicate tab" (dock.tsx) opens the new tab on the note actually
  // showing, not just whatever noteId this panel was originally opened
  // with. Read-only from this panel's perspective — never affects this
  // instance's own state.
  useEffect(() => {
    api.updateParameters({ noteId: selectedId ?? undefined });
  }, [api, selectedId]);
  const [anchorDraft, setAnchorDraft] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [bookIds, setBookIds] = useState<Set<number>>(new Set());

  const selectedNote = notes.find((n) => n.id === selectedId) ?? null;

  // Tab title: the open note's title, falling back to "Notes" only when
  // there's no note open or it hasn't been titled yet.
  useEffect(() => {
    api.setTitle(selectedNote?.title.trim() ? selectedNote.title : "Notes");
  }, [api, selectedNote?.title]);

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

  function addTag(value: string) {
    const v = value.trim().replace(/^-+|-+$/g, "");
    if (v && selectedNote && !selectedNote.tags.includes(v))
      updateNote(selectedNote.id, (n) => ({ tags: [...n.tags, v] }));
    setTagDraft("");
  }

  function removeTag(tag: string) {
    if (!selectedNote) return;
    updateNote(selectedNote.id, (n) => ({
      tags: n.tags.filter((t) => t !== tag),
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

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  }

  function clearFilters() {
    setSelectedTags(new Set());
    setBookIds(new Set());
  }

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) for (const t of n.tags) set.add(t);
    return Array.from(set).sort();
  }, [notes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const selectedBooks =
      bookIds.size > 0 ? ws.books.filter((b) => bookIds.has(b.id)) : [];

    return notes
      .filter((n) => {
        if (q) {
          const haystack =
            `${n.title} ${n.tags.join(" ")} ${n.body}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        if (selectedTags.size > 0 && !n.tags.some((t) => selectedTags.has(t)))
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
  }, [notes, query, selectedTags, bookIds, ws.books]);

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
          tags={allTags}
          selectedTags={selectedTags}
          onToggleTag={toggleTag}
          books={ws.books}
          selectedBookIds={bookIds}
          onToggleBook={toggleBook}
          onClear={clearFilters}
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
          onSelect={(note, e) =>
            e.ctrlKey || e.metaKey
              ? dock.openNotes(note.id, { inactive: true })
              : selectNote(note.id)
          }
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

      {selectedNote && (
        <div className="p-2 border-t border-border bg-panel shrink-0">
          <div className="flex flex-nowrap focus-within:flex-wrap justify-end focus-within:justify-start items-center gap-1.5 px-2 py-1 h-[30px] focus-within:h-auto overflow-hidden focus-within:overflow-visible rounded-(--radius-sm) border border-border-strong bg-bg focus-within:border-accent focus-within:shadow-[0_0_0_2px_var(--accent-tint-strong)]">
            {selectedNote.tags.map((t) => (
              <span
                key={t}
                className="flex items-center gap-1 py-px pl-1.5 pr-1 rounded-full bg-accent-tint text-accent text-(length:--text-2xs)"
              >
                {t}
                <button
                  type="button"
                  className="flex items-center justify-center rounded-(--radius-full) text-accent hover:text-ink"
                  title={`Remove tag ${t}`}
                  aria-label={`Remove tag ${t}`}
                  onClick={() => removeTag(t)}
                >
                  <CloseIcon size={10} />
                </button>
              </span>
            ))}
            <input
              className="flex-1 min-w-[100px] border-0 bg-transparent text-ink placeholder:text-muted text-(length:--text-sm) py-0.5"
              style={{ outline: "none" }}
              value={tagDraft}
              placeholder="Add tag…"
              onChange={(e) => setTagDraft(e.target.value.replace(/\s+/g, "-"))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  addTag(tagDraft);
                } else if (
                  e.key === "Backspace" &&
                  tagDraft === "" &&
                  selectedNote.tags.length > 0
                ) {
                  e.preventDefault();
                  removeTag(selectedNote.tags[selectedNote.tags.length - 1]);
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
