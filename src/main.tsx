import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Self-hosted fonts (offline; no CDN).
import "@fontsource/newsreader/400.css";
import "@fontsource/newsreader/400-italic.css";
import "@fontsource/newsreader/600.css";
import "@fontsource/newsreader/600-italic.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/400-italic.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/600-italic.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";

// Styles — dockview first so our token overrides win the cascade.
import "dockview-react/dist/styles/dockview.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/notes-editor.css";

// No native/webview right-click menu — this is a desktop app, not a browser
// tab. preventDefault only (no stopPropagation), so dockview's own tab
// context menu (getTabContextMenuItems in dock.tsx) still fires normally.
document.addEventListener("contextmenu", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
