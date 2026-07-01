//! Entry points for running [`CcMcpServer`] over stdio or HTTP. Shared by the
//! `cc-mcp` CLI binary and by host applications (e.g. the Tauri app) that
//! embed the server directly.

use anyhow::{Context, Result};
use rmcp::ServiceExt;

use crate::CcMcpServer;

/// Serve over stdio until the peer closes the connection.
pub async fn serve_stdio() -> Result<()> {
    let stdin = tokio::io::stdin();
    let stdout = tokio::io::stdout();
    let transport = crate::transport::CompatibleStdioTransport::new(stdin, stdout);

    CcMcpServer::new()
        .serve(transport)
        .await
        .context("cc-mcp stdio server error")?
        .waiting()
        .await
        .context("cc-mcp stdio server join error")?;

    Ok(())
}

/// Serve over HTTP (streamable MCP transport at `/mcp`, WebSocket event bus
/// at `/ws/events`). Runs until the listener errors; intended to be spawned
/// on its own task.
pub async fn serve_http(bind: &str, port: u16) -> Result<()> {
    serve_http_with_bus(bind, port, crate::EventBus::default()).await
}

/// Same as [`serve_http`], but with a caller-supplied [`EventBus`] so the
/// HTTP and WebTransport listeners can share one bus (see
/// [`serve_webtransport`]).
pub async fn serve_http_with_bus(bind: &str, port: u16, bus: crate::EventBus) -> Result<()> {
    use rmcp::transport::streamable_http_server::{
        StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
    };
    use std::sync::Arc;

    // Build each MCP session's server with the shared bus so tool calls (e.g.
    // set_odometer) publish to the same subscribers as /ws/events and the
    // WebTransport endpoint.
    let mcp_bus = bus.clone();
    let service = StreamableHttpService::new(
        move || Ok(CcMcpServer::with_bus(mcp_bus.clone())),
        Arc::new(LocalSessionManager::default()),
        StreamableHttpServerConfig::default(),
    );

    let addr: std::net::SocketAddr = format!("{bind}:{port}")
        .parse()
        .context("invalid bind/port")?;
    let router = axum::Router::new()
        .nest_service("/mcp", service)
        .route(
            "/ws/events",
            axum::routing::get(crate::ws::ws_events_handler),
        )
        .with_state(bus);
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .with_context(|| format!("failed to bind {addr}"))?;

    tracing::info!("cc-mcp listening on http://{addr}/mcp (events: ws://{addr}/ws/events)");
    axum::serve(listener, router)
        .await
        .context("cc-mcp http server error")?;

    Ok(())
}

/// WebTransport PoC event-bus endpoint; see [`crate::webtransport`] for the
/// protocol and self-signed-cert caveats. Intended to be spawned on its own
/// task alongside [`serve_http_with_bus`], sharing the same [`EventBus`] so
/// events published by either transport reach subscribers on both. Loops
/// forever on success; `on_ready` delivers the cert fingerprint once the
/// endpoint is actually listening.
pub async fn serve_webtransport(
    bind: &str,
    port: u16,
    bus: crate::EventBus,
    on_ready: Option<tokio::sync::oneshot::Sender<String>>,
) -> Result<()> {
    crate::webtransport::serve_webtransport(bind, port, bus, on_ready).await
}
