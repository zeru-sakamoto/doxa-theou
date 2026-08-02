// Notes — header (hamburger note list, search, tag/book filter) and the
// editor (live type-to-transform Markdown). Notes live in NotesProvider
// (src/state/notes.tsx): loaded from disk, persisted through Rust on edit,
// and shared with the Reader for verse-anchor highlighting.
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import { useNotes } from "../state/notes";
import { formatReference, useWorkspace } from "../state/workspace";
import { useDock } from "../workspace/dock";
import { Menu } from "../workspace/Menu";
import {
  BulletListIcon,
  CardsIcon,
  CheckIcon,
  ICON,
  MenuIcon,
  MoreIcon,
  PlusIcon,
  SortIcon,
} from "../workspace/icons";
import { useArrowScroll } from "../workspace/useArrowScroll";
import type { Book } from "../api";
import {
  booksForAnchors,
  maybeAutoTitleFromAnchor,
  parseAnchor,
  type Note,
} from "./notes/notes";
import { NotebookMenu } from "./notes/NotebookMenu";
import { NotesCardGrid } from "./notes/NotesCardGrid";
import { NotesColorMenu } from "./notes/NotesColorMenu";
import { NotesDrawer } from "./notes/NotesDrawer";
import { NotesEditor } from "./notes/NotesEditor";
import { NotesFilterMenu } from "./notes/NotesFilterMenu";
import { NotesTagInput } from "./notes/NotesTagInput";

export interface NotesParams {
  noteId?: string;
}

// [book index, chapter, verse] of a note's earliest anchor in canonical
// Bible order, for the "book order" sort — so anchors within the same book
// still land in chapter/verse order rather than tying. Unanchored (or
// unparseable) anchors rank last.
type AnchorRank = [number, number, number];
const UNANCHORED: AnchorRank = [Infinity, Infinity, Infinity];

function anchorRank(note: Note, books: Book[]): AnchorRank {
  let best = UNANCHORED;
  for (const raw of note.anchors) {
    const ref = parseAnchor(raw, books);
    if (!ref) continue;
    const idx = books.findIndex((b) => b.id === ref.bookId);
    if (idx === -1) continue;
    const key: AnchorRank = [idx, ref.chapterStart, ref.verseStart ?? 0];
    if (compareAnchorRank(key, best) < 0) best = key;
  }
  return best;
}

function compareAnchorRank(a: AnchorRank, b: AnchorRank): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
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

  const [isActive, setIsActive] = useState(api.isActive);
  useEffect(() => {
    const d = api.onDidActiveChange(() => setIsActive(api.isActive));
    return () => d.dispose();
  }, [api]);
  // Whichever note-list view is currently mounted (sidebar, inline bars, or
  // card grid) — arrow keys scroll it while this panel is active, skipped
  // while typing in the editor (see useArrowScroll).
  const listScrollRef = useRef<HTMLDivElement>(null);
  useArrowScroll(isActive, listScrollRef);

  const [anchorDraft, setAnchorDraft] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [bookIds, setBookIds] = useState<Set<number>>(new Set());
  const [selectedNotebooks, setSelectedNotebooks] = useState<Set<string>>(
    new Set(),
  );

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

  function handleSelectNote(note: Note, e: MouseEvent) {
    if (e.ctrlKey || e.metaKey) dock.openNotes(note.id, { inactive: true });
    else selectNote(note.id);
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
    if (v && selectedNote && !selectedNote.anchors.includes(v)) {
      const anchors = [...selectedNote.anchors, v];
      const wasUntitled = !selectedNote.title.trim();
      updateNote(selectedNote.id, {
        anchors,
        book: booksForAnchors(anchors, ws.books),
      });
      if (wasUntitled)
        void maybeAutoTitleFromAnchor(
          v,
          ws.books,
          ws.activeTranslation,
          updateNote,
          selectedNote.id,
        );
    }
    setAnchorDraft(null);
  }

  function removeAnchor(anchor: string) {
    if (!selectedNote) return;
    const anchors = selectedNote.anchors.filter((a) => a !== anchor);
    updateNote(selectedNote.id, {
      anchors,
      book: booksForAnchors(anchors, ws.books),
    });
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

  function toggleNotebook(notebook: string) {
    setSelectedNotebooks((prev) => {
      const next = new Set(prev);
      next.has(notebook) ? next.delete(notebook) : next.add(notebook);
      return next;
    });
  }

  function clearFilters() {
    setSelectedTags(new Set());
    setBookIds(new Set());
    setSelectedNotebooks(new Set());
  }

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) for (const t of n.tags) set.add(t);
    return Array.from(set).sort();
  }, [notes]);

  const tagsByFrequency = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of notes)
      for (const t of n.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag]) => tag);
  }, [notes]);

  const allNotebooks = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) if (n.notebook) set.add(n.notebook);
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
        if (selectedNotebooks.size > 0 && !selectedNotebooks.has(n.notebook))
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
      .sort((a, b) => {
        if (ws.notesSortBy === "book") {
          const cmp = compareAnchorRank(
            anchorRank(a, ws.books),
            anchorRank(b, ws.books),
          );
          if (cmp !== 0) return cmp;
        }
        return a.modified < b.modified ? 1 : -1;
      });
  }, [
    notes,
    query,
    selectedTags,
    bookIds,
    selectedNotebooks,
    ws.books,
    ws.notesSortBy,
  ]);

  return (
    <div className="panel">
      <div className="reader__bar">
        {selectedNote && (
          <button
            className={"iconbtn shrink-0" + (drawerOpen ? " is-active" : "")}
            title="Notes list"
            aria-label="Notes list"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((o) => !o)}
          >
            <MenuIcon size={ICON.md} />
          </button>
        )}
        <input
          className="input flex-1 min-w-[60px] max-w-[200px]"
          value={query}
          placeholder="Search notes…"
          onChange={(e) => {
            setQuery(e.target.value);
            if (selectedNote && e.target.value.trim()) setDrawerOpen(true);
          }}
        />
        <NotesFilterMenu
          tags={allTags}
          selectedTags={selectedTags}
          onToggleTag={toggleTag}
          books={ws.books}
          selectedBookIds={bookIds}
          onToggleBook={toggleBook}
          notebooks={allNotebooks}
          selectedNotebooks={selectedNotebooks}
          onToggleNotebook={toggleNotebook}
          onClear={clearFilters}
        />
        <Menu
          triggerClassName="iconbtn"
          title="Sort notes"
          items={[
            {
              label: "Last modified",
              icon:
                ws.notesSortBy === "modified" ? (
                  <CheckIcon size={ICON.xs} />
                ) : undefined,
              onSelect: () => ws.setNotesSortBy("modified"),
            },
            {
              label: "Book order",
              icon:
                ws.notesSortBy === "book" ? (
                  <CheckIcon size={ICON.xs} />
                ) : undefined,
              onSelect: () => ws.setNotesSortBy("book"),
            },
          ]}
        >
          <SortIcon size={ICON.md} />
        </Menu>
        {!selectedNote && (
          <div
            className="seg seg--icon shrink-0"
            role="group"
            aria-label="Notes list layout"
          >
            <button
              type="button"
              className={
                "seg__btn" + (ws.notesListDisplay === "cards" ? " is-on" : "")
              }
              title="Card view"
              aria-label="Card view"
              aria-pressed={ws.notesListDisplay === "cards"}
              onClick={() => ws.setNotesListDisplay("cards")}
            >
              <CardsIcon size={ICON.sm} />
            </button>
            <button
              type="button"
              className={
                "seg__btn" + (ws.notesListDisplay === "bars" ? " is-on" : "")
              }
              title="Bar view"
              aria-label="Bar view"
              aria-pressed={ws.notesListDisplay === "bars"}
              onClick={() => ws.setNotesListDisplay("bars")}
            >
              <BulletListIcon size={ICON.sm} />
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 ml-auto shrink-0">
          {selectedNote && (
            <NotesColorMenu color={selectedNote.color} onChange={updateColor} />
          )}
          {selectedNote && (
            <NotebookMenu
              notebooks={allNotebooks}
              value={selectedNote.notebook}
              onChange={(notebook) => updateNote(selectedNote.id, { notebook })}
            />
          )}
          <button
            className="iconbtn"
            title="New note"
            aria-label="New note"
            onClick={handleNewNote}
          >
            <PlusIcon size={ICON.md} />
          </button>
          <Menu
            triggerClassName="iconbtn"
            title="More"
            align="right"
            items={[
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
                label: "Close note",
                disabled: !selectedNote,
                onSelect: () => selectNote(null),
              },
              {
                label: "Delete note",
                disabled: !selectedNote,
                danger: true,
                separatorBefore: true,
                onSelect: handleDeleteNote,
              },
            ]}
          >
            <MoreIcon size={ICON.md} />
          </Menu>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {selectedNote && (
          <NotesDrawer
            open={drawerOpen}
            notes={filtered}
            onSelect={handleSelectNote}
            scrollRef={listScrollRef}
          />
        )}

        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {selectedNote ? (
            <NotesEditor
              key={selectedNote.id}
              panelId={api.id}
              note={selectedNote}
              onRemoveAnchor={removeAnchor}
              anchorDraft={anchorDraft}
              onConfirmAnchor={confirmAnchor}
              onCancelAnchor={() => setAnchorDraft(null)}
              onTitleChange={(title) => updateNote(selectedNote.id, { title })}
              onBodyChange={(body) => updateNote(selectedNote.id, { body })}
            />
          ) : ws.notesListDisplay === "cards" ? (
            <NotesCardGrid
              notes={filtered}
              onSelect={handleSelectNote}
              scrollRef={listScrollRef}
            />
          ) : (
            <NotesDrawer
              variant="inline"
              notes={filtered}
              onSelect={handleSelectNote}
              scrollRef={listScrollRef}
            />
          )}
        </div>
      </div>

      {selectedNote && (
        <div className="p-2 border-t border-border bg-panel shrink-0">
          <NotesTagInput
            note={selectedNote}
            tagsByFrequency={tagsByFrequency}
            onUpdateNote={updateNote}
          />
        </div>
      )}
    </div>
  );
}
