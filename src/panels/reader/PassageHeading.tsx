// Editorial section heading (ESV-style), sans-serif to stand apart from the
// serif verse text — same UI/content typographic split the rest of the app uses.
export function PassageHeading({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <p
      className={`mb-2 font-(family-name:--font-sans) text-(length:--text-xl) font-semibold text-ink ${className}`}
    >
      {text}
    </p>
  );
}
