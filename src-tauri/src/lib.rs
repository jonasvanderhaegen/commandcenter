//! Ensemble backend -- the Tauri app and the command surface the UI invokes.
//!
//! This is a skeleton: `list_projects` / `list_processes` return placeholder
//! data, and the mutating verbs (`spawn_process`, `spawn_agent`, ...) are
//! sketched in docs/ARCHITECTURE.md but not wired. The process engine (PTY
//! supervision) is the next layer, not built here.

use serde::Serialize;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![list_projects, list_processes])
        .run(tauri::generate_context!())
        .expect("error while running Ensemble");
}
