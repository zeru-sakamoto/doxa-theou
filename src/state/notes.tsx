// Shared notes store. Loads all notes at startup (so the Reader can highlight
// on launch, whether or not the Notes panel is open), owns CRUD that persists
// through the Rust commands, and exposes a memoized anchor index the Reader
// reads per chapter. The in-memory index — not the SQLite one — drives the
// Reader so highlights reflect *unsaved* edits instantly and cost no IPC per
// render; notes.sqlite is the system-of-record for search/cross-ref.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  deleteNote as apiDelete,
  loadNotes as apiLoad,
  saveNote as apiSave,
  type Note,
} from "../api";
import { parseAnchor } from "../panels/notes/notes";
import { useWorkspace } from "./workspace";

export interface AnchorHighlight {
  noteId: string;
  color: string | undefined;
  verseStart?: number;
  verseEnd?: number;
}
// key: `${bookId}:${chapter}` -> anchors landing in that chapter
export type AnchorIndex = Map<string, AnchorHighlight[]>;

interface NotesCtx {
  notes: Note[];
  loading: boolean;
  error: string | null;
  anchorIndex: AnchorIndex;
  createNote: (color: string | undefined) => Note;
  updateNote: (
    id: string,
    patch: Partial<Note> | ((n: Note) => Partial<Note>),
  ) => void;
  deleteNote: (id: string) => void;
}

const Ctx = createContext<NotesCtx | null>(null);
const SAVE_DEBOUNCE_MS = 600;

export function NotesProvider({ children }: { children: ReactNode }) {
  const { books, notesFolder } = useWorkspace();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Authoritative current list (avoids stale closures in the CRUD helpers).
  const notesRef = useRef<Note[]>(notes);
  const applyNotes = useCallback((next: Note[]) => {
    notesRef.current = next;
    setNotes(next);
  }, []);

  // Persist is debounced per-note so a burst of keystrokes writes once.
  const folderRef = useRef(notesFolder);
  useEffect(() => {
    folderRef.current = notesFolder;
  }, [notesFolder]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const persist = useCallback((note: Note) => {
    const existing = timers.current.get(note.id);
    if (existing) clearTimeout(existing);
    timers.current.set(
      note.id,
      setTimeout(() => {
        timers.current.delete(note.id);
        apiSave(note, folderRef.current).catch((e) => setError(String(e)));
      }, SAVE_DEBOUNCE_MS),
    );
  }, []);

  // Load at startup and whenever the folder changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiLoad(notesFolder)
      .then((ns) => {
        if (cancelled) return;
        applyNotes(ns);
        setError(null);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [notesFolder, applyNotes]);

  const createNote = useCallback(
    (color: string | undefined): Note => {
      const now = new Date().toISOString();
      const note: Note = {
        id: crypto.randomUUID(),
        title: "",
        tags: [],
        anchors: [],
        notebook: "",
        color,
        created: now,
        modified: now,
        body: "",
      };
      applyNotes([note, ...notesRef.current]);
      persist(note); // create the file so it exists on disk immediately
      return note;
    },
    [applyNotes, persist],
  );

  const updateNote = useCallback(
    (id: string, patch: Partial<Note> | ((n: Note) => Partial<Note>)) => {
      let updated: Note | undefined;
      const next = notesRef.current.map((n) => {
        if (n.id !== id) return n;
        const p = typeof patch === "function" ? patch(n) : patch;
        updated = { ...n, ...p, modified: new Date().toISOString() };
        return updated;
      });
      applyNotes(next);
      if (updated) persist(updated);
    },
    [applyNotes, persist],
  );

  const deleteNote = useCallback(
    (id: string) => {
      applyNotes(notesRef.current.filter((n) => n.id !== id));
      const t = timers.current.get(id);
      if (t) {
        clearTimeout(t);
        timers.current.delete(id);
      }
      apiDelete(id, folderRef.current).catch((e) => setError(String(e)));
    },
    [applyNotes],
  );

  const anchorIndex = useMemo<AnchorIndex>(() => {
    const map: AnchorIndex = new Map();
    for (const note of notes) {
      for (const raw of note.anchors) {
        const ref = parseAnchor(raw, books);
        if (!ref) continue;
        const key = `${ref.bookId}:${ref.chapter}`;
        const list = map.get(key);
        const hit: AnchorHighlight = {
          noteId: note.id,
          color: note.color,
          verseStart: ref.verseStart,
          verseEnd: ref.verseEnd,
        };
        if (list) list.push(hit);
        else map.set(key, [hit]);
      }
    }
    return map;
  }, [notes, books]);

  const value = useMemo<NotesCtx>(
    () => ({
      notes,
      loading,
      error,
      anchorIndex,
      createNote,
      updateNote,
      deleteNote,
    }),
    [notes, loading, error, anchorIndex, createNote, updateNote, deleteNote],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotes(): NotesCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useNotes must be used within NotesProvider");
  return c;
}
