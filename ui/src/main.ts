import "@xterm/xterm/css/xterm.css";
import "./style.css";
import { Terminal } from "@xterm/xterm";

// Injected in the Tauri WebView; undefined in a plain browser, where we fall
// back to placeholder data so the UI still renders standalone.
type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
const invoke: Invoke | undefined = (window as any).__TAURI__?.core?.invoke;

interface Project {
  id: string;
  name: string;
}
interface Process {
  id: string;
  name: string;
  status: string;
}

async function listProjects(): Promise<Project[]> {
  if (invoke) return invoke<Project[]>("list_projects");
  return [{ id: "demo", name: "demo" }];
}

async function listProcesses(projectId: string): Promise<Process[]> {
  if (invoke) return invoke<Process[]>("list_processes", { projectId });
  return [{ id: "shell", name: "zsh", status: "idle" }];
}

async function renderSidebar() {
  const sidebar = document.getElementById("sidebar")!;
  const projects = await listProjects();
  const sections = await Promise.all(
    projects.map(async (p) => {
      const procs = await listProcesses(p.id);
      const items = procs
        .map((x) => `<li>&#9679; ${x.name} <small>${x.status}</small></li>`)
        .join("");
      return `<h2>${p.name}</h2><ul>${items}</ul>`;
    }),
  );
  sidebar.innerHTML = sections.join("");
}

function mountTerminal() {
  const term = new Terminal({
    fontSize: 13,
    cursorBlink: true,
    theme: { background: "#16181d", foreground: "#d7dae0" },
  });
  term.open(document.getElementById("pane")!);
  term.writeln("Ensemble -- terminal-of-terminals (skeleton).");
  term.writeln("No PTY backend yet; this pane is a placeholder.");
}

renderSidebar();
mountTerminal();
