// Search — Scripture + Notes groups. Scripture is the FTS5-backed `search`
// command; Notes is a client-side substring match over the in-memory notes
// (title/tags/body), same as the Notes panel's own list filter. Driven by the
// header's global search field (doxa:search) or its own input.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { search as apiSearch, type SearchHit } from "../api";
import { useNotes } from "../state/notes";
import { useWorkspace } from "../state/workspace";
import { useDock } from "../workspace/dock";
import { takePendingSearch } from "../workspace/globalSearch";
import { notePreview } from "./notes/notes";

export function SearchPanel() {
  const ws = useWorkspace();
  const dock = useDock();
  const { notes } = useNotes();
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(""); // submitted term; drives both groups
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);

  async function run(q: string) {
    setQuery(q);
    const term = q.trim();
    setSearched(term);
    if (!term) {
      setHits([]);
      setRan(false);
      return;
    }
    setLoading(true);
    setError(null);
    setRan(true);
    try {
      setHits(await apiSearch(term));
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
        <input
          className="input w-full"
          value={query}
          placeholder="Search scripture & notes…"
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>

      <div className="panel__scroll">
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
                      {h.text}
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

function Group({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="[&+&]:mt-4">
      <h3 className="flex items-center gap-2 mb-2 font-(family-name:--font-mono) text-(length:--text-2xs) uppercase tracking-[0.08em] text-muted">
        {label}{" "}
        <span className="px-1.5 rounded-full bg-panel border border-border">
          {count}
        </span>
      </h3>
      <div>{children}</div>
    </section>
  );
}
