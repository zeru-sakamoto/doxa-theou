// Search — Scripture + Notes groups. Scripture is the FTS5-backed `search`
// command; Notes is a client-side substring match over the in-memory notes
// (title/tags/body), same as the Notes panel's own list filter. Driven by the
// header's global search field (doxa:search) or its own input.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import {
  findSectionHeading,
  listSectionHeadings,
  search as apiSearch,
  type HeadingSuggestion,
  type SearchHit,
} from "../api";
import { useNotes } from "../state/notes";
import { useWorkspace } from "../state/workspace";
import { exactReference } from "../workspace/CommandPalette";
import { useDock } from "../workspace/dock";
import { GhostTextInput } from "../workspace/GhostTextInput";
import { takePendingSearch } from "../workspace/globalSearch";
import { ChevronRightIcon, ICON } from "../workspace/icons";
import { suggestCompletion } from "../workspace/inlineSuggest";
import { useArrowScroll } from "../workspace/useArrowScroll";
import { notePreview } from "./notes/notes";

export function SearchPanel({ api }: IDockviewPanelProps) {
  const ws = useWorkspace();
  const dock = useDock();
  const { notes } = useNotes();
  const [isActive, setIsActive] = useState(api.isActive);
  useEffect(() => {
    const d = api.onDidActiveChange(() => setIsActive(api.isActive));
    return () => d.dispose();
  }, [api]);
  const resultsRef = useRef<HTMLDivElement>(null);
  useArrowScroll(isActive, resultsRef);
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(""); // submitted term; drives both groups
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);
  const [headings, setHeadings] = useState<HeadingSuggestion[]>([]);

  // Loaded once (cached in api.ts) — feeds the inline suggestion below.
  useEffect(() => {
    listSectionHeadings(ws.defaultTranslation)
      .then(setHeadings)
      .catch(() => setHeadings([]));
  }, [ws.defaultTranslation]);

  const suggestion = useMemo(
    () => suggestCompletion(query, ws.books, headings),
    [query, ws.books, headings],
  );

  async function run(q: string) {
    setQuery(q);
    const term = q.trim();
    setSearched(term);
    if (!term) {
      setHits([]);
      setRan(false);
      return;
    }
    // Typed accurately as "Book Chapter[:Verse]" or a passage heading title
    // — jump straight there instead of full-text searching.
    const ref = exactReference(term, ws.books);
    if (ref) {
      dock.gotoReference(ref.bookId, ref.chapter, ref.verse);
      ws.setActiveReference(ref);
      setHits([]);
      setRan(false);
      return;
    }
    const heading = await findSectionHeading(term, ws.defaultTranslation).catch(
      () => null,
    );
    if (heading) {
      dock.gotoReference(heading.book_id, heading.chapter, heading.verse_start);
      ws.setActiveReference({
        bookId: heading.book_id,
        chapter: heading.chapter,
        verse: heading.verse_start,
      });
      setHits([]);
      setRan(false);
      return;
    }
    setLoading(true);
    setError(null);
    setRan(true);
    try {
      // Default translation, plus any others the user has an open Reader
      // for — never every translation in the DB.
      const translations = [
        ...new Set([
          ws.defaultTranslation,
          ...dock.getOpenReaderTranslations(),
        ]),
      ];
      const results = await Promise.all(
        translations.map((t) => apiSearch(term, t)),
      );
      setHits(results.flat().sort((a, b) => a.score - b.score));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  // Notes match instantly in-memory (no IPC), so this stays in sync with the
  // live notes list and the submitted term without a loading state.
  const noteHits = useMemo(() => {
    const q = searched.toLowerCase();
    if (!q) return [];
    return notes.filter((n) =>
      `${n.title} ${n.tags.join(" ")} ${n.body}`.toLowerCase().includes(q),
    );
  }, [notes, searched]);

  // React to the header's global search submissions.
  useEffect(() => {
    const onSearch = (e: Event) => run((e as CustomEvent).detail as string);
    window.addEventListener("doxa:search", onSearch);
    // Drain a query the header stashed before this (lazy) panel mounted, so a
    // first-open global search isn't lost to the mount race.
    const pending = takePendingSearch();
    if (pending) run(pending);
    return () => window.removeEventListener("doxa:search", onSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function gotoVerse(h: SearchHit) {
    dock.gotoReference(h.book_id, h.chapter, h.verse);
    ws.setActiveReference({
      bookId: h.book_id,
      chapter: h.chapter,
      verse: h.verse,
    });
  }

  return (
    <div className="panel">
      <form
        className="py-2 px-3 border-b border-border shrink-0"
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
      >
        <GhostTextInput
          value={query}
          placeholder="Search scripture & notes…"
          onChange={setQuery}
          suggestion={suggestion}
        />
      </form>

      <div className="panel__scroll" ref={resultsRef}>
        {error && <p className="panel__error">{error}</p>}
        {!error && loading && <p className="panel__muted">Searching…</p>}
        {!error && !loading && ran && (
          <>
            <Group label="Scripture" count={hits.length}>
              {hits.length === 0 ? (
                <p className="panel__muted">No verses found.</p>
              ) : (
                hits.map((h) => (
                  <button
                    key={`${h.verse_ref_id}-${h.translation}`}
                    className="flex flex-col gap-0.5 w-full p-2 mb-0.5 border-0 border-l-2 border-l-transparent rounded-(--radius-sm) bg-transparent text-left hover:bg-accent-tint hover:border-l-accent"
                    onClick={() => gotoVerse(h)}
                  >
                    <span className="font-(family-name:--font-mono) text-(length:--text-xs) text-accent">
                      {ws.bookAbbr(h.book_id)} {h.chapter}:{h.verse} ·{" "}
                      {h.translation}
                    </span>
                    <span className="font-(family-name:--font-serif) text-(length:--text-base) text-ink">
                      {highlightMatches(h.text, searched)}
                    </span>
                  </button>
                ))
              )}
            </Group>
            <Group label="Notes" count={noteHits.length}>
              {noteHits.length === 0 ? (
                <p className="panel__muted">No notes found.</p>
              ) : (
                noteHits.map((n) => (
                  <button
                    key={n.id}
                    className="flex flex-col gap-1 w-full p-2 mb-0.5 border-0 border-l-2 border-l-transparent rounded-(--radius-sm) bg-transparent text-left hover:bg-accent-tint hover:border-l-accent"
                    onClick={() => dock.openNotes(n.id)}
                  >
                    <span className="flex items-center gap-1.5 text-(length:--text-sm) font-medium text-ink">
                      {n.color && (
                        <span
                          className="shrink-0 w-2 h-2 rounded-full"
                          style={{ background: n.color }}
                        />
                      )}
                      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                        {notePreview(n)}
                      </span>
                    </span>
                    {n.anchors.length > 0 && (
                      <span className="font-(family-name:--font-mono) text-(length:--text-xs) text-muted overflow-hidden text-ellipsis whitespace-nowrap">
                        {n.anchors.join(" · ")}
                      </span>
                    )}
                  </button>
                ))
              )}
            </Group>
          </>
        )}
        {!error && !loading && !ran && (
          <p className="panel__muted">
            Type a query to search scripture and notes.
          </p>
        )}
      </div>
    </div>
  );
}

function highlightMatches(text: string, query: string): ReactNode {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark
        key={i}
        className="bg-accent-tint-strong text-ink rounded-(--radius-sm) not-italic"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Group({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="[&+&]:mt-4">
      <button
        className="flex items-center gap-2 mb-2 w-full p-0 border-0 bg-transparent font-(family-name:--font-mono) text-(length:--text-2xs) uppercase tracking-[0.08em] text-muted"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className={
            "inline-flex transition-transform duration-(--dur-fast) ease-(--ease-standard)" +
            (open ? " rotate-90" : "")
          }
        >
          <ChevronRightIcon size={ICON.sm} />
        </span>
        {label}{" "}
        <span className="px-1.5 rounded-full bg-panel border border-border">
          {count}
        </span>
      </button>
      {open && <div>{children}</div>}
    </section>
  );
}
