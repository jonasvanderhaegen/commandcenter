import { defineConfig, devices } from "@playwright/test";

// Browser tests for the Astro app's own logic (navigation, view-transition
// re-wiring, sidebar/theme interactivity) -- not the native Tauri chrome
// (window controls, keychain, IPC), which needs a different testing
// strategy (tauri-driver/WebDriver) that this doesn't attempt. Real browser,
// real clicks: this is what caught the AppSidebar view-transition wiring bug
// by hand, and is meant to catch that whole class of regression automatically.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    // Port 1420 is the canonical dev port -- matches src-tauri/tauri.conf.json's
    // devUrl/beforeDevCommand, not the vestigial "npm run dev" (port 4321)
    // script. Pointing at the same port `./dev` already uses means
    // reuseExistingServer picks up the already-running instance instead of
    // colliding with it (Astro refuses a second dev server in the same
    // project dir regardless of port).
    baseURL: "http://127.0.0.1:1420",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npx astro dev --host --port 1420",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
