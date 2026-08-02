// Formatting toolbar for NotesEditor. Pure view over a Tiptap Editor instance
// — every button just calls a chained command and reflects `editor.isActive`.
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { Menu, type MenuAction } from "../../workspace/Menu";
import { NoteLinkMenu } from "./NoteLinkMenu";
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  HighlighterIcon,
  StrikeIcon,
  CodeIcon,
  CodeBlockIcon,
  LinkIcon,
  HorizontalRuleIcon,
  TaskListIcon,
  SubscriptIcon,
  SuperscriptIcon,
  BulletListIcon,
  OrderedListIcon,
  BlockquoteIcon,
  ChevronDownIcon,
  ICON,
} from "../../workspace/icons";

const HEADING_LABEL: Record<number, string> = {
  0: "¶",
  1: "H1",
  2: "H2",
  3: "H3",
  4: "H4",
};

export function NotesEditorToolbar({
  editor,
  noteId,
}: {
  editor: Editor | null;
  noteId: string;
}) {
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      underline: editor?.isActive("underline") ?? false,
      highlight: editor?.isActive("highlight") ?? false,
      strike: editor?.isActive("strike") ?? false,
      code: editor?.isActive("code") ?? false,
      codeBlock: editor?.isActive("codeBlock") ?? false,
      link: editor?.isActive("link") ?? false,
      subscript: editor?.isActive("subscript") ?? false,
      superscript: editor?.isActive("superscript") ?? false,
      bulletList: editor?.isActive("bulletList") ?? false,
      orderedList: editor?.isActive("orderedList") ?? false,
      taskList: editor?.isActive("taskList") ?? false,
      blockquote: editor?.isActive("blockquote") ?? false,
      headingLevel:
        [1, 2, 3, 4].find((l) => editor?.isActive("heading", { level: l })) ??
        0,
    }),
  });

  if (!editor || !state) return null;

  function toggleLink() {
    if (state!.link) {
      editor!.chain().focus().unsetLink().run();
      return;
    }
    setLinkDraft(editor!.getAttributes("link").href ?? "");
  }

  function confirmLink() {
    if (linkDraft)
      editor!
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: linkDraft })
        .run();
    setLinkDraft(null);
  }

  function onLinkKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") confirmLink();
    if (e.key === "Escape") setLinkDraft(null);
  }

  const headingItems: MenuAction[] = [
    {
      label: "Paragraph",
      onSelect: () => editor.chain().focus().setParagraph().run(),
    },
    {
      label: "Heading 1",
      onSelect: () => editor.chain().focus().setHeading({ level: 1 }).run(),
    },
    {
      label: "Heading 2",
      onSelect: () => editor.chain().focus().setHeading({ level: 2 }).run(),
    },
    {
      label: "Heading 3",
      onSelect: () => editor.chain().focus().setHeading({ level: 3 }).run(),
    },
    {
      label: "Heading 4",
      onSelect: () => editor.chain().focus().setHeading({ level: 4 }).run(),
    },
  ];

  const btn = (
    active: boolean,
    title: string,
    onClick: () => void,
    icon: ReactNode,
  ) => (
    <button
      type="button"
      className={"iconbtn shrink-0" + (active ? " is-active" : "")}
      title={title}
      aria-pressed={active}
      onClick={onClick}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 mx-2 mt-4 px-2 py-1.5 rounded-(--radius-md) border border-border-strong bg-panel shadow-(--shadow-2) shrink-0 grow-0">
      <div className="h-[26px] shrink-0">
        <Menu
          triggerClassName="inline-flex items-center gap-1 h-[26px] px-1.5 rounded-(--radius-sm) bg-transparent text-muted text-(length:--text-xs) font-(family-name:--font-mono) hover:bg-accent-tint hover:text-ink shrink-0"
          title="Block type"
          items={headingItems}
        >
          {HEADING_LABEL[state.headingLevel]}
          <ChevronDownIcon size={ICON.sm} />
        </Menu>
      </div>

      <div className="flex items-center gap-x-0.5 shrink-0">
        <div className="w-px h-4 bg-border shrink-0" />
        {btn(
          state.bold,
          "Bold (Mod-B)",
          () => editor.chain().focus().toggleBold().run(),
          <BoldIcon size={ICON.md} />,
        )}
        {btn(
          state.italic,
          "Italic (Mod-I)",
          () => editor.chain().focus().toggleItalic().run(),
          <ItalicIcon size={ICON.md} />,
        )}
        {btn(
          state.underline,
          "Underline (Mod-U)",
          () => editor.chain().focus().toggleUnderline().run(),
          <UnderlineIcon size={ICON.md} />,
        )}
        {btn(
          state.link,
          "Link (Mod-K)",
          toggleLink,
          <LinkIcon size={ICON.md} />,
        )}
      </div>

      <div className="flex items-center gap-x-0.5 shrink-0">
        <div className="w-px h-4 bg-border shrink-0" />
        {btn(
          state.highlight,
          "Highlight (Mod-Shift-H)",
          // Plain toggle: the Highlight mark carries no color attribute (see
          // NotesEditor.tsx) — its background comes from --editor-highlight-bg,
          // set to the note's current color on the editor container — so
          // there's no per-mark attrs to mismatch on unset.
          () => editor.chain().focus().toggleHighlight().run(),
          <HighlighterIcon size={ICON.md} />,
        )}
        {btn(
          state.strike,
          "Strikethrough (Mod-Shift-S)",
          () => editor.chain().focus().toggleStrike().run(),
          <StrikeIcon size={ICON.md} />,
        )}
        {btn(
          state.bulletList,
          "Bullet list (Mod-Shift-8)",
          () => editor.chain().focus().toggleBulletList().run(),
          <BulletListIcon size={ICON.md} />,
        )}
        {btn(
          state.orderedList,
          "Numbered list (Mod-Shift-7)",
          () => editor.chain().focus().toggleOrderedList().run(),
          <OrderedListIcon size={ICON.md} />,
        )}
        {btn(
          state.blockquote,
          "Quote (Mod-Shift-B)",
          () => editor.chain().focus().toggleBlockquote().run(),
          <BlockquoteIcon size={ICON.md} />,
        )}
      </div>

      <div className="flex items-center gap-x-0.5 shrink-0">
        <div className="w-px h-4 bg-border shrink-0" />
        {btn(
          state.subscript,
          "Subscript (Mod-,)",
          () => editor.chain().focus().toggleSubscript().run(),
          <SubscriptIcon size={ICON.md} />,
        )}
        {btn(
          state.superscript,
          "Superscript (Mod-.)",
          () => editor.chain().focus().toggleSuperscript().run(),
          <SuperscriptIcon size={ICON.md} />,
        )}
        {btn(
          state.taskList,
          "Task list (Mod-Shift-9)",
          () => editor.chain().focus().toggleTaskList().run(),
          <TaskListIcon size={ICON.md} />,
        )}
        {btn(
          state.code,
          "Inline code (Mod-E)",
          () => editor.chain().focus().toggleCode().run(),
          <CodeIcon size={ICON.md} />,
        )}
        {btn(
          state.codeBlock,
          "Code block (Mod-Alt-C)",
          () => editor.chain().focus().toggleCodeBlock().run(),
          <CodeBlockIcon size={ICON.md} />,
        )}
        {btn(
          false,
          "Horizontal rule",
          () => editor.chain().focus().setHorizontalRule().run(),
          <HorizontalRuleIcon size={ICON.md} />,
        )}
      </div>

      <div className="flex items-center gap-x-0.5 shrink-0">
        <div className="w-px h-4 bg-border shrink-0" />
        <NoteLinkMenu editor={editor} noteId={noteId} />
      </div>

      {linkDraft !== null && (
        <input
          autoFocus
          value={linkDraft}
          onChange={(e) => setLinkDraft(e.target.value)}
          onKeyDown={onLinkKeyDown}
          onBlur={confirmLink}
          placeholder="https://…"
          className="flex-1 min-w-0 h-[26px] px-2 rounded-(--radius-sm) border border-accent bg-bg text-ink font-(family-name:--font-mono) text-(length:--text-xs) focus-visible:outline-none"
        />
      )}
    </div>
  );
}
