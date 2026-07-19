import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  // dockview and motion are both used by the always-loaded shell (dock host,
  // menus, drawers), so they can't be code-split via dynamic import() like
  // the Notes/Search/Settings panels are (see workspace/dock.tsx). Splitting
  // them into their own vendor chunks keeps every chunk under Vite's 500kB
  // warning without changing what loads at startup.
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("dockview-core") || id.includes("dockview-react"))
            return "vendor-dockview";
          if (id.includes("/motion/") || id.includes("framer-motion"))
            return "vendor-motion";
        },
      },
    },
  },
}));
