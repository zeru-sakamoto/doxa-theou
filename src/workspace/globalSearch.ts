// Hand-off for the header's global search into the Search panel. The panel is
// lazy-loaded, so `openSingleton("search")` + a fire-and-forget `doxa:search`
// event races the panel's first chunk-load/mount and the query can be dropped.
// The query is also stashed here and drained by the panel on mount — whichever
// path wins, the search runs. (Belt and suspenders for the first open; the
// event alone still handles searches while the panel is already open.)
let pending: string | null = null;

export const setPendingSearch = (q: string) => {
  pending = q;
};

export const takePendingSearch = (): string | null => {
  const q = pending;
  pending = null;
  return q;
};
