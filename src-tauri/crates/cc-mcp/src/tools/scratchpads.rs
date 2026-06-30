//! Scratchpad tools.

use schemars::JsonSchema;
use serde::Deserialize;

use super::McpTool;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ScratchpadWriteParams {
    /// Scratchpad name.
    pub name: String,
    /// Full content. A leading H1 is treated as the title.
    pub content: String,
    /// ID for updating an existing scratchpad.
    pub scratchpad_id: Option<i64>,
    /// Expected current revision. Omit or set `null` to create a new scratchpad.
    pub expected_revision: Option<i64>,
    /// Optional tag labels applied to the scratchpad.
    pub tags: Option<Vec<String>>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct ScratchpadWriteTool;
impl McpTool for ScratchpadWriteTool {
    type Params = ScratchpadWriteParams;
    const NAME: &'static str = "scratchpad_write";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ScratchpadReadParams {
    /// Scratchpad ID to read.
    pub scratchpad_id: i64,
    /// Read mode: "full"/"content", "headings", "section" (requires `section_heading`).
    pub mode: Option<String>,
    /// Required when `mode="section"`.
    pub section_heading: Option<String>,
    /// Line offset to start reading from (0-indexed).
    pub offset: Option<u32>,
    /// Maximum number of lines to return.
    pub limit: Option<u32>,
    /// When `true`, return raw content text and move revision/url details into `_meta`.
    pub content_only: Option<bool>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct ScratchpadReadTool;
impl McpTool for ScratchpadReadTool {
    type Params = ScratchpadReadParams;
    const NAME: &'static str = "scratchpad_read";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ScratchpadAppendParams {
    /// Scratchpad ID.
    pub scratchpad_id: i64,
    /// Content to append.
    pub content: String,
    /// Optional current revision guard.
    pub expected_revision: Option<i64>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct ScratchpadAppendTool;
impl McpTool for ScratchpadAppendTool {
    type Params = ScratchpadAppendParams;
    const NAME: &'static str = "scratchpad_append";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ScratchpadAppendSectionParams {
    /// Scratchpad ID.
    pub scratchpad_id: i64,
    /// Markdown heading text to append under. Matched case-insensitively.
    pub heading: String,
    /// Content to insert under the heading.
    pub content: String,
    /// Optional current revision guard.
    pub expected_revision: Option<i64>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct ScratchpadAppendSectionTool;
impl McpTool for ScratchpadAppendSectionTool {
    type Params = ScratchpadAppendSectionParams;
    const NAME: &'static str = "scratchpad_append_section";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ScratchpadEditParams {
    /// Scratchpad ID.
    pub scratchpad_id: i64,
    /// Edit target: `{"type": "section", "section_heading": "..."}` or
    /// `{"type": "line_range", "offset": N, "limit": N}`.
    pub target: serde_json::Value,
    /// Replacement content.
    pub content: String,
    /// Current revision guard.
    pub expected_revision: i64,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct ScratchpadEditTool;
impl McpTool for ScratchpadEditTool {
    type Params = ScratchpadEditParams;
    const NAME: &'static str = "scratchpad_edit";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ScratchpadListParams {
    /// Match scratchpads that contain any of these tags.
    pub tags: Option<Vec<String>>,
    /// Zero-based offset into the filtered, name-sorted list.
    pub offset: Option<u32>,
    /// Maximum number of scratchpads to return.
    pub limit: Option<u32>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct ScratchpadListTool;
impl McpTool for ScratchpadListTool {
    type Params = ScratchpadListParams;
    const NAME: &'static str = "scratchpad_list";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ScratchpadFindParams {
    /// Scratchpad ID.
    pub scratchpad_id: i64,
    /// Literal substring to search for. Empty strings are rejected.
    pub query: String,
    /// Search scope: "all", "headings", or "content".
    pub scope: Option<String>,
    /// When `true`, match with exact case.
    pub case_sensitive: Option<bool>,
    /// Maximum matching lines to return. Clamped to 1-100.
    pub limit: Option<u32>,
    /// Surrounding lines to include before/after each match. Clamped to 0-3.
    pub context_lines: Option<u32>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct ScratchpadFindTool;
impl McpTool for ScratchpadFindTool {
    type Params = ScratchpadFindParams;
    const NAME: &'static str = "scratchpad_find";
}

/// Shared by tools that need a scratchpad ID plus a revision guard.
#[derive(Debug, Deserialize, JsonSchema)]
pub struct ScratchpadRevisionParams {
    /// Scratchpad ID.
    pub scratchpad_id: i64,
    /// Current revision guard.
    pub expected_revision: i64,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct ScratchpadDeleteTool;
impl McpTool for ScratchpadDeleteTool {
    type Params = ScratchpadRevisionParams;
    const NAME: &'static str = "scratchpad_delete";
}

pub struct ScratchpadClearTool;
impl McpTool for ScratchpadClearTool {
    type Params = ScratchpadRevisionParams;
    const NAME: &'static str = "scratchpad_clear";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ScratchpadRenameParams {
    /// Scratchpad ID.
    pub scratchpad_id: i64,
    /// New name.
    pub name: String,
    /// Current revision guard.
    pub expected_revision: i64,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct ScratchpadRenameTool;
impl McpTool for ScratchpadRenameTool {
    type Params = ScratchpadRenameParams;
    const NAME: &'static str = "scratchpad_rename";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ScratchpadTailParams {
    /// Scratchpad ID.
    pub scratchpad_id: i64,
    /// Number of trailing lines to return. Pass `0` for an empty response with metadata.
    pub lines: Option<u32>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct ScratchpadTailTool;
impl McpTool for ScratchpadTailTool {
    type Params = ScratchpadTailParams;
    const NAME: &'static str = "scratchpad_tail";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ScratchpadArchiveParams {
    /// Scratchpad ID.
    pub scratchpad_id: i64,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct ScratchpadArchiveTool;
impl McpTool for ScratchpadArchiveTool {
    type Params = ScratchpadArchiveParams;
    const NAME: &'static str = "scratchpad_archive";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ScratchpadTagsParams {
    /// Scratchpad ID.
    pub scratchpad_id: i64,
    /// Tag labels to add or remove.
    pub tags: Vec<String>,
    /// Current revision guard.
    pub expected_revision: i64,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct ScratchpadAddTagsTool;
impl McpTool for ScratchpadAddTagsTool {
    type Params = ScratchpadTagsParams;
    const NAME: &'static str = "scratchpad_add_tags";
}

pub struct ScratchpadRemoveTagsTool;
impl McpTool for ScratchpadRemoveTagsTool {
    type Params = ScratchpadTagsParams;
    const NAME: &'static str = "scratchpad_remove_tags";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ProjectScopeOnlyParams {
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct ScratchpadTagsListTool;
impl McpTool for ScratchpadTagsListTool {
    type Params = ProjectScopeOnlyParams;
    const NAME: &'static str = "scratchpad_tags_list";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ScratchpadTransferParams {
    /// Scratchpad ID.
    pub scratchpad_id: i64,
    /// Destination project ID.
    pub target_project_id: i64,
    /// Expected current revision of the source scratchpad.
    pub expected_revision: i64,
    /// Optional explicit source project scope.
    pub project_id: Option<i64>,
}

pub struct ScratchpadTransferTool;
impl McpTool for ScratchpadTransferTool {
    type Params = ScratchpadTransferParams;
    const NAME: &'static str = "scratchpad_transfer";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ScratchpadSaveToFileParams {
    /// Scratchpad ID.
    pub scratchpad_id: i64,
    /// Filesystem path. Absolute paths used as-is; relative paths resolve inside the project directory.
    pub path: String,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct ScratchpadSaveToFileTool;
impl McpTool for ScratchpadSaveToFileTool {
    type Params = ScratchpadSaveToFileParams;
    const NAME: &'static str = "scratchpad_save_to_file";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ScratchpadLoadFromFileParams {
    /// Scratchpad name.
    pub name: String,
    /// Filesystem path. Absolute paths used as-is; relative paths resolve inside the project directory.
    pub path: String,
    /// ID for updating an existing scratchpad.
    pub scratchpad_id: Option<i64>,
    /// Expected current revision. Omit or set `null` to create a new scratchpad.
    pub expected_revision: Option<i64>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct ScratchpadLoadFromFileTool;
impl McpTool for ScratchpadLoadFromFileTool {
    type Params = ScratchpadLoadFromFileParams;
    const NAME: &'static str = "scratchpad_load_from_file";
}
