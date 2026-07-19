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
  MoreIcon,
} from "../../workspace/icons";

// Buttons collapse in two tiers as the toolbar's own width shrinks (panel
// resize or NotesDrawer opening) — core formatting always stays put, less-used
// commands fold into the "More formatting" menu. Tier 2 hides first (wider
// cutoff), tier 3 hides once the toolbar is narrower still.
const TIER2_HIDDEN = "@max-[560px]:hidden";
const TIER3_HIDDEN = "@max-[420px]:hidden";
const MORE_VISIBLE = "@max-[560px]:flex";

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
    hideClass = "",
  ) => (
    <button
      type="button"
      className={
        "iconbtn shrink-0" +
        (active ? " is-active" : "") +
        (hideClass && " " + hideClass)
      }
      title={title}
      aria-pressed={active}
      onClick={onClick}
    >
      {icon}
    </button>
  );

  const tier2: MenuAction[] = [
    {
      label: "Highlight",
      icon: <HighlighterIcon size={16} />,
      onSelect: () =>
        editor.chain().focus().toggleHighlight({ color: highlightColor }).run(),
    },
    {
      label: "Strikethrough",
      icon: <StrikeIcon size={16} />,
      onSelect: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      label: "Bullet list",
      icon: <BulletListIcon size={16} />,
      onSelect: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Numbered list",
      icon: <OrderedListIcon size={16} />,
      onSelect: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "Quote",
      icon: <BlockquoteIcon size={16} />,
      onSelect: () => editor.chain().focus().toggleBlockquote().run(),
    },
  ];

  const tier3: MenuAction[] = [
    {
      label: "Subscript",
      icon: <SubscriptIcon size={16} />,
      onSelect: () => editor.chain().focus().toggleSubscript().run(),
    },
    {
      label: "Superscript",
      icon: <SuperscriptIcon size={16} />,
      onSelect: () => editor.chain().focus().toggleSuperscript().run(),
    },
    {
      label: "Task list",
      icon: <TaskListIcon size={16} />,
      onSelect: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      label: "Inline code",
      icon: <CodeIcon size={16} />,
      onSelect: () => editor.chain().focus().toggleCode().run(),
    },
    {
      label: "Code block",
      icon: <CodeBlockIcon size={16} />,
      onSelect: () => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      label: "Horizontal rule",
      icon: <HorizontalRuleIcon size={16} />,
      onSelect: () => editor.chain().focus().setHorizontalRule().run(),
    },
  ];

  return (
    <div className="@container flex flex-nowrap items-center gap-x-2 gap-y-2 h-[38px] mt-1 px-2 py-1.5 border-b border-border bg-panel shrink-0 grow-0 overflow-hidden">
      <Menu
        triggerClassName="inline-flex items-center gap-1 h-[26px] px-1.5 rounded-(--radius-sm) bg-transparent text-muted text-(length:--text-xs) font-(family-name:--font-mono) hover:bg-accent-tint hover:text-ink shrink-0"
        title="Block type"
        items={headingItems}
      >
        {HEADING_LABEL[state.headingLevel]}
        <ChevronDownIcon size={14} />
      </Menu>

      <div className="w-px h-4 bg-border shrink-0" />
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
      {btn(state.link, "Link (Mod-K)", toggleLink, <LinkIcon size={16} />)}

      <div className={"w-px h-4 bg-border shrink-0 " + TIER2_HIDDEN} />
      {btn(
        state.highlight,
        "Highlight (Mod-Shift-H)",
        tier2[0].onSelect,
        <HighlighterIcon size={16} />,
        TIER2_HIDDEN,
      )}
      {btn(
        state.strike,
        "Strikethrough (Mod-Shift-S)",
        tier2[1].onSelect,
        <StrikeIcon size={16} />,
        TIER2_HIDDEN,
      )}
      {btn(
        state.bulletList,
        "Bullet list (Mod-Shift-8)",
        tier2[2].onSelect,
        <BulletListIcon size={16} />,
        TIER2_HIDDEN,
      )}
      {btn(
        state.orderedList,
        "Numbered list (Mod-Shift-7)",
        tier2[3].onSelect,
        <OrderedListIcon size={16} />,
        TIER2_HIDDEN,
      )}
      {btn(
        state.blockquote,
        "Quote (Mod-Shift-B)",
        tier2[4].onSelect,
        <BlockquoteIcon size={16} />,
        TIER2_HIDDEN,
      )}

      <div className={"w-px h-4 bg-border shrink-0 " + TIER3_HIDDEN} />
      {btn(
        state.subscript,
        "Subscript (Mod-,)",
        tier3[0].onSelect,
        <SubscriptIcon size={16} />,
        TIER3_HIDDEN,
      )}
      {btn(
        state.superscript,
        "Superscript (Mod-.)",
        tier3[1].onSelect,
        <SuperscriptIcon size={16} />,
        TIER3_HIDDEN,
      )}
      {btn(
        state.taskList,
        "Task list (Mod-Shift-9)",
        tier3[2].onSelect,
        <TaskListIcon size={16} />,
        TIER3_HIDDEN,
      )}
      {btn(
        state.code,
        "Inline code (Mod-E)",
        tier3[3].onSelect,
        <CodeIcon size={16} />,
        TIER3_HIDDEN,
      )}
      {btn(
        state.codeBlock,
        "Code block (Mod-Alt-C)",
        tier3[4].onSelect,
        <CodeBlockIcon size={16} />,
        TIER3_HIDDEN,
      )}
      {btn(
        false,
        "Horizontal rule",
        tier3[5].onSelect,
        <HorizontalRuleIcon size={16} />,
        TIER3_HIDDEN,
      )}

      <Menu
        triggerClassName={"iconbtn shrink-0 hidden " + MORE_VISIBLE}
        title="More formatting"
        align="right"
        items={[...tier2, ...tier3]}
      >
        <MoreIcon size={16} />
      </Menu>

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
