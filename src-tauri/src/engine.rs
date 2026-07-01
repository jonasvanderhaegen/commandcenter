//! PTY-backed process engine: spawn, stream output, write input, resize,
//! stop, restart, close. Runtime-only registry (no persistence) per
//! scratchpad "CONTRACT: engine command surface v1".

use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;

/// Cap on how much output we keep in memory per process (~2 MB).
const RING_BUFFER_CAP: usize = 2 * 1024 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProcessStatus {
    Running,
    Exited,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub command: Vec<String>,
    pub cwd: Option<String>,
    pub status: ProcessStatus,
    pub pid: Option<u32>,
    pub exit_code: Option<i32>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutputEvent {
    process_id: String,
    data: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExitEvent {
    process_id: String,
    exit_code: Option<i32>,
}

/// Where the engine sends output/exit notifications. Production code emits
/// Tauri app-global events; tests use a channel-backed sink so the
/// supervisor is exercised without an AppHandle.
pub trait EventSink: Send + Sync {
    fn emit_output(&self, process_id: &str, data: &str);
    fn emit_exit(&self, process_id: &str, exit_code: Option<i32>);
}

pub struct TauriEventSink(pub tauri::AppHandle);

impl EventSink for TauriEventSink {
    fn emit_output(&self, process_id: &str, data: &str) {
        use tauri::Emitter;
        let _ = self.0.emit(
            "process:output",
            OutputEvent {
                process_id: process_id.to_string(),
                data: data.to_string(),
            },
        );
    }

    fn emit_exit(&self, process_id: &str, exit_code: Option<i32>) {
        use tauri::Emitter;
        let _ = self.0.emit(
            "process:exit",
            ExitEvent {
                process_id: process_id.to_string(),
                exit_code,
            },
        );
    }
}

struct RingBuffer {
    cap: usize,
    data: Vec<u8>,
}

impl RingBuffer {
    fn new(cap: usize) -> Self {
        Self {
            cap,
            data: Vec::new(),
        }
    }

    fn push(&mut self, bytes: &[u8]) {
        self.data.extend_from_slice(bytes);
        if self.data.len() > self.cap {
            let excess = self.data.len() - self.cap;
            self.data.drain(0..excess);
        }
    }

    fn contents_lossy(&self) -> String {
        String::from_utf8_lossy(&self.data).into_owned()
    }
}

struct ProcessEntry {
    info: ProcessInfo,
    cols: u16,
    rows: u16,
    writer: Option<Box<dyn Write + Send>>,
    master: Option<Box<dyn MasterPty>>,
    child: Option<Arc<Mutex<Box<dyn Child + Send + Sync>>>>,
    buffer: Arc<Mutex<RingBuffer>>,
}

struct Inner {
    sink: Arc<dyn EventSink>,
    processes: Mutex<HashMap<String, ProcessEntry>>,
    next_id: AtomicU64,
}

/// Registry of PTY-backed processes, held in tauri State behind a Mutex.
/// Cheap to clone -- clones share the same registry via an inner Arc.
#[derive(Clone)]
pub struct Supervisor(Arc<Inner>);

impl Supervisor {
    pub fn new(sink: Arc<dyn EventSink>) -> Self {
        Supervisor(Arc::new(Inner {
            sink,
            processes: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
        }))
    }

    fn alloc_id(&self) -> String {
        let n = self.0.next_id.fetch_add(1, Ordering::Relaxed);
        format!("proc-{n}")
    }

    pub fn list_processes(&self, project_id: &str) -> Vec<ProcessInfo> {
        let procs = self.0.processes.lock().unwrap();
        procs
            .values()
            .filter(|p| p.info.project_id == project_id)
            .map(|p| p.info.clone())
            .collect()
    }

    pub fn spawn_process(
        &self,
        project_id: String,
        name: String,
        command: Vec<String>,
        cwd: Option<String>,
        cols: u16,
        rows: u16,
    ) -> Result<ProcessInfo, String> {
        if command.is_empty() {
            return Err("command must have at least one element".into());
        }
        let id = self.alloc_id();
        self.spawn_with_id(id, project_id, name, command, cwd, cols, rows)
    }

    fn spawn_with_id(
        &self,
        id: String,
        project_id: String,
        name: String,
        command: Vec<String>,
        cwd: Option<String>,
        cols: u16,
        rows: u16,
    ) -> Result<ProcessInfo, String> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;

        let mut cmd = CommandBuilder::new(&command[0]);
        cmd.args(&command[1..]);
        if let Some(dir) = &cwd {
            cmd.cwd(dir);
        }

        let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
        // Drop our copy of the slave fd once the child holds it: on unix
        // this is required for the master's reader to see EOF when the
        // child exits.
        drop(pair.slave);

        let pid = child.process_id();
        let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

        let buffer = Arc::new(Mutex::new(RingBuffer::new(RING_BUFFER_CAP)));
        let child = Arc::new(Mutex::new(child));

        let info = ProcessInfo {
            id: id.clone(),
            project_id,
            name,
            command,
            cwd,
            status: ProcessStatus::Running,
            pid,
            exit_code: None,
        };

        let entry = ProcessEntry {
            info: info.clone(),
            cols,
            rows,
            writer: Some(writer),
            master: Some(pair.master),
            child: Some(child.clone()),
            buffer: buffer.clone(),
        };

        self.0.processes.lock().unwrap().insert(id.clone(), entry);

        self.spawn_reader_thread(id, reader, child, buffer);

        Ok(info)
    }

    fn spawn_reader_thread(
        &self,
        id: String,
        mut reader: Box<dyn Read + Send>,
        child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
        buffer: Arc<Mutex<RingBuffer>>,
    ) {
        let inner = self.0.clone();
        thread::spawn(move || {
            let mut chunk = [0u8; 8192];
            loop {
                match reader.read(&mut chunk) {
                    Ok(0) => break,
                    Ok(n) => {
                        let bytes = &chunk[..n];
                        buffer.lock().unwrap().push(bytes);
                        let text = String::from_utf8_lossy(bytes).into_owned();
                        inner.sink.emit_output(&id, &text);
                    }
                    Err(_) => break,
                }
            }

            let exit_code = child
                .lock()
                .unwrap()
                .wait()
                .ok()
                .map(|status| status.exit_code() as i32);

            if let Some(entry) = inner.processes.lock().unwrap().get_mut(&id) {
                entry.info.status = ProcessStatus::Exited;
                entry.info.exit_code = exit_code;
                entry.writer = None;
                entry.master = None;
                entry.child = None;
            }

            inner.sink.emit_exit(&id, exit_code);
        });
    }

    pub fn get_process_output(&self, process_id: &str) -> Result<String, String> {
        let procs = self.0.processes.lock().unwrap();
        let entry = procs
            .get(process_id)
            .ok_or_else(|| format!("no such process: {process_id}"))?;
        Ok(entry.buffer.lock().unwrap().contents_lossy())
    }

    pub fn send_process_input(&self, process_id: &str, data: &str) -> Result<(), String> {
        let mut procs = self.0.processes.lock().unwrap();
        let entry = procs
            .get_mut(process_id)
            .ok_or_else(|| format!("no such process: {process_id}"))?;
        let writer = entry
            .writer
            .as_mut()
            .ok_or_else(|| format!("process {process_id} is not running"))?;
        writer.write_all(data.as_bytes()).map_err(|e| e.to_string())
    }

    pub fn resize_process(&self, process_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let mut procs = self.0.processes.lock().unwrap();
        let entry = procs
            .get_mut(process_id)
            .ok_or_else(|| format!("no such process: {process_id}"))?;
        entry.cols = cols;
        entry.rows = rows;
        let master = entry
            .master
            .as_ref()
            .ok_or_else(|| format!("process {process_id} is not running"))?;
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())
    }

    /// SIGTERM then kill; keeps the registry entry (marked exited by the
    /// reader thread once it observes EOF/wait()).
    pub fn stop_process(&self, process_id: &str) -> Result<(), String> {
        let (pid, child) = {
            let procs = self.0.processes.lock().unwrap();
            let entry = procs
                .get(process_id)
                .ok_or_else(|| format!("no such process: {process_id}"))?;
            (entry.info.pid, entry.child.clone())
        };

        let Some(child) = child else {
            // Already exited; nothing to signal.
            return Ok(());
        };

        #[cfg(unix)]
        if let Some(pid) = pid {
            send_sigterm(pid);
            thread::sleep(Duration::from_millis(200));
        }
        #[cfg(not(unix))]
        let _ = pid;

        // Escalate to a hard kill if the process is still alive (either it
        // ignored SIGTERM, or we're on a platform with no SIGTERM concept).
        let mut guard = child.lock().unwrap();
        if matches!(guard.try_wait(), Ok(None)) {
            let _ = guard.kill();
        }
        Ok(())
    }

    /// Same command/cwd/size, reusing the id.
    pub fn restart_process(&self, process_id: &str) -> Result<ProcessInfo, String> {
        let (project_id, name, command, cwd, cols, rows) = {
            let procs = self.0.processes.lock().unwrap();
            let entry = procs
                .get(process_id)
                .ok_or_else(|| format!("no such process: {process_id}"))?;
            (
                entry.info.project_id.clone(),
                entry.info.name.clone(),
                entry.info.command.clone(),
                entry.info.cwd.clone(),
                entry.cols,
                entry.rows,
            )
        };

        let _ = self.stop_process(process_id);
        self.0.processes.lock().unwrap().remove(process_id);

        self.spawn_with_id(
            process_id.to_string(),
            project_id,
            name,
            command,
            cwd,
            cols,
            rows,
        )
    }

    /// Kill if running, then drop from the registry.
    pub fn close_process(&self, process_id: &str) -> Result<(), String> {
        if self.0.processes.lock().unwrap().contains_key(process_id) {
            let _ = self.stop_process(process_id);
        }
        self.0.processes.lock().unwrap().remove(process_id);
        Ok(())
    }
}

#[cfg(unix)]
fn send_sigterm(pid: u32) {
    unsafe {
        libc::kill(pid as libc::pid_t, libc::SIGTERM);
    }
}

#[tauri::command]
pub fn list_processes(state: tauri::State<Supervisor>, project_id: String) -> Vec<ProcessInfo> {
    state.list_processes(&project_id)
}

#[tauri::command]
pub fn spawn_process(
    state: tauri::State<Supervisor>,
    project_id: String,
    name: String,
    command: Vec<String>,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<ProcessInfo, String> {
    state.spawn_process(project_id, name, command, cwd, cols, rows)
}

#[tauri::command]
pub fn get_process_output(
    state: tauri::State<Supervisor>,
    process_id: String,
) -> Result<String, String> {
    state.get_process_output(&process_id)
}

#[tauri::command]
pub fn send_process_input(
    state: tauri::State<Supervisor>,
    process_id: String,
    data: String,
) -> Result<(), String> {
    state.send_process_input(&process_id, &data)
}

#[tauri::command]
pub fn resize_process(
    state: tauri::State<Supervisor>,
    process_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state.resize_process(&process_id, cols, rows)
}

#[tauri::command]
pub fn stop_process(state: tauri::State<Supervisor>, process_id: String) -> Result<(), String> {
    state.stop_process(&process_id)
}

#[tauri::command]
pub fn restart_process(
    state: tauri::State<Supervisor>,
    process_id: String,
) -> Result<ProcessInfo, String> {
    state.restart_process(&process_id)
}

#[tauri::command]
pub fn close_process(state: tauri::State<Supervisor>, process_id: String) -> Result<(), String> {
    state.close_process(&process_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::Instant;

    struct TestSink {
        tx: Mutex<mpsc::Sender<(String, Option<String>, Option<i32>)>>,
    }

    impl EventSink for TestSink {
        fn emit_output(&self, process_id: &str, data: &str) {
            let _ = self.tx.lock().unwrap().send((
                process_id.to_string(),
                Some(data.to_string()),
                None,
            ));
        }

        fn emit_exit(&self, process_id: &str, exit_code: Option<i32>) {
            let _ = self
                .tx
                .lock()
                .unwrap()
                .send((process_id.to_string(), None, exit_code));
        }
    }

    fn new_supervisor() -> (
        Supervisor,
        mpsc::Receiver<(String, Option<String>, Option<i32>)>,
    ) {
        let (tx, rx) = mpsc::channel();
        let sink: Arc<dyn EventSink> = Arc::new(TestSink { tx: Mutex::new(tx) });
        (Supervisor::new(sink), rx)
    }

    fn wait_for_exit(
        sup: &Supervisor,
        project_id: &str,
        id: &str,
        timeout: Duration,
    ) -> Option<ProcessInfo> {
        let deadline = Instant::now() + timeout;
        loop {
            let info = sup
                .list_processes(project_id)
                .into_iter()
                .find(|p| p.id == id);
            if let Some(p) = &info {
                if p.status == ProcessStatus::Exited {
                    return info;
                }
            }
            if Instant::now() >= deadline {
                return info;
            }
            thread::sleep(Duration::from_millis(20));
        }
    }

    #[test]
    fn spawns_and_captures_output_and_exit() {
        let (sup, _rx) = new_supervisor();
        let info = sup
            .spawn_process(
                "proj".into(),
                "echo".into(),
                vec!["sh".into(), "-c".into(), "echo hi".into()],
                None,
                80,
                24,
            )
            .expect("spawn should succeed");

        let exited = wait_for_exit(&sup, "proj", &info.id, Duration::from_secs(5))
            .expect("process should still be registered");
        assert_eq!(exited.status, ProcessStatus::Exited);
        assert_eq!(exited.exit_code, Some(0));

        let output = sup.get_process_output(&info.id).unwrap();
        assert!(output.contains("hi"), "output was: {output:?}");
    }

    #[test]
    fn ring_buffer_truncates_to_capacity() {
        let mut buf = RingBuffer::new(8);
        buf.push(b"abcdefgh");
        buf.push(b"ij");
        assert_eq!(buf.contents_lossy(), "cdefghij");
    }

    #[test]
    fn send_input_is_echoed_back_by_cat() {
        let (sup, _rx) = new_supervisor();
        let info = sup
            .spawn_process(
                "proj".into(),
                "cat".into(),
                vec!["cat".into()],
                None,
                80,
                24,
            )
            .expect("spawn should succeed");

        sup.send_process_input(&info.id, "hello\n")
            .expect("write should succeed");

        let deadline = Instant::now() + Duration::from_secs(3);
        let mut output = String::new();
        while Instant::now() < deadline {
            output = sup.get_process_output(&info.id).unwrap();
            if output.contains("hello") {
                break;
            }
            thread::sleep(Duration::from_millis(20));
        }
        assert!(output.contains("hello"), "output was: {output:?}");

        sup.close_process(&info.id).unwrap();
    }
}
