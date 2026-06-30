//! Process tools.

use schemars::JsonSchema;
use serde::Deserialize;

use super::McpTool;
use super::projects::ProjectScopeParams;

pub struct ListProcessesTool;
impl McpTool for ListProcessesTool {
    type Params = ProjectScopeParams;
    const NAME: &'static str = "list_processes";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct NoParams {}

pub struct ListAgentToolsTool;
impl McpTool for ListAgentToolsTool {
    type Params = NoParams;
    const NAME: &'static str = "list_agent_tools";
}

pub struct ServicesListTool;
impl McpTool for ServicesListTool {
    type Params = ProjectScopeParams;
    const NAME: &'static str = "services_list";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SpawnAgentParams {
    /// The agent tool ID to use (from `list_agent_tools`).
    pub agent_tool_id: i64,
    /// Optional custom name for the spawned agent.
    pub name: Option<String>,
    /// Optional per-launch arguments appended to the resolved agent command.
    #[serde(default)]
    pub extra_args: Vec<String>,
    /// Include caller-facing bootstrap instructions in the response.
    pub include_agent_instructions: Option<bool>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct SpawnAgentTool;
impl McpTool for SpawnAgentTool {
    type Params = SpawnAgentParams;
    const NAME: &'static str = "spawn_agent";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SpawnProcessParams {
    /// Kind of process to spawn: "terminal" or "agent".
    pub kind: String,
    /// For agents: the agent tool ID to use. Ignored for terminals.
    pub agent_tool_id: Option<i64>,
    /// Optional custom name for the spawned process.
    pub name: Option<String>,
    /// For agents: optional per-launch arguments. Ignored for terminals.
    #[serde(default)]
    pub extra_args: Vec<String>,
    /// For agents: include caller-facing bootstrap instructions. Ignored for terminals.
    pub include_agent_instructions: Option<bool>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct SpawnProcessTool;
impl McpTool for SpawnProcessTool {
    type Params = SpawnProcessParams;
    const NAME: &'static str = "spawn_process";
}

/// Shared by tools that target one process by ID or name.
#[derive(Debug, Deserialize, JsonSchema)]
pub struct ProcessRefParams {
    /// Solo-managed process ID. Prefer when already known.
    pub process_id: Option<i64>,
    /// Process name. Numeric strings fall back to process IDs.
    pub process_name: Option<String>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

macro_rules! process_ref_tool {
    ($tool:ident, $name:literal) => {
        pub struct $tool;
        impl McpTool for $tool {
            type Params = ProcessRefParams;
            const NAME: &'static str = $name;
        }
    };
}

process_ref_tool!(StartProcessTool, "start_process");
process_ref_tool!(StopProcessTool, "stop_process");
process_ref_tool!(RestartProcessTool, "restart_process");
process_ref_tool!(CloseProcessTool, "close_process");
process_ref_tool!(SelectProcessTool, "select_process");
process_ref_tool!(GetProcessStatusTool, "get_process_status");
process_ref_tool!(GetProcessPortsTool, "get_process_ports");
process_ref_tool!(ClearOutputTool, "clear_output");

pub struct StartAllCommandsTool;
impl McpTool for StartAllCommandsTool {
    type Params = ProjectScopeParams;
    const NAME: &'static str = "start_all_commands";
}

pub struct StopAllCommandsTool;
impl McpTool for StopAllCommandsTool {
    type Params = ProjectScopeParams;
    const NAME: &'static str = "stop_all_commands";
}

pub struct RestartAllCommandsTool;
impl McpTool for RestartAllCommandsTool {
    type Params = ProjectScopeParams;
    const NAME: &'static str = "restart_all_commands";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct RenameProcessParams {
    /// The new process name.
    pub new_name: String,
    /// Solo-managed process ID.
    pub process_id: Option<i64>,
    /// Current process name.
    pub process_name: Option<String>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct RenameProcessTool;
impl McpTool for RenameProcessTool {
    type Params = RenameProcessParams;
    const NAME: &'static str = "rename_process";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct GetProcessOutputParams {
    /// Solo-managed process ID.
    pub process_id: Option<i64>,
    /// Process name.
    pub process_name: Option<String>,
    /// Maximum number of lines to return.
    pub lines: Option<u32>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct GetProcessOutputTool;
impl McpTool for GetProcessOutputTool {
    type Params = GetProcessOutputParams;
    const NAME: &'static str = "get_process_output";
}

pub struct GetProcessRawOutputTool;
impl McpTool for GetProcessRawOutputTool {
    type Params = GetProcessOutputParams;
    const NAME: &'static str = "get_process_raw_output";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SendInputParams {
    /// Solo-managed process ID.
    pub process_id: Option<i64>,
    /// Process name.
    pub process_name: Option<String>,
    /// Text to type. A newline is appended unless `submit=false`. Ignored when `bytes` is provided.
    pub input: Option<String>,
    /// Raw bytes to write to the PTY (e.g. `[3]` for Ctrl+C). When provided, `input` and `submit` are ignored.
    pub bytes: Option<Vec<u8>>,
    /// Whether to press Enter after input text. Ignored when using `bytes`.
    pub submit: Option<bool>,
    /// Time to wait before reading back output. Clamped to 250-10000ms.
    pub wait_ms: Option<u64>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct SendInputTool;
impl McpTool for SendInputTool {
    type Params = SendInputParams;
    const NAME: &'static str = "send_input";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SearchOutputParams {
    /// Pattern to search for (case-insensitive substring match).
    pub pattern: String,
    /// Solo-managed process ID.
    pub process_id: Option<i64>,
    /// Process name.
    pub process_name: Option<String>,
    /// Maximum number of matching lines to return.
    pub max_results: Option<u32>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct SearchOutputTool;
impl McpTool for SearchOutputTool {
    type Params = SearchOutputParams;
    const NAME: &'static str = "search_output";
}

pub struct SearchRawOutputTool;
impl McpTool for SearchRawOutputTool {
    type Params = SearchOutputParams;
    const NAME: &'static str = "search_raw_output";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct WaitForBoundPortParams {
    /// Solo-managed process ID.
    pub process_id: Option<i64>,
    /// Process name.
    pub process_name: Option<String>,
    /// Maximum time to wait in milliseconds.
    pub timeout_ms: Option<u64>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct WaitForBoundPortTool;
impl McpTool for WaitForBoundPortTool {
    type Params = WaitForBoundPortParams;
    const NAME: &'static str = "wait_for_bound_port";
}
