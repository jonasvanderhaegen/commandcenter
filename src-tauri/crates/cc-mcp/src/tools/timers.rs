//! Timer tools.

use schemars::JsonSchema;
use serde::Deserialize;

use super::McpTool;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TimerSetParams {
    /// Delay before the timer fires, in milliseconds.
    pub delay_ms: u64,
    /// Message injected verbatim into the delivery process PTY as a fresh user turn.
    pub body: String,
    /// When `true`, repeat using the same interval as `delay_ms`.
    #[serde(rename = "loop")]
    pub loop_: Option<bool>,
    /// Optional explicit repeat interval in milliseconds. Omit for a one-shot timer.
    pub repeat_every_ms: Option<u64>,
    /// Solo agent process to deliver the body to. Defaults to this session's own Solo agent.
    pub delivery_process_id: Option<i64>,
    /// Arbitrary metadata object.
    pub metadata: Option<serde_json::Value>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct TimerSetTool;
impl McpTool for TimerSetTool {
    type Params = TimerSetParams;
    const NAME: &'static str = "timer_set";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TimerListParams {
    /// Maximum number of timers to return.
    pub limit: Option<u32>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct TimerListTool;
impl McpTool for TimerListTool {
    type Params = TimerListParams;
    const NAME: &'static str = "timer_list";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TimerIdParams {
    /// Timer ID.
    pub timer_id: i64,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct TimerCancelTool;
impl McpTool for TimerCancelTool {
    type Params = TimerIdParams;
    const NAME: &'static str = "timer_cancel";
}

pub struct TimerPauseTool;
impl McpTool for TimerPauseTool {
    type Params = TimerIdParams;
    const NAME: &'static str = "timer_pause";
}

pub struct TimerResumeTool;
impl McpTool for TimerResumeTool {
    type Params = TimerIdParams;
    const NAME: &'static str = "timer_resume";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct TimerFireWhenIdleParams {
    /// One or more processes to monitor: a raw process ID, a process name, or an
    /// object with `process_id`/`process_name` fields.
    pub processes: Vec<serde_json::Value>,
    /// Maximum wait in milliseconds before firing regardless of idle state.
    pub max_wait_ms: u64,
    /// Message injected verbatim into the delivery process PTY.
    pub body: String,
    /// Solo agent process that receives the body. Defaults to this session's own agent.
    pub delivery_process_id: Option<i64>,
    /// Arbitrary metadata object.
    pub metadata: Option<serde_json::Value>,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct TimerFireWhenIdleAllTool;
impl McpTool for TimerFireWhenIdleAllTool {
    type Params = TimerFireWhenIdleParams;
    const NAME: &'static str = "timer_fire_when_idle_all";
}

pub struct TimerFireWhenIdleAnyTool;
impl McpTool for TimerFireWhenIdleAnyTool {
    type Params = TimerFireWhenIdleParams;
    const NAME: &'static str = "timer_fire_when_idle_any";
}
