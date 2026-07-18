// Notes — stub. Multi-anchor Markdown-on-disk notes come later (see product doc).
export function NotesPanel() {
  return (
    <div className="panel notes">
      <div className="notes__pad">
        <p className="panel__muted">
          Notes are Markdown files on disk with multi-anchor verse links. The
          editor lands in a later pass — this pane is a placeholder.
        </p>
        <textarea
          className="notes__editor"
          spellCheck={false}
          placeholder={"# Note\n\nWrite freely…"}
        />
      </div>
    </div>
  );
}
