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

export type Theme = "light" | "dark";
export interface Reference {
  bookId: number;
  chapter: number;
  verse?: number;
}

interface WorkspaceCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  books: Book[];
  translations: Translation[];
  ready: boolean;
  loadError: string | null;
  defaultTranslation: string;
  activeTranslation: string;
  setActiveTranslation: (code: string) => void;
  activeReference: Reference | null;
  setActiveReference: (r: Reference | null) => void;
  bookName: (id: number) => string;
  bookAbbr: (id: number) => string;
}

const Ctx = createContext<WorkspaceCtx | null>(null);
const THEME_KEY = "doxa-theme";

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

  const defaultTranslation =
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
      activeTranslation,
      setActiveTranslation,
      activeReference,
      setActiveReference,
      bookName,
      bookAbbr,
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
      activeTranslation,
      activeReference,
      bookName,
      bookAbbr,
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
