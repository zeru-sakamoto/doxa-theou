// Shared workspace state: theme + canonical data (books/translations) + the
// active reference/translation the status bar and Cmd-K reflect.
// ponytail: React context is plenty for this. Reach for a store lib only if
// cross-panel state actually gets unwieldy.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  type Book,
  type Translation,
  listBooks,
  listTranslations,
} from "../api";
import type { PaletteId } from "../panels/notes/notes";

export type Theme = "light" | "dark";
export interface Reference {
  bookId: number;
  chapter: number;
  verse?: number;
}

export const DEFAULT_NOTES_HIGHLIGHT_COLOR = "var(--highlight-indigo)";

interface WorkspaceCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  books: Book[];
  translations: Translation[];
  ready: boolean;
  loadError: string | null;
  defaultTranslation: string;
  setDefaultTranslation: (code: string) => void;
  activeTranslation: string;
  setActiveTranslation: (code: string) => void;
  activeReference: Reference | null;
  setActiveReference: (r: Reference | null) => void;
  bookName: (id: number) => string;
  bookAbbr: (id: number) => string;
  notesHighlightColor: string;
  setNotesHighlightColor: (c: string) => void;
  notesLastColor: string | undefined;
  setNotesLastColor: (c: string | undefined) => void;
  notesFolder: string | null;
  setNotesFolder: (p: string | null) => void;
  anchorPalette: PaletteId;
  setAnchorPalette: (p: PaletteId) => void;
}

const Ctx = createContext<WorkspaceCtx | null>(null);
const THEME_KEY = "doxa-theme";
const DEFAULT_TRANSLATION_KEY = "doxa-default-translation";
const NOTES_HIGHLIGHT_COLOR_KEY = "doxa-notes-highlight-color";
const NOTES_LAST_COLOR_KEY = "doxa-notes-last-color";
const NOTES_FOLDER_KEY = "doxa-notes-folder";
const ANCHOR_PALETTE_KEY = "doxa-anchor-palette";

function initialTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const [books, setBooks] = useState<Book[]>([]);
  const [translations, setTranslations] = useState<Translation[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTranslation, setActiveTranslation] = useState("ESV");
  const [activeReference, setActiveReference] = useState<Reference | null>(
    null,
  );
  const [notesHighlightColor, setNotesHighlightColorState] = useState(
    () =>
      localStorage.getItem(NOTES_HIGHLIGHT_COLOR_KEY) ??
      DEFAULT_NOTES_HIGHLIGHT_COLOR,
  );
  const [notesLastColor, setNotesLastColorState] = useState<string | undefined>(
    () => localStorage.getItem(NOTES_LAST_COLOR_KEY) ?? undefined,
  );
  const [notesFolder, setNotesFolderState] = useState<string | null>(() =>
    localStorage.getItem(NOTES_FOLDER_KEY),
  );
  const [userDefaultTranslation, setUserDefaultTranslationState] = useState<
    string | null
  >(() => localStorage.getItem(DEFAULT_TRANSLATION_KEY));
  const [anchorPalette, setAnchorPaletteState] = useState<PaletteId>(
    () => (localStorage.getItem(ANCHOR_PALETTE_KEY) as PaletteId) || "koine",
  );

  // Apply + persist theme (before paint to avoid a flash).
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // Load canonical data once. A missing bible.sqlite surfaces here as loadError.
  useEffect(() => {
    Promise.all([listBooks(), listTranslations()])
      .then(([bs, ts]) => {
        setBooks(bs);
        setTranslations(ts);
        setActiveTranslation(
          ts.find((t) => t.is_default)?.code ?? ts[0]?.code ?? "ESV",
        );
        setReady(true);
      })
      .catch((e) => setLoadError(String(e)));
  }, []);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggleTheme = useCallback(
    () => setThemeState((t) => (t === "dark" ? "light" : "dark")),
    [],
  );
  const bookName = useCallback(
    (id: number) => books.find((b) => b.id === id)?.name ?? `Book ${id}`,
    [books],
  );
  const bookAbbr = useCallback(
    (id: number) => books.find((b) => b.id === id)?.abbr ?? String(id),
    [books],
  );
  const setNotesHighlightColor = useCallback((c: string) => {
    setNotesHighlightColorState(c);
    localStorage.setItem(NOTES_HIGHLIGHT_COLOR_KEY, c);
  }, []);
  const setNotesLastColor = useCallback((c: string | undefined) => {
    setNotesLastColorState(c);
    if (c) localStorage.setItem(NOTES_LAST_COLOR_KEY, c);
    else localStorage.removeItem(NOTES_LAST_COLOR_KEY);
  }, []);
  const setNotesFolder = useCallback((p: string | null) => {
    setNotesFolderState(p);
    if (p) localStorage.setItem(NOTES_FOLDER_KEY, p);
    else localStorage.removeItem(NOTES_FOLDER_KEY);
  }, []);
  const setDefaultTranslation = useCallback((code: string) => {
    setUserDefaultTranslationState(code);
    localStorage.setItem(DEFAULT_TRANSLATION_KEY, code);
  }, []);
  const setAnchorPalette = useCallback((p: PaletteId) => {
    setAnchorPaletteState(p);
    localStorage.setItem(ANCHOR_PALETTE_KEY, p);
  }, []);

  // The default for newly-opened Readers: the user's saved choice, else the
  // DB's is_default. Existing Readers keep the translation they opened with.
  const defaultTranslation =
    userDefaultTranslation ??
    translations.find((t) => t.is_default)?.code ??
    translations[0]?.code ??
    "ESV";

  const value = useMemo<WorkspaceCtx>(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      books,
      translations,
      ready,
      loadError,
      defaultTranslation,
      setDefaultTranslation,
      activeTranslation,
      setActiveTranslation,
      activeReference,
      setActiveReference,
      bookName,
      bookAbbr,
      notesHighlightColor,
      setNotesHighlightColor,
      notesLastColor,
      setNotesLastColor,
      notesFolder,
      setNotesFolder,
      anchorPalette,
      setAnchorPalette,
    }),
    [
      theme,
      setTheme,
      toggleTheme,
      books,
      translations,
      ready,
      loadError,
      defaultTranslation,
      setDefaultTranslation,
      activeTranslation,
      activeReference,
      bookName,
      bookAbbr,
      notesHighlightColor,
      setNotesHighlightColor,
      notesLastColor,
      setNotesLastColor,
      notesFolder,
      setNotesFolder,
      anchorPalette,
      setAnchorPalette,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace(): WorkspaceCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return c;
}

export function formatReference(
  ref: Reference | null,
  name: (id: number) => string,
): string {
  if (!ref) return "—";
  const base = `${name(ref.bookId)} ${ref.chapter}`;
  return ref.verse ? `${base}:${ref.verse}` : base;
}
