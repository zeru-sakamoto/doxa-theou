# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

doxa-theou is a Bible Study App, built as a desktop app with Tauri 2 (Rust backend) + React 19 + TypeScript (Vite frontend).

## Commands

- `npm install` — install frontend deps (run once, and after pulling changes to package.json)
- `npm run tauri dev` — run the full app (starts Vite dev server on port 1420 and launches the Rust/Tauri window)
- `npm run dev` — frontend-only Vite dev server (no native window)
- `npm run build` — typecheck (`tsc`) then build the frontend bundle
- `npm run tauri build` — produce a release desktop bundle
- `cargo build` / `cargo check` (run from `src-tauri/`) — build/check the Rust side directly
- `cargo test` (run from `src-tauri/`) — run Rust tests; no test suite exists yet

## Architecture

- `src/` — React/TypeScript frontend. Entry point `src/main.tsx`, root component `src/App.tsx`. Talks to native code via `@tauri-apps/api` (`invoke("command_name")`).
- `src-tauri/` — Rust backend, crate name `doxa_theou_lib` (see `src-tauri/Cargo.toml`).
  - `src-tauri/src/main.rs` — binary entry point, just calls `doxa_theou_lib::run()`.
  - `src-tauri/src/lib.rs` — actual app setup: Tauri builder, plugin registration, and `#[tauri::command]` functions exposed to the frontend via `invoke_handler(tauri::generate_handler![...])`. New Rust commands callable from JS/TS go here and must be added to that handler list.
  - `src-tauri/tauri.conf.json` — app identifier, window config, build hooks (`beforeDevCommand`/`beforeBuildCommand` wire this to the Vite scripts above), and bundler target/icon config.
  - `src-tauri/capabilities/` — Tauri 2 permission/capability grants for the webview.
- `vite.config.ts` — dev server is pinned to port 1420 (`strictPort: true`) because `tauri.conf.json` expects it there; `src-tauri/` is excluded from Vite's watcher.
- `docs/` — project documentation.
- `site-content/` — content for a companion website/marketing site (separate from the app itself).

The frontend and Rust backend are two separate build systems (Vite/tsc for TS, Cargo for Rust) orchestrated together by the Tauri CLI; when adding a native capability, expose it as a `#[tauri::command]` in `lib.rs` and call it from React via `invoke()`.
