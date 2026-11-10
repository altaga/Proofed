import { defineConfig } from "@playwright/test";

const port = Number(process.env.E2E_PORT || 3100);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 240_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "./test-artifacts/playwright-output",
  use: {
    baseURL,
    headless: process.env.HEADED !== "1",
    screenshot: "off",
    video: "off",
    trace: "off",
    locale: "en-US",
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  },
  webServer: {
    command: `rm -f data/e2e.sqlite data/e2e.sqlite-wal data/e2e.sqlite-shm && npx next dev -p ${port}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      SQLITE_PATH: "./data/e2e.sqlite",
    },
  },
});
