# Ensemble

A terminal-of-terminals and agent orchestrator for the desktop.

Ensemble groups your work into **projects**. Inside a project you run many
long-lived **processes** (shells, dev servers, build watchers) and **agents**
(AI coding sessions) side by side, in one window, under one roof. Think
"tmux with a GUI and agents", or a command center for everything you have
running.

It is a native desktop app: a Rust backend (Tauri) drives the process and
terminal layer, a web UI renders the panes in the system WebView.

> Status: **skeleton**. The architecture and command surface are laid out; the
> engine (PTY supervision, agent spawning) is stubbed. See
> [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Model

```
project --+-- process   (a managed long-running shell / command)
          +-- process
          +-- agent     (an AI coding session bound to the project)
```

## Stack

| Layer        | Choice                                |
| ------------ | ------------------------------------- |
| Shell/window | Tauri v2 (Rust)                       |
| Backend      | Rust -- process supervision, PTYs     |
| Frontend     | Vite + TypeScript, xterm.js terminals |
| Terminal     | native PTY (planned: `portable-pty`)  |

The split mirrors [Solo](https://soloterm.com): a Rust/Tauri core with a
WebView frontend, rather than an Electron + node-pty stack.

## Develop

```sh
# one-time
npm install                 # root: Tauri CLI
npm install --prefix ui     # frontend deps

# run the app (Rust toolchain + Tauri prereqs required)
npm run tauri dev
```

The UI alone (no Rust backend) runs with `npm run --prefix ui dev`.

## Layout

```
src-tauri/   Rust backend -- Tauri app, commands, (future) process engine
ui/          web frontend -- panes, sidebar, terminals
docs/        design notes
```
