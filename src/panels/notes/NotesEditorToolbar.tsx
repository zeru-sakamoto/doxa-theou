// Formatting toolbar for NotesEditor. Pure view over a Tiptap Editor instance
// — every button just calls a chained command and reflects `editor.isActive`.
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { Menu, type MenuAction } from "../../workspace/Menu";
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
} from "../../workspace/icons";

const HEADING_LABEL: Record<number, string> = {
  0: "¶",
  1: "H1",
  2: "H2",
  3: "H3",
};

export function NotesEditorToolbar({
  editor,
  highlightColor,
}: {
  editor: Editor | null;
  highlightColor: string;
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
        [1, 2, 3].find((l) => editor?.isActive("heading", { level: l })) ?? 0,
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
  ];

  const btn = (
    active: boolean,
    title: string,
    onClick: () => void,
    icon: ReactNode,
  ) => (
    <button
      type="button"
      className={"iconbtn" + (active ? " is-active" : "")}
      title={title}
      aria-pressed={active}
      onClick={onClick}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-h-[30px] mt-1 px-2 py-1 border-b border-border bg-panel shrink-0 grow-0">
      <Menu
        triggerClassName="inline-flex items-center gap-1 h-[26px] px-1.5 rounded-(--radius-sm) bg-transparent text-muted text-(length:--text-xs) font-(family-name:--font-mono) hover:bg-accent-tint hover:text-ink"
        title="Block type"
        items={headingItems}
      >
        {HEADING_LABEL[state.headingLevel]}
        <ChevronDownIcon size={14} />
      </Menu>

      <div className="inline-flex items-center gap-1 shrink-0">
        <div className="w-px h-4 bg-border" />
        {btn(
          state.bold,
          "Bold (Mod-B)",
          () => editor.chain().focus().toggleBold().run(),
          <BoldIcon size={16} />,
        )}
        {btn(
          state.italic,
          "Italic (Mod-I)",
          () => editor.chain().focus().toggleItalic().run(),
          <ItalicIcon size={16} />,
        )}
        {btn(
          state.underline,
          "Underline (Mod-U)",
          () => editor.chain().focus().toggleUnderline().run(),
          <UnderlineIcon size={16} />,
        )}
        {btn(
          state.highlight,
          "Highlight (Mod-Shift-H)",
          () =>
            editor
              .chain()
              .focus()
              .toggleHighlight({ color: highlightColor })
              .run(),
          <HighlighterIcon size={16} />,
        )}
        {btn(
          state.strike,
          "Strikethrough (Mod-Shift-S)",
          () => editor.chain().focus().toggleStrike().run(),
          <StrikeIcon size={16} />,
        )}
        {btn(
          state.subscript,
          "Subscript (Mod-,)",
          () => editor.chain().focus().toggleSubscript().run(),
          <SubscriptIcon size={16} />,
        )}
        {btn(
          state.superscript,
          "Superscript (Mod-.)",
          () => editor.chain().focus().toggleSuperscript().run(),
          <SuperscriptIcon size={16} />,
        )}
        {btn(state.link, "Link (Mod-K)", toggleLink, <LinkIcon size={16} />)}
      </div>

      <div className="inline-flex items-center gap-1 shrink-0">
        <div className="w-px h-4 bg-border" />
        {btn(
          state.bulletList,
          "Bullet list (Mod-Shift-8)",
          () => editor.chain().focus().toggleBulletList().run(),
          <BulletListIcon size={16} />,
        )}
        {btn(
          state.orderedList,
          "Numbered list (Mod-Shift-7)",
          () => editor.chain().focus().toggleOrderedList().run(),
          <OrderedListIcon size={16} />,
        )}
        {btn(
          state.taskList,
          "Task list (Mod-Shift-9)",
          () => editor.chain().focus().toggleTaskList().run(),
          <TaskListIcon size={16} />,
        )}
        {btn(
          state.blockquote,
          "Quote (Mod-Shift-B)",
          () => editor.chain().focus().toggleBlockquote().run(),
          <BlockquoteIcon size={16} />,
        )}
      </div>

      <div className="inline-flex items-center gap-1 shrink-0">
        <div className="w-px h-4 bg-border" />
        {btn(
          state.code,
          "Inline code (Mod-E)",
          () => editor.chain().focus().toggleCode().run(),
          <CodeIcon size={16} />,
        )}
        {btn(
          state.codeBlock,
          "Code block (Mod-Alt-C)",
          () => editor.chain().focus().toggleCodeBlock().run(),
          <CodeBlockIcon size={16} />,
        )}
        {btn(
          false,
          "Horizontal rule",
          () => editor.chain().focus().setHorizontalRule().run(),
          <HorizontalRuleIcon size={16} />,
        )}
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
