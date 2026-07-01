//! Enforce exactly one running CommandCenter instance. Unlike the common
//! "focus the existing window and quit the new launch" pattern (e.g.
//! tauri-plugin-single-instance's default behavior, which always terminates
//! the *new* process), this does the opposite on purpose: the newest launch
//! always wins. On startup, if a previous instance's PID file points at a
//! still-alive CommandCenter process, terminate it and wait for it to
//! actually exit before this instance continues -- so the two processes
//! never both end up bound to cc-mcp's fixed ports (7080/7443) at once.

use std::path::Path;
use std::time::{Duration, Instant};

use sysinfo::{Pid, ProcessesToUpdate, Signal, System};

const PID_FILE: &str = "commandcenter.pid";
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(3);
const POLL_INTERVAL: Duration = Duration::from_millis(100);

/// If a previous instance is still running, terminate it and wait for it to
/// exit, then record this process's PID for the next launch to find.
pub fn enforce_single_instance(app_data_dir: &Path) {
    let _ = std::fs::create_dir_all(app_data_dir);
    let pid_path = app_data_dir.join(PID_FILE);

    if let Some(pid) = read_pid(&pid_path) {
        terminate_and_wait(pid);
    }

    let _ = std::fs::write(&pid_path, std::process::id().to_string());
}

fn read_pid(pid_path: &Path) -> Option<Pid> {
    let text = std::fs::read_to_string(pid_path).ok()?;
    let raw: usize = text.trim().parse().ok()?;
    Some(Pid::from(raw))
}

fn terminate_and_wait(pid: Pid) {
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::All, true);

    let Some(process) = system.process(pid) else {
        return; // stale PID file, nothing running -- nothing to do
    };

    // Guard against PID reuse: only touch it if it's genuinely another
    // CommandCenter process, not some unrelated process that happens to
    // have reused this PID number since the last launch.
    let current_exe_name = std::env::current_exe()
        .ok()
        .and_then(|p| p.file_name().map(|n| n.to_os_string()));
    let is_us = current_exe_name
        .as_deref()
        .is_some_and(|name| process.name() == name);
    if !is_us {
        return;
    }

    if process.kill_with(Signal::Term).is_none() {
        // Signal::Term unsupported on this platform -- fall back to
        // whatever sysinfo's default terminate does there.
        process.kill();
    }

    let deadline = Instant::now() + SHUTDOWN_TIMEOUT;
    loop {
        system.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);
        if system.process(pid).is_none() {
            return;
        }
        if Instant::now() >= deadline {
            break;
        }
        std::thread::sleep(POLL_INTERVAL);
    }

    // Didn't exit gracefully in time -- force it.
    if let Some(process) = system.process(pid) {
        process.kill_with(Signal::Kill);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stale_pid_file_is_ignored_and_overwritten() {
        let dir =
            std::env::temp_dir().join(format!("cc-single-instance-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        // A PID essentially guaranteed not to be running.
        std::fs::write(dir.join(PID_FILE), "999999999").unwrap();

        enforce_single_instance(&dir);

        let written = std::fs::read_to_string(dir.join(PID_FILE)).unwrap();
        assert_eq!(written.trim().parse::<u32>().unwrap(), std::process::id());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn unrelated_process_with_reused_pid_is_not_killed() {
        // Spawn something that's definitely not this test binary's own
        // executable name, so the name guard must refuse to touch it even
        // though its PID is genuinely alive right now -- otherwise a stale
        // PID file that got reused by an unrelated process would kill it.
        let mut child = std::process::Command::new("sleep")
            .arg("2")
            .spawn()
            .unwrap();
        let pid = child.id();

        let dir =
            std::env::temp_dir().join(format!("cc-single-instance-test2-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(PID_FILE), pid.to_string()).unwrap();

        enforce_single_instance(&dir);

        // Still alive -- name mismatch means we must not have killed it.
        assert!(child.try_wait().unwrap().is_none());

        child.kill().ok();
        child.wait().ok();
        std::fs::remove_dir_all(&dir).ok();
    }
}
