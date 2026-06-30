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

/// Serve over HTTP (streamable MCP transport) at `http://{bind}:{port}/mcp`.
/// Runs until the listener errors; intended to be spawned on its own task.
pub async fn serve_http(bind: &str, port: u16) -> Result<()> {
    use rmcp::transport::streamable_http_server::{
        StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
    };
    use std::sync::Arc;

    let service = StreamableHttpService::new(
        || Ok(CcMcpServer::new()),
        Arc::new(LocalSessionManager::default()),
        StreamableHttpServerConfig::default(),
    );

    let addr: std::net::SocketAddr = format!("{bind}:{port}")
        .parse()
        .context("invalid bind/port")?;
    let router = axum::Router::new().nest_service("/mcp", service);
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .with_context(|| format!("failed to bind {addr}"))?;

    tracing::info!("cc-mcp listening on http://{addr}/mcp");
    axum::serve(listener, router)
        .await
        .context("cc-mcp http server error")?;

    Ok(())
}
