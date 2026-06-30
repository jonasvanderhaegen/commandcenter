//! Lock tools.

use schemars::JsonSchema;
use serde::Deserialize;

use super::McpTool;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct LockAcquireParams {
    /// Unique key identifying the lock.
    pub lock_key: String,
    /// Lease duration in seconds.
    pub lease_ttl_seconds: u64,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct LockAcquireTool;
impl McpTool for LockAcquireTool {
    type Params = LockAcquireParams;
    const NAME: &'static str = "lock_acquire";
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct LockKeyParams {
    /// Unique key identifying the lock.
    pub lock_key: String,
    /// Optional explicit project scope.
    pub project_id: Option<i64>,
}

pub struct LockReleaseTool;
impl McpTool for LockReleaseTool {
    type Params = LockKeyParams;
    const NAME: &'static str = "lock_release";
}

pub struct LockStatusTool;
impl McpTool for LockStatusTool {
    type Params = LockKeyParams;
    const NAME: &'static str = "lock_status";
}
