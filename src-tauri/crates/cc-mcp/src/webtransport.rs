//! WebTransport (HTTP/3 over QUIC) proof of concept for the event bus.
//!
//! Same subscribe/unsubscribe + broadcast-filter design as `ws.rs`, over a
//! QUIC bidirectional stream instead of a WebSocket. QUIC streams are raw
//! byte streams with no built-in framing, so messages are newline-delimited
//! JSON (one `ClientMessage`/`Event` per line) rather than WebSocket's
//! built-in message framing.
//!
//! WebTransport requires TLS even for localhost-only use -- browsers won't
//! open a WebTransport session over plaintext. There's no CA-signed cert for
//! a local dev server, so this generates a self-signed identity on startup;
//! a real client (browser or otherwise) must be told to trust it explicitly
//! (e.g. Chrome's `--origin-to-force-quic-on` + cert fingerprint pinning, or
//! `serverCertificateHashes` in the WebTransport JS constructor). That
//! trust-on-first-use handshake is the PoC's rough edge, not a bug -- it's
//! inherent to self-signed WebTransport and is what a real deployment would
//! replace with a properly issued certificate.

use std::time::Duration;

use anyhow::{Context, Result};
use tokio::io::{AsyncBufReadExt, BufReader};
use wtransport::{Endpoint, Identity, ServerConfig};

use crate::events::{EventBus, Subscriptions};

const KEEPALIVE_INTERVAL: Duration = Duration::from_secs(30);

/// Serve the event bus over WebTransport on `bind:port` (UDP) until the
/// endpoint errors. Intended to be spawned on its own task, same as
/// `serve_http`. This loops forever accepting sessions on success, so it
/// never returns during normal operation -- `on_ready` is how the caller
/// learns the self-signed cert's SHA-256 fingerprint (hex) for client-side
/// pinning, since a return value would never arrive.
pub async fn serve_webtransport(
    bind: &str,
    port: u16,
    bus: EventBus,
    on_ready: Option<tokio::sync::oneshot::Sender<String>>,
) -> Result<()> {
    let identity = Identity::self_signed(["localhost", "127.0.0.1", "::1"])
        .context("failed to generate self-signed WebTransport identity")?;
    // Lowercase hex of the raw 32 bytes -- a format the frontend can parse
    // deterministically into a Uint8Array for `serverCertificateHashes`,
    // unlike Sha256Digest's Debug/Display output which isn't a contract.
    let digest: [u8; 32] = *identity.certificate_chain().as_slice()[0].hash().as_ref();
    let fingerprint = digest
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();

    let config = ServerConfig::builder()
        .with_bind_address(
            format!("{bind}:{port}")
                .parse()
                .context("invalid bind/port")?,
        )
        .with_identity(identity)
        .build();

    let server = Endpoint::server(config).context("failed to start WebTransport endpoint")?;
    tracing::info!(
        "cc-mcp WebTransport listening on https://{bind}:{port} (fingerprint {fingerprint})"
    );
    if let Some(tx) = on_ready {
        let _ = tx.send(fingerprint);
    }

    loop {
        let incoming = server.accept().await;
        let bus = bus.clone();
        tokio::spawn(async move {
            if let Err(err) = handle_session(incoming, bus).await {
                tracing::warn!("WebTransport session error: {err:#}");
            }
        });
    }
}

async fn handle_session(
    incoming: wtransport::endpoint::IncomingSession,
    bus: EventBus,
) -> Result<()> {
    let session_request = incoming.await.context("WebTransport handshake failed")?;
    let connection = session_request
        .accept()
        .await
        .context("failed to accept WebTransport session")?;

    // PoC protocol: the client opens exactly one bidirectional stream and
    // sends/receives newline-delimited JSON on it, same message shapes as
    // the WebSocket transport.
    let (send, recv) = connection
        .accept_bi()
        .await
        .context("client never opened a bidirectional stream")?;

    let mut writer = send;
    let mut lines = BufReader::new(recv).lines();
    let mut events = bus.subscribe();
    let mut subs = Subscriptions::default();
    let mut keepalive = tokio::time::interval(KEEPALIVE_INTERVAL);
    // See the matching comment in ws.rs: interval()'s first tick fires
    // immediately, so consume it up front.
    keepalive.tick().await;

    loop {
        tokio::select! {
            line = lines.next_line() => {
                let Ok(Some(text)) = line else { break };
                subs.apply(&text);
            }
            event = events.recv() => {
                let Ok(event) = event else { break };
                if !subs.contains(&event.topic) { continue; }
                let Ok(mut payload) = serde_json::to_string(&event) else { continue };
                payload.push('\n');
                if writer.write_all(payload.as_bytes()).await.is_err() { break; }
            }
            _ = keepalive.tick() => {
                if writer.write_all(b"\n").await.is_err() { break; }
            }
        }
    }

    Ok(())
}
