# XVE Parity Map

Source: `/Users/jv/Downloads/XVE-command-center-main` ("XVE Command Center") —
Electron 42 + Electron Forge + React 19 + webpack + node-pty + xterm.js,
Windows-primary blue/green deploy. Read-only reference; nothing under
`/Users/jv/Downloads` was changed to produce this doc.

Target: `/Users/jv/Code/commandcenter` — Tauri v2 (Rust backend, system
WebView UI). See `docs/ARCHITECTURE.md` for the object model (**Project /
Process / Agent**) and the Tauri command surface.

Ground truth for counts below is `src/types.ts` (`ElectronAPI` interface) and
the actual `ipcMain.handle(...)` registrations under `src/main/index.ts` +
`src/main/ipc/*.ts` — not the domain table in XVE's `CLAUDE.md`, which is
stale relative to the code (missing `infisical`, `skills`, `lead`,
`orchestrator`, `audit`, `inbox`, `vscode`, and folding `approvals`/`fleet
ops` into `hermes`/`fleet`). Handler counts are per-domain
`ipcMain.handle('domain:...')` registrations, a complexity proxy, not a line
count.

Verdict scheme: **port** (bring as-is, adapted to Rust/Tauri idiom), **adapt**
(bring the concept, cut scope/rewrite), **drop** (do not bring), **defer**
(plausible, not wave 1/2).

## IPC domain map (24/24)

| Domain       | What it does                                                                                                 | Handlers                                                                       | Verdict   | Reason                                                                                                                                                         | Tauri mapping                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `pty`        | Spawn/kill a PTY, read buffered usage stats, search scrollback                                               | 4 (`create`, `kill`, `usage`, `search-output`)                                 | **port**  | This _is_ the process engine already being built                                                                                                               | `spawn_process` / `get_process_output` / `restart_process` on `Process` |
| `git`        | Status, fetch, pull, branches, switch, worktree add/remove/list, diff-stat, diff                             | 10                                                                             | **port**  | Per-project git status/worktree mgmt is core to the `Project` object                                                                                           | New `git_*` Tauri commands scoped to `Project`                          |
| `sessions`   | Scan `~/.claude*/projects/` JSONL for CC1/CC2/Codex/Copilot, find cwd by session id                          | 2                                                                              | **adapt** | Valuable (resume UX) but the scanner should shrink to only what `Agent.resume` needs                                                                           | `Agent` resume path                                                     |
| `bookmarks`  | Session bookmark CRUD (save/rename/touch/delete)                                                             | 5                                                                              | **defer** | Small nice-to-have layered on `sessions`; not on the critical path                                                                                             | Future `Agent` bookmark table                                           |
| `usage`      | Token usage estimate (5h/7d windows), per-profile enable, caps                                               | 9                                                                              | **adapt** | Real differentiator (usage caps UX) but current shape assumes CC1/CC2/Codex/Copilot profile quartet — simplify to whatever profiles the rebuild actually ships | Usage panel reading `Agent` session logs                                |
| `prompts`    | Saved prompt library CRUD                                                                                    | 3                                                                              | **port**  | Cheap, high value, no external deps                                                                                                                            | New `prompts` table + commands                                          |
| `presets`    | Skill preset CRUD (cwd + model + intro-prompt bundles)                                                       | 4                                                                              | **adapt** | Overlaps with the "saved command defs" already planned for `store-projects`; fold rather than duplicate                                                        | Saved-command-def table (lane `store-projects`)                         |
| `notes`      | Session note CRUD + CC1-powered "enhance prompt"                                                             | 7                                                                              | **defer** | Personal note-taking is not core to the process/agent engine                                                                                                   | Wave 2+, if at all                                                      |
| `notes-sync` | MySQL/MariaDB sync for notes (mode switch, test, migrate, push-all)                                          | 6                                                                              | **drop**  | Pulls in a MySQL dependency for a niche multi-device sync feature; contrary to a local-first Tauri app                                                         | —                                                                       |
| `hermes`     | HTTP client for a remote Hermes-agent VPS: instances, health, jobs, chat, sessions, runs                     | 22 (instances 7, health/models/skills/sessions/msgs 5, jobs 5, chat 1, runs 4) | **defer** | Controls a specific remote-agent product (see hermes/ section below), not the local command-center rebuild's scope                                             | If ever revisited, a separate plugin, not core                          |
| `tenants`    | Multi-tenant scoping for Hermes instances                                                                    | 8                                                                              | **drop**  | Exists only to namespace `hermes:*`; drops with it                                                                                                             | —                                                                       |
| `fleet`      | Multi-instance health polling + fleet ops (deploy, ssh/vault checks, config gen)                             | 16                                                                             | **drop**  | VPS fleet ops for the Hermes product, unrelated to a local dev command center                                                                                  | —                                                                       |
| `mcp`        | MCP server config CRUD per profile, health check, import/export                                              | 7                                                                              | **port**  | Generic, high-value for any Claude-Code-adjacent tool                                                                                                          | New `mcp_*` commands + config file writer                               |
| `todos`      | Todo CRUD + blockers + comments                                                                              | 9                                                                              | **adapt** | Good concept, but this very rebuild is orchestrated via Solo todos — prefer delegating to Solo's API over reimplementing a parallel todo store                 | Wave 2 UI over Solo, not a new local store                              |
| `timers`     | Delay/repeat timer CRUD + pause/resume/cancel                                                                | 7                                                                              | **defer** | Small utility, low priority until todos land                                                                                                                   | —                                                                       |
| `assistants` | Outlook/Teams/Jira/Ideas workspace bootstrap + trigger prompts                                               | 4                                                                              | **drop**  | Niche, tied to one user's specific workflow tools                                                                                                              | —                                                                       |
| `council`    | Multi-model fanout: spawn N PTYs in parallel, synthesize output                                              | 4                                                                              | **adapt** | Compelling wave-2 showcase for the process engine (spawn multiple `Agent`s concurrently) once the engine is solid                                              | `Agent` fanout over existing `spawn_process`                            |
| `gdrive`     | Google Drive OAuth + list/upload/create-folder/delete                                                        | 9                                                                              | **drop**  | Unrelated to a dev command center                                                                                                                              | —                                                                       |
| `settings`   | App prefs: default model, permission mode, feature flags, split layout, IDE, paths, update feed, hot-rebuild | 21                                                                             | **adapt** | Large grab-bag; port only the essential subset (model, permission mode, IDE, split layout) not every feature flag                                              | Trimmed `settings_get/set` commands                                     |
| `aiProfiles` | AI profile CRUD (built-in CC1/CC2/Codex/Copilot + custom)                                                    | 5                                                                              | **port**  | Central to the multi-agent vision — defines what an `Agent` can be spawned as                                                                                  | `Agent` profile table                                                   |
| `locks`      | Simple distributed lock (acquire/release/status)                                                             | 3                                                                              | **defer** | Solo already provides todo-level locking (`todo_lock`/`lock_acquire`) for this org's workflow; redundant unless the rebuild ships without Solo                 | —                                                                       |
| `app`        | Version, update-feed URL, update check, hot-rebuild, saved-tab persistence                                   | 10                                                                             | **adapt** | Version/update-feed/hot-rebuild are Electron-Forge blue/green specific; Tauri has its own updater plugin — port only what that doesn't cover                   | Tauri updater plugin + saved-workspace state                            |
| `shells`     | Shell/folder favorites + recents                                                                             | 5                                                                              | **port**  | Small, cheap, maps directly to a `Project` quick-switch list                                                                                                   | `Project` favorites list                                                |
| `projects`   | Pinned project CRUD + read `CLAUDE.md`                                                                       | 4                                                                              | **port**  | Directly the `Project` object already being built                                                                                                              | `list_projects` / add / remove (lane `store-projects`)                  |

**Domain coverage check:** `grep -c '^| \`' docs/XVE-PARITY.md` on the table above = 24 rows, one per required domain (pty, git, sessions, bookmarks, usage, prompts, presets, notes, notes-sync, hermes, tenants, fleet, mcp, todos, timers, assistants, council, gdrive, settings, aiProfiles, locks, app, shells, projects) = **24/24**.

### Domains present in code but not in the CLAUDE.md table (found via `src/main/ipc/*.ts`, noted for completeness)

| Domain                   | What it does                                                                       | Handlers | Verdict   | Reason                                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------- | -------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `approvals`              | Approve/deny Hermes agent actions, decision log, inject                            | ~4       | **drop**  | Sub-feature of `hermes`; drops with it                                                                                                                                |
| `inbox`                  | Agent-event inbox backed by the notes-sync MySQL DB                                | ~6       | **drop**  | Depends on `notes-sync`; drops with it                                                                                                                                |
| `skills`                 | Claude/Codex skill file CRUD + marketplace install                                 | 9        | **defer** | Niche marketplace feature; revisit only if the rebuild grows a skills concept                                                                                         |
| `infisical`              | Infisical CLI wrapper: machine identity, secret get/set/delete, status             | 11       | **drop**  | Secrets-vault UI tied to the Hermes fleet's secret flow                                                                                                               |
| `vscode`                 | Open folder in IDE, list active files by process title                             | ~3       | **adapt** | Cheap "open in IDE" helper, worth a small command if IDE handoff matters                                                                                              |
| `lead`                   | Multi-agent plan/review synthesis (a "lead" model drafts a plan, reviews subtasks) | 2        | **defer** | Interesting but experimental; revisit once multi-agent orchestration exists                                                                                           |
| `orchestrator` + `audit` | Todo assignment, worker-linking, audit log                                         | 5        | **defer** | Conceptually overlaps with how _this rebuild itself_ is being run via Solo — worth revisiting once the rebuild needs its own orchestration UI, not duplicating it now |

## Views / components (11/11)

| View                                                                                                         | What it is                                                              | Verdict   | Reason                                                                                                      |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| `dashboard` (DashboardView, WorkspaceCard)                                                                   | Workspace card grid: pinned projects + shell favorites + open terminals | **port**  | Literally the sidebar/home concept already fixed in `ARCHITECTURE.md`                                       |
| `terminals` (TerminalsView, TerminalPane, DiffSidebar)                                                       | Split/single-pane terminal manager over xterm.js + WebGL renderer       | **port**  | Exactly lane `ui-terminal`'s target; `DiffSidebar` (inline git diff) is a good wave-2 add-on                |
| `hermes` (HermesView + 9 subpanels: Overview/Jobs/Chat/Health/Approvals/Sessions/Agents/Skills/JobEditModal) | Remote Hermes-VPS control panel                                         | **drop**  | Matches the `hermes` IPC domain drop — out of scope for a local command center                              |
| `fleet` (FleetView, FleetOpsPanel, InboxPanel)                                                               | Multi-instance VPS fleet health + ops                                   | **drop**  | Matches `fleet`/`tenants` IPC domain drop                                                                   |
| `mcp` (McpView, McpEditModal, McpImportModal)                                                                | MCP server config CRUD UI                                               | **port**  | Matches `mcp` IPC domain port                                                                               |
| `settings` (SettingsView)                                                                                    | All app settings in one page                                            | **adapt** | Port a trimmed page (model, permission mode, IDE, layout); drop the feature-flag pile                       |
| `tasks` (TasksView)                                                                                          | Todo + timer management UI                                              | **adapt** | Prefer building this as a UI over Solo's todo API rather than a local reimplementation (see `todos` domain) |
| `files` (FilesView)                                                                                          | Google Drive file browser                                               | **drop**  | Matches `gdrive` IPC domain drop                                                                            |
| `infisical` (InfisicalView)                                                                                  | Infisical secrets UI                                                    | **drop**  | Matches `infisical` domain drop                                                                             |
| `shells` (ProfilePickerModal)                                                                                | Quick-launch shell/folder picker                                        | **port**  | Small, cheap, matches `shells` IPC domain port                                                              |
| `skills` (SkillsView)                                                                                        | Claude/Codex skill file manager + marketplace                           | **defer** | Matches `skills` domain defer                                                                               |

## The `hermes/` subtree (fleet/kit/docs)

`hermes/` (91 files: `fleet/` Python+YAML provisioning pipeline, `kit/` a
specific chief-of-staff persona setup, `docs/` architecture/planning docs) is
explicitly _not imported by the app_ per XVE's own `CLAUDE.md` — it's a
sibling ops project for provisioning and running one specific person's
("Bram") remote Hermes agent VPS instance, consumed only by the `hermes`/
`fleet`/`tenants` IPC domains this doc already recommends dropping.

**Recommendation: none of it belongs in the rebuild repo.** It's a
self-contained infra/ops project (Hetzner provisioning, Tailscale, systemd,
Infisical secrets, a specific persona's SOUL/USER config) with its own
lifecycle, not a component of a general-purpose local dev command center. If
the Hermes VPS product continues, it should live in its own repo — bringing
it along would tie the rebuild's structure to one remote-agent deployment
that has nothing to do with local PTY/project management.

## Wave 2 shortlist

Ordered list of the 5-8 features to build next after the process engine
(`engine-pty`/`store-projects`/`ui-terminal`) lands, informed by the port
verdicts above:

1. **Agent spawning/supervision (`spawn_agent` + `Agent` object)** — the
   natural next layer once `Process` exists; turns the aiProfiles + pty:create
   groundwork into the actual multi-agent model `ARCHITECTURE.md` promises.
2. **Sessions/resume** — cheap, high perceived value; users expect to pick up
   a past Claude Code session rather than start cold every time.
3. **Git status per project** — the `git` domain is already ported at the
   engine level; wiring `git:status`/`diff-stat` into the sidebar is a small
   follow-up with a big daily-use payoff.
4. **Prompt library** — trivial CRUD, immediate productivity win, no
   dependencies on the agent model being finished.
5. **AI profile CRUD UI** — unlocks non-Claude agents (Codex, custom
   commands), which is core to the "many agent types" vision, not just Claude.
6. **MCP config UI** — every Claude-Code-adjacent tool needs this; the IPC
   surface is already scoped small (7 handlers) and self-contained.
7. **Usage panel (5h/7d caps)** — a feature XVE users specifically valued;
   worth adapting once agent sessions exist to instrument against.
8. **Council-style multi-model fanout** — ambitious, but a strong "wow"
   demonstration of the process engine's ability to spawn and manage several
   concurrent agents at once; save for after the basics are solid.
