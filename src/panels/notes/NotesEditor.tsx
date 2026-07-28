// Live, type-to-transform rich-text editor for a note's Markdown body.
// Remounted (via `key={note.id}` at the call site) whenever the selected
// note changes — a fresh Editor per note avoids fighting Tiptap's own
// internal state with a manual content-sync effect.
import { useEditor, EditorContent } from "@tiptap/react";
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
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Subscript,
      Superscript,
      Placeholder.configure({ placeholder: "Write freely…" }),
      Markdown,
    ],
    content: note.body,
    contentType: "markdown",
    // Round-trip back to Markdown on edit; NotesProvider debounces the save.
    onUpdate: ({ editor }) => onBodyChange(editor.getMarkdown()),
  });

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <NotesEditorToolbar
        editor={editor}
        highlightColor={ws.notesHighlightColor}
      />
      <div className="flex flex-col gap-3 flex-1 overflow-auto pt-3 pb-3">
        <NotesAnchorBar
          anchors={note.anchors}
          onRemove={onRemoveAnchor}
          draft={anchorDraft}
          onConfirm={onConfirmAnchor}
          onCancel={onCancelAnchor}
        />
        <input
          className="notes-title mx-3 bg-transparent border-0 text-ink placeholder:text-muted placeholder:font-normal"
          value={note.title}
          placeholder="Title"
          onChange={(e) => onTitleChange(e.target.value)}
        />
        <EditorContent editor={editor} className="tiptap px-3" />
      </div>
    </div>
  );
}
