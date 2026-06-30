//! Project tools.

use schemars::JsonSchema;
use serde::Deserialize;

use super::McpTool;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct NoParams {}

pub struct ListProjectsTool;
impl McpTool for ListProjectsTool {
    type Params = NoParams;
    const NAME: &'static str = "list_projects";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SelectProjectParams {
    /// The project ID to select for this session.
    pub project_id: i64,
}

pub struct SelectProjectTool;
impl McpTool for SelectProjectTool {
    type Params = SelectProjectParams;
    const NAME: &'static str = "select_project";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateProjectParams {
    /// Existing local directory to register or import as a Solo project.
    pub path: String,
    /// Optional stored project name. Ignored when the canonical path is already registered.
    pub name: Option<String>,
}

pub struct CreateProjectTool;
impl McpTool for CreateProjectTool {
    type Params = CreateProjectParams;
    const NAME: &'static str = "create_project";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct DeleteProjectParams {
    /// Required confirmation that this call should delete the project.
    #[serde(default)]
    pub confirm_delete: bool,
    /// Required when the project has running, starting, or stopping processes.
    #[serde(default)]
    pub confirm_stop_running: bool,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
    /// What to do with project-scoped prompt templates: "delete" or "convert_to_global".
    pub prompt_template_policy: Option<String>,
}

pub struct DeleteProjectTool;
impl McpTool for DeleteProjectTool {
    type Params = DeleteProjectParams;
    const NAME: &'static str = "delete_project";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ProjectScopeParams {
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct GetProjectTool;
impl McpTool for GetProjectTool {
    type Params = ProjectScopeParams;
    const NAME: &'static str = "get_project";
}

pub struct GetProjectStatusTool;
impl McpTool for GetProjectStatusTool {
    type Params = ProjectScopeParams;
    const NAME: &'static str = "get_project_status";
}

pub struct GetProjectStatsTool;
impl McpTool for GetProjectStatsTool {
    type Params = ProjectScopeParams;
    const NAME: &'static str = "get_project_stats";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct RenameProjectParams {
    /// Display name to set. Pass `null` to clear the custom display name.
    pub display_name: Option<String>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct RenameProjectTool;
impl McpTool for RenameProjectTool {
    type Params = RenameProjectParams;
    const NAME: &'static str = "rename_project";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SetupAgentIntegrationParams {
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
    /// Target file: "claude" (CLAUDE.md) or "agents" (AGENTS.md).
    pub target: Option<String>,
}

pub struct SetupAgentIntegrationTool;
impl McpTool for SetupAgentIntegrationTool {
    type Params = SetupAgentIntegrationParams;
    const NAME: &'static str = "setup_agent_integration";
}
