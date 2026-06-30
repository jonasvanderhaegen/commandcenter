//! Session & Identity tools.

use schemars::JsonSchema;
use serde::Deserialize;

use super::McpTool;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct WhoamiParams {
    /// Host OS PID fallback. Ignored once already identified as a Solo process.
    pub pid: Option<u32>,
}

pub struct WhoamiTool;
impl McpTool for WhoamiTool {
    type Params = WhoamiParams;
    const NAME: &'static str = "whoami";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct IdentifySessionExternal {
    /// Human-readable display name for this external actor.
    pub name: String,
    /// Short identifier for this external actor.
    pub agent_id: Option<String>,
    /// Arbitrary metadata object.
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct IdentifySessionParams {
    /// This client's own Solo-managed process ID from `SOLO_PROCESS_ID`. Never use to target another process.
    pub solo_process_id: Option<i64>,
    /// Host OS PID fallback. Used only when no explicit identity assertion is provided.
    pub pid: Option<u32>,
    /// External actor details for callers that are not Solo-managed processes.
    pub external: Option<IdentifySessionExternal>,
}

pub struct IdentifySessionTool;
impl McpTool for IdentifySessionTool {
    type Params = IdentifySessionParams;
    const NAME: &'static str = "identify_session";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct HelpParams {
    /// Topic to get help on.
    pub topic: Option<String>,
}

pub struct HelpTool;
impl McpTool for HelpTool {
    type Params = HelpParams;
    const NAME: &'static str = "help";
}
