import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.astro/**",
      "src-tauri/target/**",
      "src-tauri/gen/**",
      "**/package-lock.json",
      "**/Cargo.lock",
    ],
  },
});
