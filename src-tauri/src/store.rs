//! SQLite-backed store for Projects and per-project saved CommandDefs.
//!
//! Wave 1 scope only: projects and command defs. Processes are runtime state
//! owned by the engine lane and are not persisted here (see CONTRACT pad).
//! Schema is migrated via `PRAGMA user_version`, so `open` is safe to call
//! repeatedly (e.g. once per command invocation, matching credentials.rs).

use std::path::Path;

use anyhow::{Context, Result};
use rand::RngCore;
use rusqlite::Connection;
use serde::Serialize;

const DB_FILE: &str = "commandcenter.db";
const SCHEMA_VERSION: i64 = 1;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandDef {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub command: Vec<String>,
    pub cwd: Option<String>,
}

pub struct ProjectStore {
    conn: Connection,
}

impl ProjectStore {
    /// Open (creating if needed) the store rooted at `app_data_dir`, running
    /// any pending schema migrations.
    pub fn open(app_data_dir: &Path) -> Result<Self> {
        std::fs::create_dir_all(app_data_dir).context("failed to create app data dir")?;
        let conn = Connection::open(app_data_dir.join(DB_FILE)).context("failed to open db")?;
        conn.execute("PRAGMA foreign_keys = ON", [])
            .context("failed to enable foreign keys")?;
        migrate(&conn)?;
        Ok(Self { conn })
    }

    pub fn list_projects(&self) -> Result<Vec<Project>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, path FROM projects ORDER BY name")?;
        let rows = stmt.query_map([], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
            })
        })?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .context("failed to list projects")
    }

    pub fn create_project(&self, name: &str, path: &str) -> Result<Project> {
        let id = new_id();
        self.conn.execute(
            "INSERT INTO projects (id, name, path) VALUES (?1, ?2, ?3)",
            (&id, name, path),
        )?;
        Ok(Project {
            id,
            name: name.to_string(),
            path: path.to_string(),
        })
    }

    pub fn delete_project(&self, project_id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM projects WHERE id = ?1", [project_id])?;
        Ok(())
    }

    pub fn list_command_defs(&self, project_id: &str) -> Result<Vec<CommandDef>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, project_id, name, command_json, cwd FROM command_defs
             WHERE project_id = ?1 ORDER BY name",
        )?;
        let rows = stmt.query_map([project_id], row_to_command_def)?;
        rows.collect::<rusqlite::Result<Vec<_>>>()
            .context("failed to list command defs")
    }

    pub fn save_command_def(
        &self,
        project_id: &str,
        name: &str,
        command: &[String],
        cwd: Option<&str>,
    ) -> Result<CommandDef> {
        let id = new_id();
        let command_json = serde_json::to_string(command).context("failed to encode command")?;
        self.conn.execute(
            "INSERT INTO command_defs (id, project_id, name, command_json, cwd)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            (&id, project_id, name, &command_json, &cwd),
        )?;
        Ok(CommandDef {
            id,
            project_id: project_id.to_string(),
            name: name.to_string(),
            command: command.to_vec(),
            cwd: cwd.map(str::to_string),
        })
    }

    pub fn delete_command_def(&self, command_def_id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM command_defs WHERE id = ?1", [command_def_id])?;
        Ok(())
    }
}

fn row_to_command_def(row: &rusqlite::Row) -> rusqlite::Result<CommandDef> {
    let command_json: String = row.get(3)?;
    let command: Vec<String> = serde_json::from_str(&command_json).map_err(|e| {
        rusqlite::Error::FromSqlConversionFailure(3, rusqlite::types::Type::Text, Box::new(e))
    })?;
    Ok(CommandDef {
        id: row.get(0)?,
        project_id: row.get(1)?,
        name: row.get(2)?,
        command,
        cwd: row.get(4)?,
    })
}

fn migrate(conn: &Connection) -> Result<()> {
    let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    if version < SCHEMA_VERSION {
        conn.execute_batch(
            "BEGIN;
             CREATE TABLE IF NOT EXISTS projects (
                 id TEXT PRIMARY KEY,
                 name TEXT NOT NULL,
                 path TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS command_defs (
                 id TEXT PRIMARY KEY,
                 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                 name TEXT NOT NULL,
                 command_json TEXT NOT NULL,
                 cwd TEXT
             );
             PRAGMA user_version = 1;
             COMMIT;",
        )
        .context("failed to run schema migration")?;
    }
    Ok(())
}

fn new_id() -> String {
    let mut bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(label: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("cc-store-test-{label}-{nanos}"));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn project_roundtrip() {
        let dir = temp_dir("project-roundtrip");
        let store = ProjectStore::open(&dir).unwrap();

        assert!(store.list_projects().unwrap().is_empty());

        let created = store.create_project("demo", "/tmp/demo").unwrap();
        assert_eq!(created.name, "demo");
        assert_eq!(created.path, "/tmp/demo");

        let listed = store.list_projects().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, created.id);

        store.delete_project(&created.id).unwrap();
        assert!(store.list_projects().unwrap().is_empty());
    }

    #[test]
    fn command_def_roundtrip() {
        let dir = temp_dir("command-def-roundtrip");
        let store = ProjectStore::open(&dir).unwrap();
        let project = store.create_project("demo", "/tmp/demo").unwrap();

        assert!(store.list_command_defs(&project.id).unwrap().is_empty());

        let command = vec!["npm".to_string(), "run".to_string(), "dev".to_string()];
        let saved = store
            .save_command_def(&project.id, "dev server", &command, Some("/tmp/demo"))
            .unwrap();
        assert_eq!(saved.command, command);
        assert_eq!(saved.cwd.as_deref(), Some("/tmp/demo"));

        let listed = store.list_command_defs(&project.id).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].command, command);

        store.delete_command_def(&saved.id).unwrap();
        assert!(store.list_command_defs(&project.id).unwrap().is_empty());
    }

    #[test]
    fn command_def_cascades_on_project_delete() {
        let dir = temp_dir("cascade");
        let store = ProjectStore::open(&dir).unwrap();
        let project = store.create_project("demo", "/tmp/demo").unwrap();
        store
            .save_command_def(&project.id, "dev", &["echo".to_string()], None)
            .unwrap();

        store.delete_project(&project.id).unwrap();
        assert!(store.list_command_defs(&project.id).unwrap().is_empty());
    }

    #[test]
    fn migration_runs_twice_safely() {
        let dir = temp_dir("migrate-twice");
        {
            let store = ProjectStore::open(&dir).unwrap();
            store.create_project("demo", "/tmp/demo").unwrap();
        }
        // Re-opening re-runs migrate() against an already-migrated DB.
        let store = ProjectStore::open(&dir).unwrap();
        let listed = store.list_projects().unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "demo");
    }
}
