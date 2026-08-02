// Obsidian-compatible [[wikilink]] support: an inline atom node linking one
// note to another. The link's *target* is always the note's stable id (which
// is also its real on-disk filename, `{id}.md` — see notes.rs) so the link
// survives title renames in both this app and Obsidian, whose own resolver
// follows the id/filename and shows the piped text as an alias. A bare
// `[[Title]]` (hand-typed, or authored directly in Obsidian) is still
// recognized on load by looking up the title, and gets upgraded to the
// canonical `[[id|title]]` form the next time the note round-trips through
// renderMarkdown.
import { Node, mergeAttributes } from "@tiptap/core";
import type { DOMOutputSpec, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Suggestion, type SuggestionOptions } from "@tiptap/suggestion";
import type { Note } from "./notes";

// Set on a transaction to force the color-decoration plugin below to
// recompute even when the doc itself hasn't changed — see NotesEditor.tsx's
// notes-sync effect, which dispatches this whenever the shared notes list
// changes, so a target note's color edit shows up live in every open editor.
export const WIKILINK_COLOR_REFRESH = "wikiLinkColorRefresh";

// Shared across every open NotesEditor instance — all of them want the same
// app-wide notes list (see NotesEditor's effect that keeps this current), so
// one module-level ref is simpler and just as correct as threading a fresh
// one through Tiptap's extension options, which parseMarkdown/renderMarkdown
// can't reach via `this` anyway (the markdown package calls handler methods
// unbound — see IndentedHeading etc. above, which take the same approach of
// not touching `this`).
let currentNotes: Note[] = [];
export function setWikiLinkNotes(notes: Note[]) {
  currentNotes = notes;
}
function getWikiLinkNotes(): Note[] {
  return currentNotes;
}

const WIKILINK_RE = /^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/;

// A miniature of icons.tsx's NotesIcon — just the page outline + folded
// corner (its 3 inner "text line" paths would be visual mud at this size).
// `stroke: currentColor` so it always matches the pill's current text color
// (set via the --wikilink-color decoration below) with no extra wiring.
// Tag names MUST be namespaced as "<namespace-uri> <tagname>" (a space, not
// a colon) — ProseMirror's DOMOutputSpec `renderSpec` only recognizes a
// namespace when it finds a space in the tag string (splits on
// `tagName.indexOf(" ")`); a bare "svg" (or "svg:svg") falls through to
// plain `document.createElement`, producing an inert HTMLUnknownElement that
// renders nothing (this is why the icon was invisible: it existed in the
// DOM, just not as real SVG).
const SVG_NS = "http://www.w3.org/2000/svg";
const NOTE_ICON: DOMOutputSpec = [
  `${SVG_NS} svg`,
  {
    class: "wikilink__icon",
    width: "12",
    height: "12",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2.25",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
  },
  [
    `${SVG_NS} path`,
    { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" },
  ],
  [`${SVG_NS} path`, { d: "M14 2v6h6" }],
];

// The linked-to note's own assigned color (not the workspace default
// highlight color — "assigned" means exactly `Note.color`, unset falls back
// to the accent tint, same as an unresolved/broken link).
function wikiLinkColor(id: string | null): string {
  if (!id) return "var(--accent)";
  const note = getWikiLinkNotes().find((n) => n.id === id);
  return note?.color ?? "var(--accent)";
}

function buildWikiLinkDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "wikiLink") return;
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        style: `--wikilink-color: ${wikiLinkColor(node.attrs.id)}`,
      }),
    );
  });
  return DecorationSet.create(doc, decorations);
}

// Stamps each wikiLink node's rendered element with the linked note's
// current color as a custom property, recomputed on every doc change and
// whenever WIKILINK_COLOR_REFRESH is dispatched — renderHTML alone only runs
// once per node render, so it can't react to a *different* note's color
// changing while this editor sits idle with no transactions of its own.
const wikiLinkColorPlugin = new Plugin({
  key: new PluginKey("wikiLinkColor"),
  state: {
    init: (_, { doc }) => buildWikiLinkDecorations(doc),
    apply(tr, old) {
      if (tr.docChanged || tr.getMeta(WIKILINK_COLOR_REFRESH)) {
        return buildWikiLinkDecorations(tr.doc);
      }
      return old.map(tr.mapping, tr.doc);
    },
  },
  props: {
    decorations(state) {
      return this.getState(state);
    },
  },
});

export const WikiLink = Node.create({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      // Both attrs render fully through this node's own renderHTML below
      // (not the default per-attribute `{ [name]: value }` output), so their
      // own renderHTML is a no-op — otherwise Tiptap would additionally stamp
      // a raw `id="..."` (colliding across pills to the same note) and a
      // meaningless `label="..."` HTML attribute alongside it.
      id: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-note-id") || null,
        renderHTML: () => ({}),
      },
      label: {
        default: "",
        parseHTML: (el: HTMLElement) => el.textContent ?? "",
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "a.wikilink" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const id = node.attrs.id as string | null;
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        class: "wikilink" + (id ? "" : " wikilink--broken"),
        "data-note-id": id ?? "",
      }),
      NOTE_ICON,
      node.attrs.label as string,
    ];
  },

  markdownTokenizer: {
    name: "wikiLink",
    level: "inline",
    start: (src: string) => src.indexOf("[["),
    tokenize(src: string) {
      const match = WIKILINK_RE.exec(src);
      if (!match) return undefined;
      return {
        type: "wikiLink",
        raw: match[0],
        target: match[1].trim(),
        alias: match[2]?.trim(),
      };
    },
  },

  parseMarkdown: (token, h) => {
    const raw = token.target as string;
    const alias = token.alias as string | undefined;
    const notes = getWikiLinkNotes();
    const byId = notes.find((n) => n.id === raw);
    if (byId) {
      return h.createNode(
        "wikiLink",
        { id: byId.id, label: alias ?? byId.title },
        [],
      );
    }
    const byTitle = notes.find(
      (n) => n.title.trim().toLowerCase() === raw.toLowerCase(),
    );
    if (byTitle) {
      return h.createNode(
        "wikiLink",
        { id: byTitle.id, label: alias ?? raw },
        [],
      );
    }
    return h.createNode("wikiLink", { id: null, label: alias ?? raw }, []);
  },

  renderMarkdown: (node) => {
    const id = node.attrs?.id as string | null | undefined;
    const label = (node.attrs?.label as string | undefined) ?? "";
    return id ? `[[${id}|${label}]]` : `[[${label}]]`;
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: "[[",
        allowSpaces: true,
        ...wikiLinkSuggestion(),
      }),
      wikiLinkColorPlugin,
    ];
  },
});

// `[[`-triggered autocomplete: a small vanilla-DOM dropdown (Tailwind classes
// as plain strings work the same outside JSX) listing note titles, matching
// AnchorComposer's dropdown look (NotesAnchorBar.tsx) since it's the
// established suggestion-list style in this codebase.
export function wikiLinkSuggestion(): Partial<SuggestionOptions<Note, Note>> {
  let items: Note[] = [];
  let selected = 0;
  let listEl: HTMLUListElement | null = null;
  let unmount: (() => void) | null = null;
  let runCommand: ((note: Note) => void) | null = null;

  function paint() {
    if (!listEl) return;
    listEl.innerHTML = "";
    if (items.length === 0) {
      const li = document.createElement("li");
      li.className = "px-2 py-1.5 text-(length:--text-xs) text-muted";
      li.textContent = "No matching notes";
      listEl.appendChild(li);
      return;
    }
    items.forEach((note, i) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = note.title.trim() || "Untitled";
      btn.className =
        "block w-full px-2 py-1.5 rounded-(--radius-sm) text-left font-(family-name:--font-sans) text-(length:--text-xs) text-ink hover:bg-accent-tint" +
        (i === selected ? " bg-accent-tint" : "");
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("mouseenter", () => {
        selected = i;
        paint();
      });
      btn.addEventListener("click", () => runCommand?.(note));
      li.appendChild(btn);
      listEl!.appendChild(li);
    });
  }

  return {
    items: ({ query }) => {
      const q = query.trim().toLowerCase();
      const notes = getWikiLinkNotes();
      return (
        q ? notes.filter((n) => n.title.toLowerCase().includes(q)) : notes
      ).slice(0, 8);
    },
    command: ({ editor, range, props }) => {
      editor
        .chain()
        .focus()
        .insertContentAt(range, {
          type: "wikiLink",
          attrs: { id: props.id, label: props.title },
        })
        .run();
    },
    render: () => ({
      onStart: (props) => {
        items = props.items;
        selected = 0;
        runCommand = props.command;
        listEl = document.createElement("ul");
        listEl.className =
          "max-h-[220px] w-60 overflow-auto p-1 bg-panel border border-border-strong rounded-(--radius-md) shadow-(--shadow-2)";
        paint();
        unmount = props.mount(listEl);
      },
      onUpdate: (props) => {
        items = props.items;
        selected = 0;
        runCommand = props.command;
        paint();
      },
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowDown") {
          selected = Math.min(selected + 1, items.length - 1);
          paint();
          return true;
        }
        if (event.key === "ArrowUp") {
          selected = Math.max(selected - 1, 0);
          paint();
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          if (items[selected]) runCommand?.(items[selected]);
          return true;
        }
        return false;
      },
      onExit: () => {
        unmount?.();
        unmount = null;
        listEl = null;
        runCommand = null;
      },
    }),
  };
}
