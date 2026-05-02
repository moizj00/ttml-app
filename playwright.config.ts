import { defineConfig, devices } from "@playwright/test";
import { execSync } from "child_process";

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ||
  `http://localhost:${process.env.PORT || "3000"}`;

function detectChromiumPath(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try {
    const path = execSync("which chromium", { encoding: "utf-8" }).trim();
    if (path) return path;
  } catch {}
  return undefined;
}

const chromiumPath = detectChromiumPath();

export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath: chromiumPath,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
          ],
        },
      },
    },
  ],

  webServer: process.env.CI
    ? {
        // Use pnpm in CI to match the repo's package manager.
        command: "pnpm dev",
        url: BASE_URL,
        reuseExistingServer: false,
        // GitHub-hosted runners can be slow to compile/boot on cold cache.
        timeout: 180000,
      }
    : undefined,
});
