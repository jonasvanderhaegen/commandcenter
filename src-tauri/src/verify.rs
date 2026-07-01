//! Free liveness checks for stored provider tokens.
//!
//! Each check is a single cheap read-only API call the provider itself
//! exposes (list-models style endpoints), used only to confirm the token
//! authenticates -- never to consume paid usage. Only known providers are
//! checked; anything else reports `Unknown` rather than guessing an endpoint.
//! The token is passed straight into the outgoing request and never logged,
//! echoed back, or written to disk from here.

use serde::Serialize;

#[derive(Serialize, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum VerifyOutcome {
    Valid,
    Invalid,
    /// The provider name isn't one we know a check endpoint for.
    Unknown,
    /// We knew how to check, but the request itself failed (network, etc.),
    /// as opposed to the provider rejecting the token.
    CheckFailed,
}

#[derive(Serialize)]
pub struct VerifyResult {
    pub outcome: VerifyOutcome,
    pub detail: String,
}

pub async fn verify_provider_token(provider: &str, token: &str) -> VerifyResult {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return VerifyResult {
                outcome: VerifyOutcome::CheckFailed,
                detail: format!("failed to build HTTP client: {e}"),
            }
        }
    };

    let request = match provider.to_lowercase().as_str() {
        // Claude Code's own OAuth session token -- Bearer auth with the
        // oauth-beta header, NOT an x-api-key. Confirmed empirically: a real
        // Claude Code token gets 401 with x-api-key and 200 with this.
        "claude" => client
            .get("https://api.anthropic.com/v1/models")
            .header("Authorization", format!("Bearer {token}"))
            .header("anthropic-version", "2023-06-01")
            .header("anthropic-beta", "oauth-2025-04-20"),
        // A raw Anthropic API key (sk-ant-...), as opposed to a Claude Code
        // OAuth session token -- different credential shape, different auth.
        "anthropic" => client
            .get("https://api.anthropic.com/v1/models")
            .header("x-api-key", token)
            .header("anthropic-version", "2023-06-01"),
        "codex" | "openai" => client
            .get("https://api.openai.com/v1/models")
            .header("Authorization", format!("Bearer {token}")),
        "github" => client
            .get("https://api.github.com/user")
            .header("Authorization", format!("Bearer {token}"))
            .header("User-Agent", "commandcenter"),
        _ => {
            return VerifyResult {
                outcome: VerifyOutcome::Unknown,
                detail: format!("no known verification endpoint for provider '{provider}'"),
            }
        }
    };

    match request.send().await {
        Ok(resp) => {
            let status = resp.status();
            if status.is_success() {
                VerifyResult {
                    outcome: VerifyOutcome::Valid,
                    detail: format!("provider responded {status}"),
                }
            } else if status.as_u16() == 401 || status.as_u16() == 403 {
                VerifyResult {
                    outcome: VerifyOutcome::Invalid,
                    detail: format!("provider rejected the token ({status})"),
                }
            } else {
                VerifyResult {
                    outcome: VerifyOutcome::CheckFailed,
                    detail: format!("unexpected provider response ({status})"),
                }
            }
        }
        Err(e) => VerifyResult {
            outcome: VerifyOutcome::CheckFailed,
            detail: format!("request failed: {e}"),
        },
    }
}
