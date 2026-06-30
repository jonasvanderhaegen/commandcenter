# Architecture

CommandCenter is a desktop "command center": one window that hosts many terminal
sessions and AI agents, organized by project. The design is lifted from
[Solo](https://soloterm.com) -- a Rust/Tauri core with a WebView UI -- adapted
into a clean skeleton.

## Why Tauri (Rust), not Electron

Solo's bet, which we copy: the backend is **Rust** behind **Tauri v2** (the
`tao` windowing + `wry` WebView crates). The UI renders in the _system_
WebView (WKWebView on macOS), so there is no bundled Chromium. The terminal
layer is native rather than `node-pty` + a JS terminal.

| Concern     | CommandCenter / Solo (Tauri) | XVE / Electron      |
| ----------- | ---------------------------- | ------------------- |
| UI runtime  | system WebView (no Chromium) | bundled Chromium    |
| Backend     | Rust                         | Node / TypeScript   |
| Terminal    | native PTY                   | node-pty + xterm.js |
| Bundle size | small                        | large               |

## Object model

- **Project** -- a workspace scope (a directory, a repo). The top-level
  grouping. Holds processes and agents.
- **Process** -- a managed, long-running command (a shell, a dev server, a
  watcher). Lifecycle: spawn, stream output, restart, stop. Backed by a PTY so
  interactive programs work.
- **Agent** -- an AI coding session bound to a project, spawned and supervised
  like a process but with an agent-aware wrapper.

## Command surface (Tauri commands <-> UI)

The backend exposes a small set of commands the UI invokes. Names mirror Solo's
MCP verbs so the mental model transfers:

| Command              | Purpose                                | State |
| -------------------- | -------------------------------------- | ----- |
| `list_projects`      | enumerate projects                     | stub  |
| `list_processes`     | processes in a project                 | stub  |
| `spawn_process`      | start a managed process (PTY)          | todo  |
| `get_process_output` | read buffered output of a process      | todo  |
| `restart_process`    | restart a managed process              | todo  |
| `spawn_agent`        | start an AI agent session in a project | todo  |

## Components (planned)

```
+------------------------------------------------+
| ui/ (WebView)                                  |
|   sidebar: projects -> processes / agents      |
|   panes:   xterm.js terminals                  |
+----------------------^-------------------------+
                       | Tauri invoke / events
+----------------------v-------------------------+
| src-tauri/ (Rust)                              |
|   commands  -- the surface above               |
|   engine    -- process supervisor (PTYs)       |  <- not built yet
|   store     -- projects / processes state      |  <- not built yet
+------------------------------------------------+
```

## Not in the skeleton (deliberately)

PTY supervision, output buffering and streaming to the UI, persistence, agent
wrappers, the CLI, and an MCP server. These are the next layers; the skeleton
only fixes the shape and the command names.
