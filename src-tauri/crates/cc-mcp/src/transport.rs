//! Stdio transport with automatic framing detection.
//!
//! Supports two MCP framing styles over stdin/stdout:
//!
//! - **Newline-delimited JSON** (Cursor, Claude Code): one JSON object per line.
//! - **Content-Length-framed JSON-RPC** (Codex, OpenCode): LSP-style
//!   `Content-Length: N\r\n\r\n<body>` headers.
//!
//! Framing is detected once from the first non-empty bytes received and locked
//! in for the session. Outgoing messages default to Content-Length framing until
//! the client's style is known.

use std::sync::Arc;

use rmcp::{
    RoleServer,
    service::{RxJsonRpcMessage, TxJsonRpcMessage},
    transport::Transport,
};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
    sync::Mutex,
};

const MAX_BUFFER: usize = 10 * 1024 * 1024; // 10 MiB

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Framing {
    Newline,
    ContentLength,
}

/// Stdio transport that auto-detects MCP framing on the first received bytes.
///
/// Supports newline-delimited JSON (Cursor, Claude Code) and
/// Content-Length-framed JSON-RPC (Codex, `OpenCode`). Framing is detected once
/// and locked in for the session.
pub struct CompatibleStdioTransport<R, W> {
    reader: R,
    writer: Arc<Mutex<W>>,
    buf: Vec<u8>,
    framing: Option<Framing>,
}

impl<R, W> CompatibleStdioTransport<R, W>
where
    R: AsyncRead + Unpin + Send,
    W: AsyncWrite + Unpin + Send + 'static,
{
    pub fn new(reader: R, writer: W) -> Self {
        Self {
            reader,
            writer: Arc::new(Mutex::new(writer)),
            buf: Vec::new(),
            framing: None,
        }
    }
}

// ---------------------------------------------------------------------------
// Framing detection
// ---------------------------------------------------------------------------

fn detect_framing(buf: &[u8]) -> Option<Framing> {
    match buf.first() {
        Some(b'{' | b'[') => Some(Framing::Newline),
        Some(_) if buf.len() >= 14 && buf[..14].eq_ignore_ascii_case(b"content-length") => {
            Some(Framing::ContentLength)
        }
        _ => None,
    }
}

/// Find the end of HTTP-style headers. Returns `(header_end, separator_len)`.
fn find_header_end(buf: &[u8]) -> Option<(usize, usize)> {
    // Prefer \r\n\r\n first (standard LSP), fall back to \n\n.
    if let Some(pos) = find_subsequence(buf, b"\r\n\r\n") {
        return Some((pos, 4));
    }
    if let Some(pos) = find_subsequence(buf, b"\n\n") {
        return Some((pos, 2));
    }
    None
}

fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

/// Parse the `Content-Length` value from the header block (case-insensitive).
fn parse_content_length(header_text: &str) -> Option<usize> {
    for line in header_text.lines() {
        let lower = line.to_ascii_lowercase();
        let trimmed = lower.trim_start();
        if let Some(rest) = trimmed.strip_prefix("content-length") {
            let rest = rest.trim_start_matches(|c: char| c.is_whitespace());
            if let Some(rest) = rest.strip_prefix(':')
                && let Ok(n) = rest.trim().parse::<usize>()
            {
                return Some(n);
            }
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Buffer helpers
// ---------------------------------------------------------------------------

impl<R: AsyncRead + Unpin, W> CompatibleStdioTransport<R, W> {
    /// Read more bytes from the reader into `self.buf`.
    ///
    /// Returns `Ok(true)` when bytes were read, `Ok(false)` on EOF, and
    /// `Err(_)` on I/O errors or buffer-size overflow.
    async fn fill_buf(&mut self) -> std::io::Result<bool> {
        let mut tmp = [0u8; 8192];
        let n = self.reader.read(&mut tmp).await?;
        if n == 0 {
            return Ok(false);
        }
        if self.buf.len() + n > MAX_BUFFER {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("MCP stdio buffer exceeded {MAX_BUFFER} byte limit"),
            ));
        }
        self.buf.extend_from_slice(&tmp[..n]);
        Ok(true)
    }
}

// ---------------------------------------------------------------------------
// Per-framing message readers
// ---------------------------------------------------------------------------

impl<R: AsyncRead + Unpin + Send, W: AsyncWrite + Unpin + Send + 'static>
    CompatibleStdioTransport<R, W>
{
    /// Read one newline-delimited JSON message.
    ///
    /// Skips blank lines; loops back to `fill_buf` when no `\n` is available.
    async fn read_newline_message(&mut self) -> Option<RxJsonRpcMessage<RoleServer>> {
        loop {
            // Scan for a newline in what we have.
            if let Some(nl_pos) = self.buf.iter().position(|&b| b == b'\n') {
                let line_end = if nl_pos > 0 && self.buf[nl_pos - 1] == b'\r' {
                    nl_pos - 1
                } else {
                    nl_pos
                };
                let line = self.buf[..line_end].to_vec();
                self.buf.drain(..=nl_pos);

                if line.iter().all(u8::is_ascii_whitespace) {
                    // Blank line; skip.
                    continue;
                }

                match serde_json::from_slice::<RxJsonRpcMessage<RoleServer>>(&line) {
                    Ok(msg) => return Some(msg),
                    Err(e) => {
                        tracing::error!("failed to parse newline-framed MCP message: {e}");
                        return None;
                    }
                }
            }

            // No newline yet; read more bytes.
            match self.fill_buf().await {
                Ok(true) => {}
                Ok(false) => return None, // EOF
                Err(e) => {
                    tracing::error!("MCP stdio read error: {e}");
                    return None;
                }
            }
        }
    }

    /// Read one Content-Length-framed JSON-RPC message.
    async fn read_content_length_message(&mut self) -> Option<RxJsonRpcMessage<RoleServer>> {
        loop {
            if let Some((header_end, sep_len)) = find_header_end(&self.buf) {
                let header_bytes = self.buf[..header_end].to_vec();
                let header_text = String::from_utf8_lossy(&header_bytes)
                    .replace("\r\n", "\n")
                    .replace('\r', "\n");

                let Some(content_length) = parse_content_length(&header_text) else {
                    tracing::error!("MCP Content-Length message missing Content-Length header");
                    return None;
                };

                if content_length > MAX_BUFFER {
                    tracing::error!(
                        "MCP Content-Length {content_length} exceeds {MAX_BUFFER} byte limit"
                    );
                    return None;
                }

                let body_start = header_end + sep_len;
                let body_end = body_start + content_length;

                // Wait until enough bytes are buffered.
                if self.buf.len() < body_end {
                    match self.fill_buf().await {
                        Ok(true) => {}
                        Ok(false) => return None,
                        Err(e) => {
                            tracing::error!("MCP stdio read error: {e}");
                            return None;
                        }
                    }
                }

                let body = self.buf[body_start..body_end].to_vec();
                self.buf.drain(..body_end);

                match serde_json::from_slice::<RxJsonRpcMessage<RoleServer>>(&body) {
                    Ok(msg) => return Some(msg),
                    Err(e) => {
                        tracing::error!("failed to parse Content-Length-framed MCP message: {e}");
                        return None;
                    }
                }
            }

            // Header not complete yet.
            match self.fill_buf().await {
                Ok(true) => {}
                Ok(false) => return None,
                Err(e) => {
                    tracing::error!("MCP stdio read error: {e}");
                    return None;
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Transport impl
// ---------------------------------------------------------------------------

impl<R, W> Transport<RoleServer> for CompatibleStdioTransport<R, W>
where
    R: AsyncRead + Unpin + Send,
    W: AsyncWrite + Unpin + Send + 'static,
{
    type Error = std::io::Error;

    fn send(
        &mut self,
        item: TxJsonRpcMessage<RoleServer>,
    ) -> impl std::future::Future<Output = Result<(), Self::Error>> + Send + 'static {
        let writer = Arc::clone(&self.writer);
        // Capture framing by value (Copy) so the future is 'static.
        let framing = self.framing;
        async move {
            let body = serde_json::to_vec(&item)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;

            let payload = match framing {
                Some(Framing::Newline) => {
                    let mut p = body;
                    p.push(b'\n');
                    p
                }
                // Default to Content-Length when framing is unknown or detected as CL.
                None | Some(Framing::ContentLength) => {
                    let header = format!("Content-Length: {}\r\n\r\n", body.len());
                    let mut p = header.into_bytes();
                    p.extend_from_slice(&body);
                    p
                }
            };

            let mut w = writer.lock().await;
            w.write_all(&payload).await?;
            w.flush().await
        }
    }

    async fn receive(&mut self) -> Option<RxJsonRpcMessage<RoleServer>> {
        // Detect framing from the first non-empty data.
        while self.framing.is_none() {
            if let Some(f) = detect_framing(&self.buf) {
                self.framing = Some(f);
                break;
            }
            match self.fill_buf().await {
                Ok(true) => {}
                _ => return None,
            }
        }

        match self.framing {
            Some(Framing::Newline) => self.read_newline_message().await,
            Some(Framing::ContentLength) | None => self.read_content_length_message().await,
        }
    }

    async fn close(&mut self) -> Result<(), Self::Error> {
        let mut w = self.writer.lock().await;
        w.shutdown().await
    }
}
