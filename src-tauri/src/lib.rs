//! CommandCenter backend -- the Tauri app and the command surface the UI invokes.
//!
//! `list_projects` and friends are backed by the SQLite-backed `store`
//! module. The process engine (PTY supervision via `engine::Supervisor`) is
//! wired below: `spawn_process` / `list_processes` / friends are real,
//! backed by `portable-pty`.

mod credentials;
mod engine;
mod single_instance;
mod store;
mod verify;

use credentials::{CredentialStore, CredentialSummary};
use engine::{
    close_process, get_process_output, list_processes, resize_process, restart_process,
    send_process_input, spawn_process, stop_process, Supervisor, TauriEventSink,
};
use serde::Serialize;
use std::sync::Arc;
use store::{CommandDef, Project, ProjectStore};
use tauri::Manager;
use verify::VerifyResult;

/// Enumerate projects from the SQLite store.
#[tauri::command]
fn list_projects(app: tauri::AppHandle) -> Result<Vec<Project>, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let store = ProjectStore::open(&dir).map_err(|e| e.to_string())?;
    store.list_projects().map_err(|e| e.to_string())
}

#[tauri::command]
fn create_project(app: tauri::AppHandle, name: String, path: String) -> Result<Project, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let store = ProjectStore::open(&dir).map_err(|e| e.to_string())?;
    store
        .create_project(&name, &path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_project(app: tauri::AppHandle, project_id: String) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let store = ProjectStore::open(&dir).map_err(|e| e.to_string())?;
    store.delete_project(&project_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_command_defs(app: tauri::AppHandle, project_id: String) -> Result<Vec<CommandDef>, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let store = ProjectStore::open(&dir).map_err(|e| e.to_string())?;
    store
        .list_command_defs(&project_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn save_command_def(
    app: tauri::AppHandle,
    project_id: String,
    name: String,
    command: Vec<String>,
    cwd: Option<String>,
) -> Result<CommandDef, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let store = ProjectStore::open(&dir).map_err(|e| e.to_string())?;
    store
        .save_command_def(&project_id, &name, &command, cwd.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_command_def(app: tauri::AppHandle, command_def_id: String) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let store = ProjectStore::open(&dir).map_err(|e| e.to_string())?;
    store
        .delete_command_def(&command_def_id)
        .map_err(|e| e.to_string())
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

/// Ports the embedded cc-mcp stub server listens on (loopback only).
const CC_MCP_PORT: u16 = 7080;
const CC_MCP_WEBTRANSPORT_PORT: u16 = 7443;

/// Set once the WebTransport endpoint is actually listening (see
/// `spawn_cc_mcp`). `None` means either it hasn't started yet or it failed
/// to start -- the frontend command below treats both the same way (skip
/// WebTransport, WebSocket still works).
static WEBTRANSPORT_FINGERPRINT: std::sync::OnceLock<String> = std::sync::OnceLock::new();

#[derive(Serialize)]
struct EventBusInfo {
    ws_port: u16,
    webtransport_port: u16,
    /// SHA-256 fingerprint of the WebTransport endpoint's self-signed cert,
    /// hex-formatted, for `serverCertificateHashes` pinning in the frontend
    /// `WebTransport` constructor. `None` until the endpoint is ready.
    webtransport_fingerprint: Option<String>,
}

/// Connection info the frontend needs to reach the event bus: ports plus
/// (once ready) the WebTransport cert fingerprint for pinning.
#[tauri::command]
fn cc_event_bus_info() -> EventBusInfo {
    EventBusInfo {
        ws_port: CC_MCP_PORT,
        webtransport_port: CC_MCP_WEBTRANSPORT_PORT,
        webtransport_fingerprint: WEBTRANSPORT_FINGERPRINT.get().cloned(),
    }
}

/// Start the cc-mcp stub MCP server (HTTP + WebSocket events) and the
/// WebTransport PoC on their own thread/runtime, independent of Tauri's own
/// async runtime. Loopback-only; stdio isn't usable inside a windowed app
/// since stdio is owned by the GUI process, not an MCP client. Both
/// listeners share one `EventBus` so an event published via either
/// transport reaches subscribers on both. A periodic heartbeat event keeps
/// the bus non-empty so the frontend wiring has something to observe before
/// any real feature publishes to it.
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
            rt.block_on(async {
                let bus = cc_mcp::EventBus::default();

                let (ready_tx, ready_rx) = tokio::sync::oneshot::channel();
                tokio::spawn(async move {
                    if let Ok(fingerprint) = ready_rx.await {
                        let _ = WEBTRANSPORT_FINGERPRINT.set(fingerprint);
                    }
                });

                let heartbeat_bus = bus.clone();
                tokio::spawn(async move {
                    let mut ticker = tokio::time::interval(std::time::Duration::from_secs(5));
                    loop {
                        ticker.tick().await;
                        heartbeat_bus
                            .publish("heartbeat", serde_json::json!({ "at": unix_epoch_secs() }));
                    }
                });

                let http =
                    cc_mcp::serve::serve_http_with_bus("127.0.0.1", CC_MCP_PORT, bus.clone());
                let webtransport = cc_mcp::serve_webtransport(
                    "127.0.0.1",
                    CC_MCP_WEBTRANSPORT_PORT,
                    bus,
                    Some(ready_tx),
                );
                tokio::select! {
                    result = http => {
                        if let Err(err) = result {
                            eprintln!("cc-mcp: http server error: {err}");
                        }
                    }
                    result = webtransport => {
                        if let Err(err) = result {
                            eprintln!("cc-mcp: webtransport server error: {err}");
                        }
                    }
                }
            });
        })
        .expect("failed to spawn cc-mcp thread");
}

/// No `chrono`/`time` dependency in this crate yet -- SystemTime is enough
/// for a heartbeat timestamp nobody parses back into a real date type.
fn unix_epoch_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            // Must complete before spawn_cc_mcp(): if a previous instance is
            // still alive when this one tries to bind cc-mcp's fixed ports
            // (7080/7443), the bind fails outright.
            if let Ok(dir) = _app.path().app_data_dir() {
                single_instance::enforce_single_instance(&dir);
            }

            spawn_cc_mcp();

            let sink = Arc::new(TauriEventSink(_app.handle().clone()));
            _app.manage(Supervisor::new(sink));

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
            create_project,
            delete_project,
            list_command_defs,
            save_command_def,
            delete_command_def,
            list_processes,
            spawn_process,
            get_process_output,
            send_process_input,
            resize_process,
            stop_process,
            restart_process,
            close_process,
            save_credential,
            update_credential,
            delete_credential,
            list_credentials,
            import_credential_from_path,
            update_credential_from_path,
            verify_credential,
            cc_event_bus_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running CommandCenter");
}
