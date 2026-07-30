// Live, type-to-transform rich-text editor for a note's Markdown body.
// Remounted (via `key={note.id}` at the call site) whenever the selected
// note changes — a fresh Editor per note avoids fighting Tiptap's own
// internal state with a manual content-sync effect.
import type { CSSProperties } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { Code } from "@tiptap/extension-code";
import { Highlight } from "@tiptap/extension-highlight";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { Markdown } from "@tiptap/markdown";
import { useWorkspace } from "../../state/workspace";
import { NotesAnchorBar } from "./NotesAnchorBar";
import { NotesEditorToolbar } from "./NotesEditorToolbar";
import type { Note } from "./notes";

// 4 non-breaking spaces, not 4 regular spaces/a tab: Markdown treats a
// leading tab or 4 real spaces on a fresh line as an indented code block, so
// a raw tab would silently reflow the paragraph into a code block on the
// next load. NBSP is invisible to that rule and round-trips as plain text.
const BLOCK_INDENT = "    ";

// Runs after every other extension (see placement below), so ListItem's/
// TaskItem's own Tab-to-sink/Shift-Tab-to-lift get first refusal; this only
// fires when those decline (falls through to the next keymap plugin: not in
// a list, or the first item in one).
const TabIndent = Extension.create({
  name: "tabIndent",
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) =>
        editor.commands.insertContent(
          editor.isActive("codeBlock") ? "\t" : BLOCK_INDENT,
        ),
      "Shift-Tab": ({ editor }) => {
        const { $from } = editor.state.selection;
        const before = editor.state.doc.textBetween($from.start(), $from.pos);
        if (editor.isActive("codeBlock") && before.endsWith("\t")) {
          return editor.commands.deleteRange({
            from: $from.pos - 1,
            to: $from.pos,
          });
        }
        if (before.endsWith(BLOCK_INDENT)) {
          return editor.commands.deleteRange({
            from: $from.pos - BLOCK_INDENT.length,
            to: $from.pos,
          });
        }
        return false;
      },
    };
  },
});

interface Props {
  note: Note;
  onRemoveAnchor: (anchor: string) => void;
  anchorDraft: string | null;
  onConfirmAnchor: (value: string) => void;
  onCancelAnchor: () => void;
  onTitleChange: (title: string) => void;
  onBodyChange: (body: string) => void;
}

export function NotesEditor({
  note,
  onRemoveAnchor,
  anchorDraft,
  onConfirmAnchor,
  onCancelAnchor,
  onTitleChange,
  onBodyChange,
}: Props) {
  const ws = useWorkspace();
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
    },
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] }, code: false }),
      // Tiptap's stock Code mark excludes every other mark (`excludes: "_"`),
      // which blocks bold inside inline code — allow them to combine.
      Code.extend({ excludes: "" }),
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
    ],
    content: note.body,
    contentType: "markdown",
    // Round-trip back to Markdown on edit; NotesProvider debounces the save.
    onUpdate: ({ editor }) => onBodyChange(editor.getMarkdown()),
  });

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <NotesEditorToolbar editor={editor} />
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
