//! Todo tools.

use schemars::JsonSchema;
use serde::Deserialize;

use super::McpTool;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TodoCreateParams {
    /// Todo title.
    pub title: String,
    /// Todo body/description.
    pub body: Option<String>,
    /// Priority: "high", "medium", or "low".
    pub priority: Option<String>,
    /// Optional tag labels.
    pub tags: Option<Vec<String>>,
    /// "slim" returns `{ project_id, todo_id }`; "rich" returns the full todo payload.
    pub response_mode: Option<String>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct TodoCreateTool;
impl McpTool for TodoCreateTool {
    type Params = TodoCreateParams;
    const NAME: &'static str = "todo_create";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TodoGetParams {
    /// Todo ID.
    pub todo_id: i64,
    /// When `true`, include the todo's comments in the response.
    pub include_comments: Option<bool>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct TodoGetTool;
impl McpTool for TodoGetTool {
    type Params = TodoGetParams;
    const NAME: &'static str = "todo_get";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TodoListParams {
    /// Filter by status: "open", "in_progress", "backlog", or "completed".
    pub status: Option<String>,
    /// Filter by completion state.
    pub completed: Option<bool>,
    /// Filter by whether unresolved blockers remain.
    pub is_blocked: Option<bool>,
    /// Filter by priority: "high", "medium", or "low".
    pub priority: Option<String>,
    /// Match todos that contain any of these tags.
    pub tags: Option<Vec<String>>,
    /// Case-insensitive keyword search over title and body.
    pub query: Option<String>,
    /// Sort order.
    pub sort: Option<String>,
    /// Zero-based offset into the filtered list.
    pub offset: Option<u32>,
    /// Maximum number of todos to return.
    pub limit: Option<u32>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct TodoListTool;
impl McpTool for TodoListTool {
    type Params = TodoListParams;
    const NAME: &'static str = "todo_list";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TodoUpdateParams {
    /// Todo ID.
    pub todo_id: i64,
    /// New title. Omit to preserve current.
    pub title: Option<String>,
    /// New body. Omit to preserve current.
    pub body: Option<String>,
    /// New status: "open", "in_progress", "backlog", or "completed".
    pub status: Option<String>,
    /// New priority: "high", "medium", or "low".
    pub priority: Option<String>,
    /// New tag list.
    pub tags: Option<Vec<String>>,
    /// "slim" or "rich".
    pub response_mode: Option<String>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct TodoUpdateTool;
impl McpTool for TodoUpdateTool {
    type Params = TodoUpdateParams;
    const NAME: &'static str = "todo_update";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TodoCompleteParams {
    /// Todo ID.
    pub todo_id: i64,
    /// `true` to complete, `false` to reopen.
    pub completed: bool,
    /// Whether completing should release this actor's todo lock.
    pub release_lock: Option<bool>,
    /// "slim" or "rich".
    pub response_mode: Option<String>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct TodoCompleteTool;
impl McpTool for TodoCompleteTool {
    type Params = TodoCompleteParams;
    const NAME: &'static str = "todo_complete";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TodoIdParams {
    /// Todo ID.
    pub todo_id: i64,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct TodoDeleteTool;
impl McpTool for TodoDeleteTool {
    type Params = TodoIdParams;
    const NAME: &'static str = "todo_delete";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TodoTagParams {
    /// Todo ID.
    pub todo_id: i64,
    /// Tag label to add or remove.
    pub tag: String,
    /// "slim" or "rich".
    pub response_mode: Option<String>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct TodoAddTagTool;
impl McpTool for TodoAddTagTool {
    type Params = TodoTagParams;
    const NAME: &'static str = "todo_add_tag";
}

pub struct TodoRemoveTagTool;
impl McpTool for TodoRemoveTagTool {
    type Params = TodoTagParams;
    const NAME: &'static str = "todo_remove_tag";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ProjectScopeOnlyParams {
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct TodoTagsListTool;
impl McpTool for TodoTagsListTool {
    type Params = ProjectScopeOnlyParams;
    const NAME: &'static str = "todo_tags_list";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TodoLockParams {
    /// Todo ID.
    pub todo_id: i64,
    /// Optional lease duration in seconds.
    pub lease_ttl_seconds: Option<u64>,
    /// "slim" or "rich".
    pub response_mode: Option<String>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct TodoLockTool;
impl McpTool for TodoLockTool {
    type Params = TodoLockParams;
    const NAME: &'static str = "todo_lock";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TodoUnlockParams {
    /// Todo ID.
    pub todo_id: i64,
    /// "slim" or "rich".
    pub response_mode: Option<String>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct TodoUnlockTool;
impl McpTool for TodoUnlockTool {
    type Params = TodoUnlockParams;
    const NAME: &'static str = "todo_unlock";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TodoTransferParams {
    /// Todo ID.
    pub todo_id: i64,
    /// Destination project ID.
    pub target_project_id: i64,
    /// "slim" or "rich".
    pub response_mode: Option<String>,
    /// Optional explicit source project scope.
    pub project_id: Option<i64>,
}

pub struct TodoTransferTool;
impl McpTool for TodoTransferTool {
    type Params = TodoTransferParams;
    const NAME: &'static str = "todo_transfer";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TodoBlockerParams {
    /// Todo ID.
    pub todo_id: i64,
    /// ID of the related blocker todo.
    pub blocker_id: i64,
    /// "slim" or "rich".
    pub response_mode: Option<String>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct TodoAddBlockerTool;
impl McpTool for TodoAddBlockerTool {
    type Params = TodoBlockerParams;
    const NAME: &'static str = "todo_add_blocker";
}

pub struct TodoRemoveBlockerTool;
impl McpTool for TodoRemoveBlockerTool {
    type Params = TodoBlockerParams;
    const NAME: &'static str = "todo_remove_blocker";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TodoSetBlockersParams {
    /// Todo ID.
    pub todo_id: i64,
    /// Complete new list of blocker todo IDs. An empty array clears all blockers.
    #[serde(default)]
    pub blocker_ids: Vec<i64>,
    /// "slim" or "rich".
    pub response_mode: Option<String>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct TodoSetBlockersTool;
impl McpTool for TodoSetBlockersTool {
    type Params = TodoSetBlockersParams;
    const NAME: &'static str = "todo_set_blockers";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TodoCommentCreateParams {
    /// Todo ID.
    pub todo_id: i64,
    /// Comment text.
    pub body: String,
    /// "slim" returns `{ project_id, todo_id, comment_id }"; "rich" returns the full comment payload.
    pub response_mode: Option<String>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct TodoCommentCreateTool;
impl McpTool for TodoCommentCreateTool {
    type Params = TodoCommentCreateParams;
    const NAME: &'static str = "todo_comment_create";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TodoCommentListParams {
    /// Todo ID.
    pub todo_id: i64,
    /// Zero-based offset into the comment list.
    pub offset: Option<u32>,
    /// Maximum number of comments to return.
    pub limit: Option<u32>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct TodoCommentListTool;
impl McpTool for TodoCommentListTool {
    type Params = TodoCommentListParams;
    const NAME: &'static str = "todo_comment_list";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TodoCommentUpdateParams {
    /// Comment ID.
    pub comment_id: i64,
    /// New comment text.
    pub body: String,
    /// "slim" or "rich".
    pub response_mode: Option<String>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct TodoCommentUpdateTool;
impl McpTool for TodoCommentUpdateTool {
    type Params = TodoCommentUpdateParams;
    const NAME: &'static str = "todo_comment_update";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TodoCommentDeleteParams {
    /// Comment ID.
    pub comment_id: i64,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct TodoCommentDeleteTool;
impl McpTool for TodoCommentDeleteTool {
    type Params = TodoCommentDeleteParams;
    const NAME: &'static str = "todo_comment_delete";
}
