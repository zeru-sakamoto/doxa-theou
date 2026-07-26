// Hand-rolled SVG icons (lucide-derived paths), stroke = currentColor.
// ~14 inline icons instead of an icon-library dependency.
import type { SVGProps } from "react";

function Svg({
  size = 16,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

// Icon size scale (px). A small named set instead of ad-hoc per-call sizes, so
// icons sit on four consistent tiers. JS (not a CSS var) because the SVG
// width/height `size` prop needs a number. xs: inline actions (tag/anchor
// close) · sm: chrome + chevrons · md: base controls (toolbar, reader nav,
// menus) · lg: prominent header controls.
export const ICON = { xs: 12, sm: 14, md: 16, lg: 19 } as const;

export const MenuIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Svg {...p}>
    <path d="M4 6h16" />
    <path d="M4 12h16" />
    <path d="M4 18h16" />
  </Svg>
);

export const SearchIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </Svg>
);

export const FilterIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Svg {...p}>
    <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
  </Svg>
);

export const NotesIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Svg {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
    <path d="M10 9H8" />
  </Svg>
);

export const SettingsIcon = (
  p: SVGProps<SVGSVGElement> & { size?: number },
) => (
  <Svg {...p}>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

// Bible: a closed book with a cross on the cover, so the Reader/Bible reads as
// scripture rather than a generic book. (Replaces the old plain BookIcon; every
// use of it was the Bible context.)
export const BibleIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Svg {...p}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    <path d="M13 6.5v5" />
    <path d="M10.75 8.5h4.5" />
  </Svg>
);

export const NotebookIcon = (
  p: SVGProps<SVGSVGElement> & { size?: number },
) => (
  <Svg {...p}>
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <path d="M15 2v20" />
    <path d="M2 6h4" />
    <path d="M2 10h4" />
    <path d="M2 14h4" />
    <path d="M2 18h4" />
  </Svg>
);

export const ChevronRightIcon = (
  p: SVGProps<SVGSVGElement> & { size?: number },
) => (
  <Svg {...p}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);

export const ChevronDownIcon = (
  p: SVGProps<SVGSVGElement> & { size?: number },
) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const ChevronUpIcon = (
  p: SVGProps<SVGSVGElement> & { size?: number },
) => (
  <Svg {...p}>
    <path d="m18 15-6-6-6 6" />
  </Svg>
);

export const PlusIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Svg {...p}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Svg>
);

export const LayoutIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18" />
    <path d="M9 12h12" />
  </Svg>
);

export const CardsIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Svg {...p}>
    <rect x="3" y="3" width="8" height="8" rx="1.5" />
    <rect x="13" y="3" width="8" height="8" rx="1.5" />
    <rect x="3" y="13" width="8" height="8" rx="1.5" />
    <rect x="13" y="13" width="8" height="8" rx="1.5" />
  </Svg>
);

export const MoreIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Svg {...p}>
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="19" r="1" />
  </Svg>
);

export const MinimizeIcon = (
  p: SVGProps<SVGSVGElement> & { size?: number },
) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);

export const MaximizeIcon = (
  p: SVGProps<SVGSVGElement> & { size?: number },
) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="1.5" />
  </Svg>
);

export const RestoreIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Svg {...p}>
    <rect x="8" y="4" width="12" height="12" rx="1.5" />
    <path d="M4 9v9a1 1 0 0 0 1 1h9" />
  </Svg>
);

export const CloseIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Svg {...p}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Svg>
);

export const ExitIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Svg {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </Svg>
);

export const SunIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);

export const MoonIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Svg {...p}>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
  </Svg>
);

export const CheckIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Svg {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);

export const BoldIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Svg {...p}>
    <path d="M6 4h6a4 4 0 0 1 0 8H6z" />
    <path d="M6 12h7a4 4 0 0 1 0 8H6z" />
  </Svg>
);

export const ItalicIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Svg {...p}>
    <line x1="19" y1="4" x2="10" y2="4" />
    <line x1="14" y1="20" x2="5" y2="20" />
    <line x1="15" y1="4" x2="9" y2="20" />
  </Svg>
);

export const UnderlineIcon = (
  p: SVGProps<SVGSVGElement> & { size?: number },
) => (
  <Svg {...p}>
    <path d="M6 4v6a6 6 0 0 0 12 0V4" />
    <line x1="4" y1="20" x2="20" y2="20" />
  </Svg>
);

export const HighlighterIcon = (
  p: SVGProps<SVGSVGElement> & { size?: number },
) => (
  <Svg {...p}>
    <rect x="3" y="14" width="6" height="6" rx="1" />
    <path d="M8 14 18 4a2.83 2.83 0 0 1 4 4L12 18" />
  </Svg>
);

export const BulletListIcon = (
  p: SVGProps<SVGSVGElement> & { size?: number },
) => (
  <Svg {...p}>
    <circle cx="4" cy="6" r="1" />
    <circle cx="4" cy="12" r="1" />
    <circle cx="4" cy="18" r="1" />
    <line x1="9" y1="6" x2="20" y2="6" />
    <line x1="9" y1="12" x2="20" y2="12" />
    <line x1="9" y1="18" x2="20" y2="18" />
  </Svg>
);

export const ParagraphIcon = (
  p: SVGProps<SVGSVGElement> & { size?: number },
) => (
  <Svg {...p}>
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="18" x2="14" y2="18" />
  </Svg>
);

export const OrderedListIcon = (
  p: SVGProps<SVGSVGElement> & { size?: number },
) => (
  <Svg {...p}>
    <path d="M4 6h1v4" />
    <path d="M4 10h2" />
    <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
    <line x1="10" y1="6" x2="21" y2="6" />
    <line x1="10" y1="12" x2="21" y2="12" />
    <line x1="10" y1="18" x2="21" y2="18" />
  </Svg>
);

export const BlockquoteIcon = (
  p: SVGProps<SVGSVGElement> & { size?: number },
) => (
  <Svg {...p}>
    <path d="M7 15c-1.5 0-2.5-1-2.5-2.5S5.5 10 7 10s2.5 1 2.5 2.5c0 2-1.5 4-3.5 4.5" />
    <path d="M16 15c-1.5 0-2.5-1-2.5-2.5S14.5 10 16 10s2.5 1 2.5 2.5c0 2-1.5 4-3.5 4.5" />
  </Svg>
);

export const StrikeIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Svg {...p}>
    <path d="M16 4H9a3 3 0 0 0-2.83 4" />
    <path d="M14 12a4 4 0 0 1 0 8H6" />
    <line x1="4" y1="12" x2="20" y2="12" />
  </Svg>
);

export const CodeIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Svg {...p}>
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </Svg>
);

export const CodeBlockIcon = (
  p: SVGProps<SVGSVGElement> & { size?: number },
) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="m9 9-2 3 2 3" />
    <path d="m15 9 2 3-2 3" />
  </Svg>
);

export const LinkIcon = (p: SVGProps<SVGSVGElement> & { size?: number }) => (
  <Svg {...p}>
    <path d="M9 17H7a5 5 0 0 1 0-10h2" />
    <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </Svg>
);

export const HorizontalRuleIcon = (
  p: SVGProps<SVGSVGElement> & { size?: number },
) => (
  <Svg {...p}>
    <line x1="3" y1="12" x2="21" y2="12" />
  </Svg>
);

export const TaskListIcon = (
  p: SVGProps<SVGSVGElement> & { size?: number },
) => (
  <Svg {...p}>
    <path d="m3 6 1.5 1.5L7 5" />
    <path d="m3 13 1.5 1.5L7 12" />
    <line x1="11" y1="6" x2="21" y2="6" />
    <line x1="11" y1="13" x2="21" y2="13" />
    <line x1="3" y1="19" x2="21" y2="19" />
  </Svg>
);

export const SubscriptIcon = (
  p: SVGProps<SVGSVGElement> & { size?: number },
) => (
  <Svg {...p}>
    <path d="m4 5 8 8" />
    <path d="m12 5-8 8" />
    <path d="M20 19h-4c0-1.5.44-2 1.5-2.5S20 15.33 20 14a2 2 0 0 0-3.5-1.34" />
  </Svg>
);

export const SuperscriptIcon = (
  p: SVGProps<SVGSVGElement> & { size?: number },
) => (
  <Svg {...p}>
    <path d="m4 19 8-8" />
    <path d="m12 19-8-8" />
    <path d="M20 9h-4c0-1.5.44-2 1.5-2.5S20 5.33 20 4a2 2 0 0 0-3.5-1.34" />
  </Svg>
);
