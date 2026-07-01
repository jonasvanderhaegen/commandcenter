use rmcp::{
    ServerHandler,
    handler::server::wrapper::Parameters,
    model::{CallToolResult, Implementation, ServerCapabilities, ServerInfo},
    tool, tool_handler, tool_router,
};

use crate::EventBus;
use crate::tools;
use crate::tools::McpTool as _;

/// CommandCenter's Solo-compatible MCP server.
///
/// Most tools below are stubs: the schema is registered with the MCP router so
/// clients can discover and call them, but the handler returns a "not yet
/// implemented" error. The exception is `set_odometer`, which publishes to the
/// shared [`EventBus`] (see [`CcMcpServer::with_bus`]) to drive the landing demo.
#[derive(Clone)]
pub struct CcMcpServer {
    tool_router: rmcp::handler::server::router::tool::ToolRouter<CcMcpServer>,
    /// Shared pub/sub bus. Tools publish here; the WS/WebTransport servers
    /// relay to subscribed frontends. An unconnected default bus in stdio
    /// mode, the process-wide bus when embedded via `serve_http_with_bus`.
    bus: EventBus,
}

impl Default for CcMcpServer {
    fn default() -> Self {
        Self::new()
    }
}

#[tool_router(router = tool_router)]
impl CcMcpServer {
    #[must_use]
    pub fn new() -> Self {
        Self::with_bus(EventBus::default())
    }

    /// Build a server whose tools publish to `bus`, so tool calls reach the
    /// same subscribers as the WebSocket/WebTransport event servers.
    #[must_use]
    pub fn with_bus(bus: EventBus) -> Self {
        Self {
            tool_router: Self::tool_router(),
            bus,
        }
    }

    // ── Session & Identity ──────────────────────────────────────────────

    #[tool(
        description = "Show this MCP session's identified Solo process, session-scoped actor, and effective project scope."
    )]
    async fn whoami(
        &self,
        Parameters(_p): Parameters<tools::session::WhoamiParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::session::WhoamiTool::NAME)
    }

    #[tool(
        description = "Identify this MCP session to Solo. With no arguments, auto-detect and report the current identity."
    )]
    async fn identify_session(
        &self,
        Parameters(_p): Parameters<tools::session::IdentifySessionParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::session::IdentifySessionTool::NAME)
    }

    #[tool(description = "Discover Solo MCP capabilities. Call with no arguments for an overview.")]
    async fn help(&self, Parameters(_p): Parameters<tools::session::HelpParams>) -> CallToolResult {
        tools::not_implemented(tools::session::HelpTool::NAME)
    }

    // ── Projects ─────────────────────────────────────────────────────────

    #[tool(description = "List Solo projects. Auto-selects the project if there is only one.")]
    async fn list_projects(
        &self,
        Parameters(_p): Parameters<tools::projects::NoParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::projects::ListProjectsTool::NAME)
    }

    #[tool(description = "Select which project later MCP tools should act on for this session.")]
    async fn select_project(
        &self,
        Parameters(_p): Parameters<tools::projects::SelectProjectParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::projects::SelectProjectTool::NAME)
    }

    #[tool(description = "Register or import an existing local directory as a Solo project.")]
    async fn create_project(
        &self,
        Parameters(_p): Parameters<tools::projects::CreateProjectParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::projects::CreateProjectTool::NAME)
    }

    #[tool(description = "Delete the effective Solo project and tear down its Solo-owned state.")]
    async fn delete_project(
        &self,
        Parameters(_p): Parameters<tools::projects::DeleteProjectParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::projects::DeleteProjectTool::NAME)
    }

    #[tool(description = "Read metadata for the effective project scope.")]
    async fn get_project(
        &self,
        Parameters(_p): Parameters<tools::projects::ProjectScopeParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::projects::GetProjectTool::NAME)
    }

    #[tool(
        description = "Read project metadata and current processes for the effective project scope."
    )]
    async fn get_project_status(
        &self,
        Parameters(_p): Parameters<tools::projects::ProjectScopeParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::projects::GetProjectStatusTool::NAME)
    }

    #[tool(description = "Return CPU and memory usage for project processes.")]
    async fn get_project_stats(
        &self,
        Parameters(_p): Parameters<tools::projects::ProjectScopeParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::projects::GetProjectStatsTool::NAME)
    }

    #[tool(description = "Set or clear the display name for the effective project scope.")]
    async fn rename_project(
        &self,
        Parameters(_p): Parameters<tools::projects::RenameProjectParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::projects::RenameProjectTool::NAME)
    }

    #[tool(
        description = "Add or update Solo MCP docs in CLAUDE.md or AGENTS.md for the effective project scope."
    )]
    async fn setup_agent_integration(
        &self,
        Parameters(_p): Parameters<tools::projects::SetupAgentIntegrationParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::projects::SetupAgentIntegrationTool::NAME)
    }

    // ── Processes ────────────────────────────────────────────────────────

    #[tool(description = "List process entries in the effective project scope.")]
    async fn list_processes(
        &self,
        Parameters(_p): Parameters<tools::projects::ProjectScopeParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::processes::ListProcessesTool::NAME)
    }

    #[tool(
        description = "List configured agent runtimes. Use each returned id as agent_tool_id for spawn_agent."
    )]
    async fn list_agent_tools(
        &self,
        Parameters(_p): Parameters<tools::processes::NoParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::processes::ListAgentToolsTool::NAME)
    }

    #[tool(
        description = "List project-local services detected from running processes. Useful for service discovery, readiness, health, and localhost URL/port lookup."
    )]
    async fn services_list(
        &self,
        Parameters(_p): Parameters<tools::projects::ProjectScopeParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::processes::ServicesListTool::NAME)
    }

    #[tool(
        description = "Preferred tool for creating a new Solo agent. Call list_agent_tools first, then call this, then send the first prompt with send_input."
    )]
    async fn spawn_agent(
        &self,
        Parameters(_p): Parameters<tools::processes::SpawnAgentParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::processes::SpawnAgentTool::NAME)
    }

    #[tool(description = "Generic create/start tool for a new Solo terminal or agent.")]
    async fn spawn_process(
        &self,
        Parameters(_p): Parameters<tools::processes::SpawnProcessParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::processes::SpawnProcessTool::NAME)
    }

    #[tool(description = "Start one existing Solo process entry by name or Solo process ID.")]
    async fn start_process(
        &self,
        Parameters(_p): Parameters<tools::processes::ProcessRefParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::processes::StartProcessTool::NAME)
    }

    #[tool(description = "Gracefully stop one running process.")]
    async fn stop_process(
        &self,
        Parameters(_p): Parameters<tools::processes::ProcessRefParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::processes::StopProcessTool::NAME)
    }

    #[tool(description = "Restart one existing Solo process entry by name or Solo process ID.")]
    async fn restart_process(
        &self,
        Parameters(_p): Parameters<tools::processes::ProcessRefParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::processes::RestartProcessTool::NAME)
    }

    #[tool(
        description = "Start all trusted command processes in the effective project scope. Terminals and agents are skipped."
    )]
    async fn start_all_commands(
        &self,
        Parameters(_p): Parameters<tools::projects::ProjectScopeParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::processes::StartAllCommandsTool::NAME)
    }

    #[tool(
        description = "Gracefully stop all running command processes. Terminals and agents are skipped."
    )]
    async fn stop_all_commands(
        &self,
        Parameters(_p): Parameters<tools::projects::ProjectScopeParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::processes::StopAllCommandsTool::NAME)
    }

    #[tool(
        description = "Restart all trusted command processes. Running commands are stopped first. Terminals and agents are skipped."
    )]
    async fn restart_all_commands(
        &self,
        Parameters(_p): Parameters<tools::projects::ProjectScopeParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::processes::RestartAllCommandsTool::NAME)
    }

    #[tool(
        description = "Remove one stored Solo terminal or Solo agent from the project. Does not apply to command processes; use stop_process or restart_process for those."
    )]
    async fn close_process(
        &self,
        Parameters(_p): Parameters<tools::processes::ProcessRefParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::processes::CloseProcessTool::NAME)
    }

    #[tool(
        description = "Select a process in the Solo UI so its terminal surface is attached and rendered."
    )]
    async fn select_process(
        &self,
        Parameters(_p): Parameters<tools::processes::ProcessRefParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::processes::SelectProcessTool::NAME)
    }

    #[tool(description = "Rename a process in the Solo UI.")]
    async fn rename_process(
        &self,
        Parameters(_p): Parameters<tools::processes::RenameProcessParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::processes::RenameProcessTool::NAME)
    }

    #[tool(description = "Read detailed status for one process.")]
    async fn get_process_status(
        &self,
        Parameters(_p): Parameters<tools::processes::ProcessRefParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::processes::GetProcessStatusTool::NAME)
    }

    #[tool(description = "Return recent rendered terminal output for one process.")]
    async fn get_process_output(
        &self,
        Parameters(_p): Parameters<tools::processes::GetProcessOutputParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::processes::GetProcessOutputTool::NAME)
    }

    #[tool(
        description = "Return recent raw terminal output for one process. Debug view; may include text that was cleared, overwritten, or shown on an alternate screen."
    )]
    async fn get_process_raw_output(
        &self,
        Parameters(_p): Parameters<tools::processes::GetProcessOutputParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::processes::GetProcessRawOutputTool::NAME)
    }

    #[tool(
        description = "Return detected ports and URLs for one process and its children. Useful for localhost URL lookup, service discovery, and readiness checks."
    )]
    async fn get_process_ports(
        &self,
        Parameters(_p): Parameters<tools::processes::ProcessRefParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::processes::GetProcessPortsTool::NAME)
    }

    #[tool(
        description = "Send text or raw bytes to a running process. Text submits Enter by default."
    )]
    async fn send_input(
        &self,
        Parameters(_p): Parameters<tools::processes::SendInputParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::processes::SendInputTool::NAME)
    }

    #[tool(description = "Clear Solo's saved output for one process without touching the PTY.")]
    async fn clear_output(
        &self,
        Parameters(_p): Parameters<tools::processes::ProcessRefParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::processes::ClearOutputTool::NAME)
    }

    #[tool(
        description = "Search rendered terminal output for one process. Returns matching lines with 1-based row numbers."
    )]
    async fn search_output(
        &self,
        Parameters(_p): Parameters<tools::processes::SearchOutputParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::processes::SearchOutputTool::NAME)
    }

    #[tool(
        description = "Search raw terminal output for one process. May match text that has been cleared or overwritten."
    )]
    async fn search_raw_output(
        &self,
        Parameters(_p): Parameters<tools::processes::SearchOutputParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::processes::SearchRawOutputTool::NAME)
    }

    #[tool(
        description = "Wait for a project-local process to expose a bound port. Useful for startup readiness and dev server discovery."
    )]
    async fn wait_for_bound_port(
        &self,
        Parameters(_p): Parameters<tools::processes::WaitForBoundPortParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::processes::WaitForBoundPortTool::NAME)
    }

    // ── Scratchpads ──────────────────────────────────────────────────────

    #[tool(
        description = "Create a scratchpad or replace its content and tags at an expected revision. A leading H1 in the content is treated as the scratchpad title."
    )]
    async fn scratchpad_write(
        &self,
        Parameters(_p): Parameters<tools::scratchpads::ScratchpadWriteParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::scratchpads::ScratchpadWriteTool::NAME)
    }

    #[tool(description = "Read one scratchpad's content, revision, and metadata.")]
    async fn scratchpad_read(
        &self,
        Parameters(_p): Parameters<tools::scratchpads::ScratchpadReadParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::scratchpads::ScratchpadReadTool::NAME)
    }

    #[tool(description = "Append to a scratchpad.")]
    async fn scratchpad_append(
        &self,
        Parameters(_p): Parameters<tools::scratchpads::ScratchpadAppendParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::scratchpads::ScratchpadAppendTool::NAME)
    }

    #[tool(
        description = "Append content under an existing markdown heading. The heading must already exist. Content is inserted before the next same-or-higher-level heading."
    )]
    async fn scratchpad_append_section(
        &self,
        Parameters(_p): Parameters<tools::scratchpads::ScratchpadAppendSectionParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::scratchpads::ScratchpadAppendSectionTool::NAME)
    }

    #[tool(description = "Replace one scratchpad section or line range at an expected revision.")]
    async fn scratchpad_edit(
        &self,
        Parameters(_p): Parameters<tools::scratchpads::ScratchpadEditParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::scratchpads::ScratchpadEditTool::NAME)
    }

    #[tool(description = "List scratchpads in a project without returning their content.")]
    async fn scratchpad_list(
        &self,
        Parameters(_p): Parameters<tools::scratchpads::ScratchpadListParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::scratchpads::ScratchpadListTool::NAME)
    }

    #[tool(
        description = "Search one scratchpad for a literal substring without returning the whole document."
    )]
    async fn scratchpad_find(
        &self,
        Parameters(_p): Parameters<tools::scratchpads::ScratchpadFindParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::scratchpads::ScratchpadFindTool::NAME)
    }

    #[tool(description = "Delete a scratchpad at an expected revision.")]
    async fn scratchpad_delete(
        &self,
        Parameters(_p): Parameters<tools::scratchpads::ScratchpadRevisionParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::scratchpads::ScratchpadDeleteTool::NAME)
    }

    #[tool(description = "Clear a scratchpad's content at an expected revision.")]
    async fn scratchpad_clear(
        &self,
        Parameters(_p): Parameters<tools::scratchpads::ScratchpadRevisionParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::scratchpads::ScratchpadClearTool::NAME)
    }

    #[tool(
        description = "Rename a scratchpad at an expected revision without rewriting its content."
    )]
    async fn scratchpad_rename(
        &self,
        Parameters(_p): Parameters<tools::scratchpads::ScratchpadRenameParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::scratchpads::ScratchpadRenameTool::NAME)
    }

    #[tool(description = "Return the last N lines of one scratchpad.")]
    async fn scratchpad_tail(
        &self,
        Parameters(_p): Parameters<tools::scratchpads::ScratchpadTailParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::scratchpads::ScratchpadTailTool::NAME)
    }

    #[tool(description = "Hide a scratchpad from lists without deleting it.")]
    async fn scratchpad_archive(
        &self,
        Parameters(_p): Parameters<tools::scratchpads::ScratchpadArchiveParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::scratchpads::ScratchpadArchiveTool::NAME)
    }

    #[tool(description = "Add multiple tags to a scratchpad in one revision bump.")]
    async fn scratchpad_add_tags(
        &self,
        Parameters(_p): Parameters<tools::scratchpads::ScratchpadTagsParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::scratchpads::ScratchpadAddTagsTool::NAME)
    }

    #[tool(description = "Remove multiple tags from a scratchpad in one revision bump.")]
    async fn scratchpad_remove_tags(
        &self,
        Parameters(_p): Parameters<tools::scratchpads::ScratchpadTagsParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::scratchpads::ScratchpadRemoveTagsTool::NAME)
    }

    #[tool(description = "List distinct scratchpad tags in a project.")]
    async fn scratchpad_tags_list(
        &self,
        Parameters(_p): Parameters<tools::scratchpads::ProjectScopeOnlyParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::scratchpads::ScratchpadTagsListTool::NAME)
    }

    #[tool(description = "Move a scratchpad to another project at an expected revision.")]
    async fn scratchpad_transfer(
        &self,
        Parameters(_p): Parameters<tools::scratchpads::ScratchpadTransferParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::scratchpads::ScratchpadTransferTool::NAME)
    }

    #[tool(
        description = "Write one scratchpad to a filesystem path as UTF-8 text, including its title as a leading H1."
    )]
    async fn scratchpad_save_to_file(
        &self,
        Parameters(_p): Parameters<tools::scratchpads::ScratchpadSaveToFileParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::scratchpads::ScratchpadSaveToFileTool::NAME)
    }

    #[tool(
        description = "Read UTF-8 text from a filesystem path and create or replace a scratchpad. A leading H1 in the file is treated as the title."
    )]
    async fn scratchpad_load_from_file(
        &self,
        Parameters(_p): Parameters<tools::scratchpads::ScratchpadLoadFromFileParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::scratchpads::ScratchpadLoadFromFileTool::NAME)
    }

    // ── Todos ────────────────────────────────────────────────────────────

    #[tool(description = "Create a project-scoped todo item.")]
    async fn todo_create(
        &self,
        Parameters(_p): Parameters<tools::todos::TodoCreateParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::todos::TodoCreateTool::NAME)
    }

    #[tool(description = "Read one todo and optionally include its comments.")]
    async fn todo_get(
        &self,
        Parameters(_p): Parameters<tools::todos::TodoGetParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::todos::TodoGetTool::NAME)
    }

    #[tool(
        description = "List todos in a project with optional filtering, sorting, and pagination."
    )]
    async fn todo_list(
        &self,
        Parameters(_p): Parameters<tools::todos::TodoListParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::todos::TodoListTool::NAME)
    }

    #[tool(
        description = "Update provided fields on a project-scoped todo item. Omitted optional fields are preserved."
    )]
    async fn todo_update(
        &self,
        Parameters(_p): Parameters<tools::todos::TodoUpdateParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::todos::TodoUpdateTool::NAME)
    }

    #[tool(
        description = "Mark a todo complete or incomplete. Completing releases this actor's lock by default."
    )]
    async fn todo_complete(
        &self,
        Parameters(_p): Parameters<tools::todos::TodoCompleteParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::todos::TodoCompleteTool::NAME)
    }

    #[tool(description = "Delete a project-scoped todo item.")]
    async fn todo_delete(
        &self,
        Parameters(_p): Parameters<tools::todos::TodoIdParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::todos::TodoDeleteTool::NAME)
    }

    #[tool(description = "Add one tag to a todo without replacing other tags.")]
    async fn todo_add_tag(
        &self,
        Parameters(_p): Parameters<tools::todos::TodoTagParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::todos::TodoAddTagTool::NAME)
    }

    #[tool(description = "Remove one tag from a todo without replacing other tags.")]
    async fn todo_remove_tag(
        &self,
        Parameters(_p): Parameters<tools::todos::TodoTagParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::todos::TodoRemoveTagTool::NAME)
    }

    #[tool(description = "List distinct todo tags in a project.")]
    async fn todo_tags_list(
        &self,
        Parameters(_p): Parameters<tools::todos::ProjectScopeOnlyParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::todos::TodoTagsListTool::NAME)
    }

    #[tool(description = "Lock a todo for coordinated editing.")]
    async fn todo_lock(
        &self,
        Parameters(_p): Parameters<tools::todos::TodoLockParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::todos::TodoLockTool::NAME)
    }

    #[tool(description = "Release a todo edit lock you currently own.")]
    async fn todo_unlock(
        &self,
        Parameters(_p): Parameters<tools::todos::TodoUnlockParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::todos::TodoUnlockTool::NAME)
    }

    #[tool(
        description = "Move a todo to another project. Preserves comments and completion state; clears blockers and locks."
    )]
    async fn todo_transfer(
        &self,
        Parameters(_p): Parameters<tools::todos::TodoTransferParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::todos::TodoTransferTool::NAME)
    }

    #[tool(description = "Add one blocker to a todo without replacing other blockers.")]
    async fn todo_add_blocker(
        &self,
        Parameters(_p): Parameters<tools::todos::TodoBlockerParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::todos::TodoAddBlockerTool::NAME)
    }

    #[tool(description = "Remove one blocker from a todo without replacing other blockers.")]
    async fn todo_remove_blocker(
        &self,
        Parameters(_p): Parameters<tools::todos::TodoBlockerParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::todos::TodoRemoveBlockerTool::NAME)
    }

    #[tool(description = "Replace the full blocker list for a todo.")]
    async fn todo_set_blockers(
        &self,
        Parameters(_p): Parameters<tools::todos::TodoSetBlockersParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::todos::TodoSetBlockersTool::NAME)
    }

    #[tool(description = "Add a comment to a todo.")]
    async fn todo_comment_create(
        &self,
        Parameters(_p): Parameters<tools::todos::TodoCommentCreateParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::todos::TodoCommentCreateTool::NAME)
    }

    #[tool(description = "List comments for a todo, optionally paginated.")]
    async fn todo_comment_list(
        &self,
        Parameters(_p): Parameters<tools::todos::TodoCommentListParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::todos::TodoCommentListTool::NAME)
    }

    #[tool(description = "Update a todo comment.")]
    async fn todo_comment_update(
        &self,
        Parameters(_p): Parameters<tools::todos::TodoCommentUpdateParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::todos::TodoCommentUpdateTool::NAME)
    }

    #[tool(description = "Delete a todo comment.")]
    async fn todo_comment_delete(
        &self,
        Parameters(_p): Parameters<tools::todos::TodoCommentDeleteParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::todos::TodoCommentDeleteTool::NAME)
    }

    // ── Locks ────────────────────────────────────────────────────────────

    #[tool(description = "Try to acquire a lease lock. Acquisition is non-blocking.")]
    async fn lock_acquire(
        &self,
        Parameters(_p): Parameters<tools::locks::LockAcquireParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::locks::LockAcquireTool::NAME)
    }

    #[tool(description = "Release a lease lock owned by the current actor.")]
    async fn lock_release(
        &self,
        Parameters(_p): Parameters<tools::locks::LockKeyParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::locks::LockReleaseTool::NAME)
    }

    #[tool(description = "Return the current state of one lease lock.")]
    async fn lock_status(
        &self,
        Parameters(_p): Parameters<tools::locks::LockKeyParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::locks::LockStatusTool::NAME)
    }

    // ── Timers ───────────────────────────────────────────────────────────

    #[tool(
        description = "Schedule a durable timer that delivers a message to a Solo agent process."
    )]
    async fn timer_set(
        &self,
        Parameters(_p): Parameters<tools::timers::TimerSetParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::timers::TimerSetTool::NAME)
    }

    #[tool(description = "List pending timers owned by the current actor.")]
    async fn timer_list(
        &self,
        Parameters(_p): Parameters<tools::timers::TimerListParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::timers::TimerListTool::NAME)
    }

    #[tool(description = "Cancel one pending timer owned by the current actor.")]
    async fn timer_cancel(
        &self,
        Parameters(_p): Parameters<tools::timers::TimerIdParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::timers::TimerCancelTool::NAME)
    }

    #[tool(description = "Pause one pending timer owned by the current actor.")]
    async fn timer_pause(
        &self,
        Parameters(_p): Parameters<tools::timers::TimerIdParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::timers::TimerPauseTool::NAME)
    }

    #[tool(description = "Resume one paused timer owned by the current actor.")]
    async fn timer_resume(
        &self,
        Parameters(_p): Parameters<tools::timers::TimerIdParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::timers::TimerResumeTool::NAME)
    }

    #[tool(
        description = "Schedule a one-shot timer that fires when all watched processes enter idle state, or when max_wait_ms elapses, whichever comes first."
    )]
    async fn timer_fire_when_idle_all(
        &self,
        Parameters(_p): Parameters<tools::timers::TimerFireWhenIdleParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::timers::TimerFireWhenIdleAllTool::NAME)
    }

    #[tool(
        description = "Schedule a one-shot timer that fires when any watched process enters idle state, or when max_wait_ms elapses, whichever comes first."
    )]
    async fn timer_fire_when_idle_any(
        &self,
        Parameters(_p): Parameters<tools::timers::TimerFireWhenIdleParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::timers::TimerFireWhenIdleAnyTool::NAME)
    }

    // ── Prompt Templates ─────────────────────────────────────────────────

    #[tool(
        description = "Create a prompt template. Omit project_id for a global template; pass it to scope the template to a project."
    )]
    async fn create_prompt_template(
        &self,
        Parameters(_p): Parameters<tools::prompt_templates::CreatePromptTemplateParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::prompt_templates::CreatePromptTemplateTool::NAME)
    }

    #[tool(
        description = "Get one prompt template by ID, including parsed placeholders. Updates last_selected."
    )]
    async fn get_prompt_template(
        &self,
        Parameters(_p): Parameters<tools::prompt_templates::TemplateIdParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::prompt_templates::GetPromptTemplateTool::NAME)
    }

    #[tool(
        description = "List prompt templates. Defaults to global templates plus the selected project's pool."
    )]
    async fn list_prompt_templates(
        &self,
        Parameters(_p): Parameters<tools::prompt_templates::ListPromptTemplatesParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::prompt_templates::ListPromptTemplatesTool::NAME)
    }

    #[tool(
        description = "Patch a prompt template's name, description, and/or body. Omitted fields and null values preserve existing values."
    )]
    async fn update_prompt_template(
        &self,
        Parameters(_p): Parameters<tools::prompt_templates::UpdatePromptTemplateParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::prompt_templates::UpdatePromptTemplateTool::NAME)
    }

    #[tool(description = "Delete one prompt template by ID. Bulk delete is not supported via MCP.")]
    async fn delete_prompt_template(
        &self,
        Parameters(_p): Parameters<tools::prompt_templates::TemplateIdParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::prompt_templates::DeletePromptTemplateTool::NAME)
    }

    #[tool(description = "Export prompt templates as Markdown files to a destination directory.")]
    async fn export_prompt_templates(
        &self,
        Parameters(_p): Parameters<tools::prompt_templates::ExportPromptTemplatesParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::prompt_templates::ExportPromptTemplatesTool::NAME)
    }

    // ── Feedback ─────────────────────────────────────────────────────────

    #[tool(
        description = "Open Solo's feedback form with a drafted message for human review and manual submission."
    )]
    async fn submit_solo_feedback(
        &self,
        Parameters(_p): Parameters<tools::feedback::SubmitFeedbackParams>,
    ) -> CallToolResult {
        tools::not_implemented(tools::feedback::SubmitFeedbackTool::NAME)
    }

    // ── Demo: event-bus number odometer ─────────────────────────────────

    #[tool(
        description = "Set the landing-page number odometer to a value and broadcast it on the event bus (topic \"odometer\") to every subscribed frontend."
    )]
    async fn set_odometer(
        &self,
        Parameters(p): Parameters<tools::odometer::SetOdometerParams>,
    ) -> CallToolResult {
        self.bus
            .publish("odometer", serde_json::json!({ "value": p.value }));
        tools::ok(format!("Odometer set to {}", p.value))
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for CcMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
            .with_instructions(
                "Tools on this server are registered against CommandCenter's \
                 Solo-compatible tool surface. Most are stubs that return a 'Not \
                 yet implemented' error; `set_odometer` is live and drives the \
                 landing-page odometer demo over the event bus.",
            )
            .with_server_info(Implementation::new("cc-mcp", env!("CARGO_PKG_VERSION")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tools::odometer::SetOdometerParams;

    #[tokio::test]
    async fn set_odometer_publishes_value_on_topic() {
        let bus = EventBus::default();
        let mut rx = bus.subscribe();
        let server = CcMcpServer::with_bus(bus);

        let result = server
            .set_odometer(Parameters(SetOdometerParams { value: 42.0 }))
            .await;
        assert!(!result.is_error.unwrap_or(false));

        let event = rx.recv().await.expect("event published");
        assert_eq!(event.topic, "odometer");
        assert_eq!(event.data["value"], serde_json::json!(42.0));
    }
}
