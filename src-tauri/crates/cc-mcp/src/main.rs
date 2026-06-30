use anyhow::Result;
use clap::{Parser, ValueEnum};

#[derive(Clone, Copy, Debug, Default, ValueEnum)]
enum Transport {
    #[default]
    Stdio,
    Http,
}

#[derive(Parser, Debug)]
#[command(name = "cc-mcp", about = "MCP server stubs for CommandCenter")]
struct Cli {
    /// Transport: stdio (default) or http
    #[arg(long, value_enum, default_value = "stdio")]
    transport: Transport,
    /// Bind address for HTTP transport
    #[arg(long, default_value = "127.0.0.1")]
    bind: String,
    /// Port for HTTP transport
    #[arg(long, default_value_t = 7080)]
    port: u16,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .init();

    let cli = Cli::parse();
    match cli.transport {
        Transport::Stdio => cc_mcp::serve_stdio().await,
        Transport::Http => cc_mcp::serve_http(&cli.bind, cli.port).await,
    }
}
