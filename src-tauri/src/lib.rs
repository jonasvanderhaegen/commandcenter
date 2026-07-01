//! CommandCenter backend -- the Tauri app and the command surface the UI invokes.
//!
//! This is a skeleton: `list_projects` / `list_processes` return placeholder
//! data, and the mutating verbs (`spawn_process`, `spawn_agent`, ...) are
//! sketched in docs/ARCHITECTURE.md but not wired. The process engine (PTY
//! supervision) is the next layer, not built here.

mod credentials;
mod verify;

use credentials::{CredentialStore, CredentialSummary};
use serde::Serialize;
use tauri::Manager;
use verify::VerifyResult;

#[derive(Serialize)]
pub struct Project {
    pub id: String,
    pub name: String,
}

#[derive(Serialize)]
pub struct Process {
    pub id: String,
    pub name: String,
    pub status: String,
}

/// Enumerate projects. Placeholder until a store exists.
#[tauri::command]
fn list_projects() -> Vec<Project> {
    vec![Project {
        id: "demo".into(),
        name: "demo".into(),
    }]
}

/// Processes within a project. Placeholder until the engine exists.
#[tauri::command]
fn list_processes(project_id: String) -> Vec<Process> {
    let _ = project_id;
    vec![Process {
        id: "shell".into(),
        name: "zsh".into(),
        status: "idle".into(),
    }]
}

/// Provider tokens (Claude, Codex, ...) that CommandCenter can spawn sessions
/// with. The token value itself never crosses the IPC boundary to the
/// frontend -- only id/provider/account do. Neither provider nor account is
/// unique on its own (multiple accounts per provider, or in principle
/// multiple tokens per account); each entry is addressed by its own id.
#[tauri::command]
fn save_credential(
    app: tauri::AppHandle,
    provider: String,
    account: String,
    token: String,
    expires_at: Option<String>,
) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let store = CredentialStore::open(&dir).map_err(|e| e.to_string())?;
    store
        .add(&provider, &account, &token, expires_at.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn update_credential(
    app: tauri::AppHandle,
    id: String,
    token: String,
    expires_at: Option<String>,
) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let store = CredentialStore::open(&dir).map_err(|e| e.to_string())?;
    store
        .update_token(&id, &token, expires_at.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_credential(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let store = CredentialStore::open(&dir).map_err(|e| e.to_string())?;
    store.delete(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_credentials(app: tauri::AppHandle) -> Result<Vec<CredentialSummary>, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let store = CredentialStore::open(&dir).map_err(|e| e.to_string())?;
    store.list().map_err(|e| e.to_string())
}

#[tauri::command]
fn import_credential_from_path(
    app: tauri::AppHandle,
    provider: String,
    account: String,
    path: String,
    expires_at: Option<String>,
) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let store = CredentialStore::open(&dir).map_err(|e| e.to_string())?;
    store
        .add_from_file(
            &provider,
            &account,
            std::path::Path::new(&path),
            expires_at.as_deref(),
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn update_credential_from_path(
    app: tauri::AppHandle,
    id: String,
    path: String,
    expires_at: Option<String>,
) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let store = CredentialStore::open(&dir).map_err(|e| e.to_string())?;
    store
        .update_token_from_file(&id, std::path::Path::new(&path), expires_at.as_deref())
        .map_err(|e| e.to_string())
}
/// Load the decrypted token for `id` internally and check it against the
/// provider's own API (a cheap read-only endpoint, never a paid call).
/// Only the outcome/detail cross back to the frontend -- the token itself
/// never leaves this function.
#[tauri::command]
async fn verify_credential(app: tauri::AppHandle, id: String) -> Result<VerifyResult, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let store = CredentialStore::open(&dir).map_err(|e| e.to_string())?;
    let entries = store.list().map_err(|e| e.to_string())?;
    let Some(entry) = entries.into_iter().find(|e| e.id == id) else {
        return Err(format!("no stored credential with id '{id}'"));
    };
    let Some(token) = store.load(&id).map_err(|e| e.to_string())? else {
        return Err(format!("no stored credential with id '{id}'"));
    };
    Ok(verify::verify_provider_token(&entry.provider, &token).await)
}

/// Round the macOS window's corners. The window is frameless + transparent, so
/// rounding the content view's layer (with masksToBounds) rounds all four
/// corners of the actual window. CSS `border-radius` can't: the page is the
/// scroll container, so it would only round the (scrolling) content box, not
/// the fixed window frame. Uses objc2 (the crates Tauri already pulls in).
#[cfg(target_os = "macos")]
fn round_window_corners(window: &tauri::WebviewWindow, radius: f64) {
    use objc2_app_kit::NSWindow;

    let Ok(ptr) = window.ns_window() else {
        return;
    };
    let ns_window: &NSWindow = unsafe { &*ptr.cast::<NSWindow>() };
    let Some(view) = ns_window.contentView() else {
        return;
    };
    view.setWantsLayer(true);
    if let Some(layer) = view.layer() {
        layer.setCornerRadius(radius);
        layer.setMasksToBounds(true);
    }
}

/// Port the embedded cc-mcp stub server listens on (loopback only).
const CC_MCP_PORT: u16 = 7080;

/// Start the cc-mcp stub MCP server on its own thread/runtime, independent of
/// Tauri's own async runtime. Loopback-only HTTP; stdio isn't usable inside a
/// windowed app since stdio is owned by the GUI process, not an MCP client.
fn spawn_cc_mcp() {
    std::thread::Builder::new()
        .name("cc-mcp".into())
        .spawn(|| {
            let rt = match tokio::runtime::Runtime::new() {
                Ok(rt) => rt,
                Err(err) => {
                    eprintln!("cc-mcp: failed to start runtime: {err}");
                    return;
                }
            };
            if let Err(err) = rt.block_on(cc_mcp::serve_http("127.0.0.1", CC_MCP_PORT)) {
                eprintln!("cc-mcp: server error: {err}");
            }
        })
        .expect("failed to spawn cc-mcp thread");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            spawn_cc_mcp();

            #[cfg(target_os = "macos")]
            {
                use tauri::Manager;
                if let Some(window) = _app.get_webview_window("main") {
                    // ~12px to match the nav bar's pill radius.
                    round_window_corners(&window, 12.0);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_projects,
            list_processes,
            save_credential,
            update_credential,
            delete_credential,
            list_credentials,
            import_credential_from_path,
            update_credential_from_path,
            verify_credential
        ])
        .run(tauri::generate_context!())
        .expect("error while running CommandCenter");
}
