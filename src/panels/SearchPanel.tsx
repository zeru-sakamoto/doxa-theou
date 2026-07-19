// Search — Verses + Notes groups. Wired to the FTS5-backed `search` command.
// Driven by the header's global search field (doxa:search) or its own input.
import { useEffect, useState, type ReactNode } from "react";
import { search as apiSearch, type SearchHit } from "../api";
import { useWorkspace } from "../state/workspace";
import { useDock } from "../workspace/dock";

export function SearchPanel() {
  const ws = useWorkspace();
  const dock = useDock();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);

  async function run(q: string) {
    setQuery(q);
    const term = q.trim();
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

  // React to the header's global search submissions.
  useEffect(() => {
    const onSearch = (e: Event) => run((e as CustomEvent).detail as string);
    window.addEventListener("doxa:search", onSearch);
    return () => window.removeEventListener("doxa:search", onSearch);
  }, []);

  function goto(h: SearchHit) {
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
          placeholder="Search scripture…"
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>

      <div className="panel__scroll">
        {error && <p className="panel__error">{error}</p>}
        {!error && loading && <p className="panel__muted">Searching…</p>}
        {!error && !loading && ran && (
          <>
            <Group label="Verses" count={hits.length}>
              {hits.length === 0 ? (
                <p className="panel__muted">No verses found.</p>
              ) : (
                hits.map((h) => (
                  <button
                    key={`${h.verse_ref_id}-${h.translation}`}
                    className="flex flex-col gap-0.5 w-full p-2 mb-0.5 border-0 border-l-2 border-l-transparent rounded-(--radius-sm) bg-transparent text-left hover:bg-accent-tint hover:border-l-accent"
                    onClick={() => goto(h)}
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
            <Group label="Notes" count={0}>
              <p className="panel__muted">Note search coming soon.</p>
            </Group>
          </>
        )}
        {!error && !loading && !ran && (
          <p className="panel__muted">
            Type a query to search verses and notes.
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
