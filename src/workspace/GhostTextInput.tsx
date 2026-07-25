// Drop-in <input> replacement that shows a muted "ghost" completion after the
// caret (browser-omnibox style) and fills it in on Tab / ArrowRight-at-end.
// Two boxes stacked exactly on top of each other: a hidden overlay paints the
// muted remainder text, and the real <input> sits on top with a transparent
// background so its own (opaque) typed text and caret show through while the
// remainder peeks out past wherever the input's text ends.
import { useRef, useState, type KeyboardEvent } from "react";

interface GhostTextInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestion: string | null;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
}

export function GhostTextInput({
  value,
  onChange,
  suggestion,
  className = "",
  placeholder,
  "aria-label": ariaLabel,
}: GhostTextInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [caretAtEnd, setCaretAtEnd] = useState(true);

  const remainder =
    caretAtEnd &&
    suggestion &&
    suggestion.length > value.length &&
    suggestion.toLowerCase().startsWith(value.toLowerCase())
      ? suggestion.slice(value.length)
      : "";

  function syncCaretAtEnd() {
    const el = inputRef.current;
    setCaretAtEnd(
      !!el &&
        el.selectionStart === value.length &&
        el.selectionEnd === value.length,
    );
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "Tab" || e.key === "ArrowRight") && remainder) {
      e.preventDefault();
      onChange(value + remainder);
    }
  }

  return (
    <div className="relative w-full">
      {remainder && (
        <div
          aria-hidden="true"
          className={`input absolute inset-0 overflow-hidden whitespace-pre pointer-events-none select-none ${className}`}
        >
          <span className="text-transparent">{value}</span>
          <span className="text-muted">{remainder}</span>
        </div>
      )}
      <input
        ref={inputRef}
        className={`input relative w-full bg-transparent ${className}`}
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onSelect={syncCaretAtEnd}
        onKeyUp={syncCaretAtEnd}
        onClick={syncCaretAtEnd}
        onFocus={syncCaretAtEnd}
      />
    </div>
  );
}
