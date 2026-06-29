import { defineConfig } from "vite";

// Tauri serves the WebView from this fixed dev port.
export default defineConfig({
  clearScreen: false,
  server: { port: 5173, strictPort: true },
});
