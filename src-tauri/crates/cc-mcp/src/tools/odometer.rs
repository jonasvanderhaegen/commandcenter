//! Number-odometer demo tool.
//!
//! Unlike the other tools in this crate, `set_odometer` is implemented: it
//! publishes to the shared event bus (topic `"odometer"`) so the landing-page
//! odometer in the UI animates to the new value over WebSocket/WebTransport.

use schemars::JsonSchema;
use serde::Deserialize;

use super::McpTool;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SetOdometerParams {
    /// Number to display on the landing-page odometer. Broadcast unchanged on
    /// the `"odometer"` topic; the frontend rolls its digits to this value.
    pub value: f64,
}

pub struct SetOdometerTool;
impl McpTool for SetOdometerTool {
    type Params = SetOdometerParams;
    const NAME: &'static str = "set_odometer";
}
