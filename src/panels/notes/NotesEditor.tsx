// Live, type-to-transform rich-text editor for a note's Markdown body.
// Remounted (via `key={note.id}` at the call site) whenever the selected
// note changes — a fresh Editor per note avoids fighting Tiptap's own
// internal state with a manual content-sync effect.
import { useEffect, type CSSProperties } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { Blockquote } from "@tiptap/extension-blockquote";
import { Code } from "@tiptap/extension-code";
import { Heading } from "@tiptap/extension-heading";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Highlight } from "@tiptap/extension-highlight";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { Markdown } from "@tiptap/markdown";
import { useWorkspace } from "../../state/workspace";
import { useNotes } from "../../state/notes";
import { useDock } from "../../workspace/dock";
import { NotesAnchorBar } from "./NotesAnchorBar";
import { NotesEditorToolbar } from "./NotesEditorToolbar";
import { WikiLink, setWikiLinkNotes, WIKILINK_COLOR_REFRESH } from "./WikiLink";
import type { Note } from "./notes";

// 4 non-breaking spaces, not 4 regular spaces/a tab: Markdown treats a
// leading tab or 4 real spaces on a fresh line as an indented code block, so
// a raw tab would silently reflow the paragraph into a code block on the
// next load. NBSP is invisible to that rule and round-trips as plain text.
// It's how each indent level is *persisted* (prepended to the block's own
// markdown text, stripped back out on parse) — the visible editing indent
// itself is a CSS margin (see `indentAttribute` below), not these spaces.
const INDENT_MAX = 8;
const BLOCK_INDENT = "    ";

function indentAttribute() {
  return {
    indent: {
      default: 0,
      parseHTML: (el: HTMLElement) => {
        const px = parseFloat(el.style.marginLeft || "0");
        return px ? Math.round(px / 32) : 0;
      },
      renderHTML: (attrs: { indent?: number }) =>
        attrs.indent
          ? { style: `margin-left: calc(var(--sp-6) * ${attrs.indent})` }
          : {},
    },
  };
}

// Strips a leading run of BLOCK_INDENT units off the first text node of
// parsed markdown content, converting it back into an indent level. Mirrors
// what the paired renderMarkdown below writes out.
function splitIndentPrefix(content: JSONContent[]) {
  const first = content[0];
  if (!first || first.type !== "text" || !first.text) {
    return { indent: 0, content };
  }
  let indent = 0;
  let text = first.text;
  while (indent < INDENT_MAX && text.startsWith(BLOCK_INDENT)) {
    indent += 1;
    text = text.slice(BLOCK_INDENT.length);
  }
  if (indent === 0) return { indent: 0, content };
  const rest = text
    ? [{ ...first, text }, ...content.slice(1)]
    : content.slice(1);
  return { indent, content: rest };
}

// Heading/Paragraph, extended with an `indent` attribute so Tab/Shift-Tab
// (via TabIndent below) can shift a whole block right with a CSS margin
// instead of inserting characters at the cursor — the old approach only
// nudged the first wrapped display line, since text characters don't affect
// later soft-wrapped lines the way a block-level margin does.
const IndentedHeading = Heading.extend({
  addAttributes() {
    return { ...this.parent?.(), ...indentAttribute() };
  },
  parseMarkdown: (token, helpers) => {
    const { indent, content } = splitIndentPrefix(
      helpers.parseInline(token.tokens || []),
    );
    return helpers.createNode(
      "heading",
      { level: token.depth || 1, indent },
      content,
    );
  },
  renderMarkdown: (node, h) => {
    if (!node.content) return "";
    const level = node.attrs?.level ? parseInt(node.attrs.level, 10) : 1;
    const indent = node.attrs?.indent ?? 0;
    return `${"#".repeat(level)} ${BLOCK_INDENT.repeat(indent)}${h.renderChildren(node.content)}`;
  },
});

const IndentedParagraph = Paragraph.extend({
  addAttributes() {
    return indentAttribute();
  },
  parseMarkdown: (token, helpers) => {
    const tokens = token.tokens || [];
    if (tokens.length === 1 && tokens[0].type === "image") {
      return helpers.parseChildren([tokens[0]]);
    }
    const parsed = helpers.parseInline(tokens);
    // An explicit blank-line marker (the NBSP the render side below emits
    // for an otherwise-empty paragraph) — preserve as an empty paragraph
    // rather than reading it as indent or literal content.
    const isBlankLineMarker =
      tokens.length === 1 &&
      tokens[0].type === "text" &&
      parsed.length === 1 &&
      parsed[0].type === "text" &&
      (parsed[0].text === "&nbsp;" || parsed[0].text === " ");
    if (isBlankLineMarker) {
      return helpers.createNode("paragraph", undefined, []);
    }
    const { indent, content } = splitIndentPrefix(parsed);
    return helpers.createNode(
      "paragraph",
      indent ? { indent } : undefined,
      content,
    );
  },
  renderMarkdown: (node, h, ctx) => {
    const content = Array.isArray(node.content) ? node.content : [];
    if (content.length === 0) {
      const previousContent = Array.isArray(ctx?.previousNode?.content)
        ? ctx.previousNode.content
        : [];
      const previousIsEmptyParagraph =
        ctx?.previousNode?.type === "paragraph" && previousContent.length === 0;
      return previousIsEmptyParagraph ? "&nbsp;" : "";
    }
    const indent = node.attrs?.indent ?? 0;
    return `${BLOCK_INDENT.repeat(indent)}${h.renderChildren(content)}`;
  },
});

// Blockquote's border is on the <blockquote> wrapper, not its inner
// paragraph, so indenting the paragraph alone (a CSS margin on the <p>)
// leaves the border behind — the quote's "start" needs to move as a whole.
// Indent state for content inside a quote therefore lives on the blockquote
// node itself; its child paragraph's own `indent` attribute is always kept
// at 0 there (see `blocksInSelection` below, which redirects Tab/Shift-Tab
// to the blockquote's position instead of the paragraph's).
const IndentedBlockquote = Blockquote.extend({
  addAttributes() {
    return { ...this.parent?.(), ...indentAttribute() };
  },
  // The child paragraph's own parseMarkdown (IndentedParagraph, above) has
  // already stripped any leading BLOCK_INDENT run off the raw text and
  // turned it into that paragraph's `indent` attribute — reclaim it here as
  // the blockquote's indent instead, so the border moves with the text.
  parseMarkdown: (token, helpers) => {
    const parseBlockChildren =
      helpers.parseBlockChildren ?? helpers.parseChildren;
    const children = parseBlockChildren(token.tokens || []);
    const first = children[0];
    const indent =
      typeof first?.attrs?.indent === "number" ? first.attrs.indent : 0;
    if (!indent) {
      return helpers.createNode("blockquote", undefined, children);
    }
    const rest = children.slice(1);
    return helpers.createNode("blockquote", { indent }, [
      { ...first, attrs: { ...first.attrs, indent: 0 } },
      ...rest,
    ]);
  },
  // Mirrors Blockquote's stock renderMarkdown (each child's rendered lines
  // get a "> " prefix), but injects the indent as a BLOCK_INDENT run right
  // after the very first "> " — the persisted encoding IndentedParagraph
  // already uses, read back by this node's parseMarkdown above.
  renderMarkdown: (node, h) => {
    if (!node.content) return "";
    const indent = node.attrs?.indent ?? 0;
    const prefix = ">";
    const result: string[] = [];
    node.content.forEach((child, index) => {
      const childContent = h.renderChild
        ? h.renderChild(child, index)
        : h.renderChildren([child]);
      const lines = childContent.split("\n");
      const linesWithPrefix = lines.map((line, i) => {
        const body =
          index === 0 && i === 0
            ? `${BLOCK_INDENT.repeat(indent)}${line}`
            : line;
        return body.trim() === "" ? prefix : `${prefix} ${body}`;
      });
      result.push(linesWithPrefix.join("\n"));
    });
    return result.join(`\n${prefix}\n`);
  },
});

// Every heading/paragraph textblock touched by the selection, redirected to
// the enclosing blockquote's own position when the block is a quote's
// content (see IndentedBlockquote above for why). Blocks inside a list/task
// item are skipped: ListItem's/TaskItem's own sink/lift keymaps run first
// and already own indentation there.
function blocksInSelection(editor: ReturnType<typeof useEditor>) {
  if (!editor) return [];
  const { doc, selection } = editor.state;
  const seen = new Set<number>();
  const positions: number[] = [];
  doc.nodesBetween(selection.from, selection.to, (node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type.name !== "heading" && node.type.name !== "paragraph") {
      return false;
    }
    const $pos = doc.resolve(pos);
    const parent = $pos.parent;
    if (parent.type.name === "listItem" || parent.type.name === "taskItem") {
      return false;
    }
    const target =
      parent.type.name === "blockquote" ? $pos.before($pos.depth) : pos;
    if (!seen.has(target)) {
      seen.add(target);
      positions.push(target);
    }
    return false;
  });
  return positions;
}

// Runs after every other extension (see placement below), so ListItem's/
// TaskItem's own Tab-to-sink/Shift-Tab-to-lift get first refusal; this only
// fires when those decline (falls through to the next keymap plugin: not in
// a list, or the first item in one).
const TabIndent = Extension.create({
  name: "tabIndent",
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        if (editor.isActive("codeBlock")) {
          return editor.commands.insertContent("\t");
        }
        const blocks = blocksInSelection(editor);
        if (blocks.length === 0) return false;
        const tr = editor.state.tr;
        for (const pos of blocks) {
          const node = tr.doc.nodeAt(pos);
          const current = node?.attrs.indent ?? 0;
          tr.setNodeAttribute(pos, "indent", Math.min(INDENT_MAX, current + 1));
        }
        editor.view.dispatch(tr);
        return true;
      },
      "Shift-Tab": ({ editor }) => {
        if (editor.isActive("codeBlock")) {
          const { $from } = editor.state.selection;
          const before = editor.state.doc.textBetween($from.start(), $from.pos);
          if (before.endsWith("\t")) {
            return editor.commands.deleteRange({
              from: $from.pos - 1,
              to: $from.pos,
            });
          }
          return false;
        }
        const blocks = blocksInSelection(editor);
        const tr = editor.state.tr;
        let changed = false;
        for (const pos of blocks) {
          const node = tr.doc.nodeAt(pos);
          const current = node?.attrs.indent ?? 0;
          if (current > 0) {
            tr.setNodeAttribute(pos, "indent", current - 1);
            changed = true;
          }
        }
        if (!changed) return false;
        editor.view.dispatch(tr);
        return true;
      },
    };
  },
});

interface Props {
  // This editor's own dockview panel id — passed to dock.openNotes so a
  // wikilink click tabs the target note into *this* panel specifically,
  // instead of falling back to the global "Open notes on" side preference.
  panelId: string;
  note: Note;
  onRemoveAnchor: (anchor: string) => void;
  anchorDraft: string | null;
  onConfirmAnchor: (value: string) => void;
  onCancelAnchor: () => void;
  onTitleChange: (title: string) => void;
  onBodyChange: (body: string) => void;
}

export function NotesEditor({
  panelId,
  note,
  onRemoveAnchor,
  anchorDraft,
  onConfirmAnchor,
  onCancelAnchor,
  onTitleChange,
  onBodyChange,
}: Props) {
  const ws = useWorkspace();
  const { notes } = useNotes();
  const dock = useDock();
  // A note's own color (set via NotesColorMenu) takes priority over the
  // global default; the toolbar's highlight button and the anchor rows
  // below both use this, so a note's coloring is consistent throughout.
  const highlightColor = note.color ?? ws.notesHighlightColor;

  const editor = useEditor({
    editorProps: {
      // Plain-text clipboard content (e.g. the Reader's "Copy"/"Copy
      // Blockquote") is markdown, not literal text — parse it instead of
      // inserting it raw. Clipboard payloads that also carry HTML (copied
      // from a webpage, another rich editor, etc.) keep ProseMirror's normal
      // HTML-paste handling.
      handlePaste(_view, event) {
        const html = event.clipboardData?.getData("text/html");
        const text = event.clipboardData?.getData("text/plain");
        if (html || !text?.trim()) return false;
        editor?.commands.insertContent(text, { contentType: "markdown" });
        return true;
      },
      // Click-to-navigate for wikilink pills; Ctrl/Cmd-click opens the
      // target note inactive, matching the same modifier convention as the
      // notes list's own ctrl-click-to-open-in-background (NotesPanel.tsx).
      handleClickOn(_view, _pos, node, _nodePos, event) {
        if (node.type.name !== "wikiLink" || !node.attrs.id) return false;
        event.preventDefault();
        dock.openNotes(node.attrs.id, {
          inactive: event.ctrlKey || event.metaKey,
          referencePanelId: panelId,
        });
        return true;
      },
    },
    extensions: [
      StarterKit.configure({
        heading: false,
        paragraph: false,
        code: false,
        blockquote: false,
      }),
      // Tiptap's stock Code mark excludes every other mark (`excludes: "_"`),
      // which blocks bold inside inline code — allow them to combine.
      Code.extend({ excludes: "" }),
      IndentedHeading.configure({ levels: [1, 2, 3, 4] }),
      IndentedParagraph,
      IndentedBlockquote,
      // Not multicolor: a highlight mark that bakes in a specific color at
      // click-time can't react when the note's color changes afterward. All
      // highlights instead render through the plain `<mark>` fallback
      // (notes-editor.css), whose background reads --editor-highlight-bg —
      // set below as a local override to the current note color, so every
      // highlight in the note (old or new) always shows the note's *current*
      // color, live.
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      Subscript,
      Superscript,
      Placeholder.configure({ placeholder: "Write freely…" }),
      Markdown,
      TabIndent,
      WikiLink,
    ],
    content: note.body,
    contentType: "markdown",
    // Round-trip back to Markdown on edit; NotesProvider debounces the save.
    onUpdate: ({ editor }) => onBodyChange(editor.getMarkdown()),
  });

  // WikiLink's parseMarkdown/renderMarkdown run outside Tiptap's own `this`
  // binding (see WikiLink.ts), so they read the live notes list off a shared
  // module ref instead — kept current here on every list change. Also nudge
  // this editor's own color-decoration plugin so a wikilink's pill recolors
  // immediately if its target note's color was just changed elsewhere (a
  // different open Notes tab), not only on this note's own next edit.
  useEffect(() => {
    setWikiLinkNotes(notes);
    if (!editor) return;
    editor.view.dispatch(editor.state.tr.setMeta(WIKILINK_COLOR_REFRESH, true));
  }, [notes, editor]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <NotesEditorToolbar editor={editor} noteId={note.id} />
      <div className="flex-1 overflow-auto pt-3 pb-3">
        {/* Capped and centered so a fully-open (unsplit) Notes panel doesn't
            stretch the note's text edge-to-edge — user-adjustable (Settings →
            Notes → Reading width, 60-120ch), wider by default than
            ChapterView's fixed 70ch since notes are denser/less pure-prose
            than Reader text and the editor toolbar benefits from more room. */}
        <div
          className="flex flex-col gap-3 w-full mx-auto"
          style={{ maxWidth: `${ws.notesReadingWidth}ch` }}
        >
          <NotesAnchorBar
            anchors={note.anchors}
            onRemove={onRemoveAnchor}
            draft={anchorDraft}
            onConfirm={onConfirmAnchor}
            onCancel={onCancelAnchor}
            color={highlightColor}
          />
          <input
            className="notes-title mx-3 bg-transparent border-0 text-ink placeholder:text-muted placeholder:font-normal"
            value={note.title}
            placeholder="Title"
            onChange={(e) => onTitleChange(e.target.value)}
          />
          <EditorContent
            editor={editor}
            className="tiptap px-3"
            style={{ "--editor-highlight-bg": highlightColor } as CSSProperties}
          />
        </div>
      </div>
    </div>
  );
}
