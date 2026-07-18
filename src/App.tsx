import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

// Minimal backend smoke-test UI: read a chapter from bible.sqlite via Rust.
// Real reading/notes/search UI comes later — this just exercises the commands.
type Verse = {
  verse_ref_id: number;
  chapter: number;
  verse: number;
  text: string;
};

function App() {
  const [verses, setVerses] = useState<Verse[]>([]);
  const [error, setError] = useState("");

  async function loadJohn1() {
    setError("");
    try {
      // John = book 43. Tauri maps camelCase JS args -> snake_case Rust params.
      setVerses(
        await invoke<Verse[]>("get_chapter", {
          bookId: 43,
          chapter: 1,
          translation: "ESV",
        }),
      );
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <main className="container">
      <h1>doxa-theou</h1>
      <button onClick={loadJohn1}>Load John 1 (ESV)</button>
      {error && (
        <p style={{ color: "crimson", whiteSpace: "pre-wrap" }}>{error}</p>
      )}
      <ol>
        {verses.map((v) => (
          <li key={v.verse_ref_id} value={v.verse}>
            {v.text}
          </li>
        ))}
      </ol>
    </main>
  );
}

export default App;
