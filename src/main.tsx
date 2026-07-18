import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Self-hosted fonts (offline; no CDN).
import "@fontsource/newsreader/400.css";
import "@fontsource/newsreader/400-italic.css";
import "@fontsource/newsreader/600.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";

// Styles — dockview first so our token overrides win the cascade.
import "dockview-react/dist/styles/dockview.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/shell.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
