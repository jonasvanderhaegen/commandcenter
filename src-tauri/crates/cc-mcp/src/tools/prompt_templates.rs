//! Prompt template tools.

use schemars::JsonSchema;
use serde::Deserialize;

use super::McpTool;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreatePromptTemplateParams {
    /// Template name. Must be unique within scope.
    pub name: String,
    /// Markdown prompt body. Saved exactly as provided.
    pub body: String,
    /// Optional plain-text description.
    pub description: Option<String>,
    /// Optional project scope. Omit to create a global template.
    pub project_id: Option<i64>,
}

pub struct CreatePromptTemplateTool;
impl McpTool for CreatePromptTemplateTool {
    type Params = CreatePromptTemplateParams;
    const NAME: &'static str = "create_prompt_template";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TemplateIdParams {
    /// Prompt template ID.
    pub template_id: i64,
}

pub struct GetPromptTemplateTool;
impl McpTool for GetPromptTemplateTool {
    type Params = TemplateIdParams;
    const NAME: &'static str = "get_prompt_template";
}

pub struct DeletePromptTemplateTool;
impl McpTool for DeletePromptTemplateTool {
    type Params = TemplateIdParams;
    const NAME: &'static str = "delete_prompt_template";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ListPromptTemplatesParams {
    /// Case-insensitive substring search over name and description.
    pub query: Option<String>,
    /// Sort order: "picker", "name", "updated", "created", "last_selected".
    pub sort: Option<String>,
    /// Optional project scope to browse a specific project pool.
    pub project_id: Option<i64>,
}

pub struct ListPromptTemplatesTool;
impl McpTool for ListPromptTemplatesTool {
    type Params = ListPromptTemplatesParams;
    const NAME: &'static str = "list_prompt_templates";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct UpdatePromptTemplateParams {
    /// Prompt template ID.
    pub template_id: i64,
    /// New name. Omit or `null` to preserve.
    pub name: Option<String>,
    /// New description. Empty string clears it.
    pub description: Option<String>,
    /// New Markdown body. Empty string clears it.
    pub body: Option<String>,
}

pub struct UpdatePromptTemplateTool;
impl McpTool for UpdatePromptTemplateTool {
    type Params = UpdatePromptTemplateParams;
    const NAME: &'static str = "update_prompt_template";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ExportPromptTemplatesParams {
    /// Prompt template IDs to export.
    pub template_ids: Vec<i64>,
    /// Destination directory. Solo creates it when missing.
    pub destination_dir: String,
}

pub struct ExportPromptTemplatesTool;
impl McpTool for ExportPromptTemplatesTool {
    type Params = ExportPromptTemplatesParams;
    const NAME: &'static str = "export_prompt_templates";
}
