pub mod feedback;
pub mod locks;
pub mod odometer;
pub mod processes;
pub mod projects;
pub mod prompt_templates;
pub mod scratchpads;
pub mod session;
pub mod timers;
pub mod todos;

use rmcp::model::{CallToolResult, Content};

/// Compile-time metadata for a single MCP tool.
///
/// # Object safety
/// This trait is NOT object-safe (`type Params` is an associated type).
/// Do NOT use `Box<dyn McpTool>` or `dyn McpTool` anywhere. Each `#[tool]`
/// thunk in `server.rs` calls its concrete struct directly; no dynamic
/// dispatch is needed because the tool set is closed at compile time.
pub trait McpTool {
    /// Deserializable parameter type for this tool.
    type Params: serde::de::DeserializeOwned + Send;
    /// Wire name, must match the `#[tool(name = "...")]` string (or the
    /// derived `snake_case` name when no explicit name is given).
    const NAME: &'static str;
}

/// Return a tool-error result for a stub tool. Every tool in this crate is a
/// stub: the schema is wired up and registered with the MCP router, but the
/// handler has no implementation yet.
#[must_use]
pub fn not_implemented(reason: &str) -> CallToolResult {
    CallToolResult::error(vec![Content::text(format!(
        "Not yet implemented: {reason}"
    ))])
}

/// Return a successful tool result carrying a single line of text. For the
/// handful of tools that are actually implemented (e.g. `odometer`).
#[must_use]
pub fn ok(message: impl Into<String>) -> CallToolResult {
    CallToolResult::success(vec![Content::text(message.into())])
}
