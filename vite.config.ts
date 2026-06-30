import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    ignorePatterns: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.astro/**",
      "**/public/**",
      "src-tauri/target/**",
      "src-tauri/gen/**",
      "**/package-lock.json",
      "**/Cargo.lock",
    ],
  },
  lint: {
    ignorePatterns: ["**/node_modules/**", "**/dist/**", "**/.astro/**", "**/public/**"],
  },
});
