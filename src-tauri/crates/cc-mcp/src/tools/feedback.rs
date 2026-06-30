//! Feedback tools.

use schemars::JsonSchema;
use serde::Deserialize;

use super::McpTool;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SubmitFeedbackParams {
    /// Feedback about the application itself. Include concrete bugs, friction, or feature requests.
    pub message: String,
    /// Optional email for follow-up.
    pub email: Option<String>,
    /// When `true`, append MCP session and process context to the submitted message.
    pub include_context: Option<bool>,
}

pub struct SubmitFeedbackTool;
impl McpTool for SubmitFeedbackTool {
    type Params = SubmitFeedbackParams;
    const NAME: &'static str = "submit_solo_feedback";
}
