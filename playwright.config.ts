import { defineConfig, devices } from "@playwright/test";

const configuredWorkers = Number(process.env.PLAYWRIGHT_WORKERS ?? 1);
const workers = Number.isFinite(configuredWorkers) && configuredWorkers > 0 ? configuredWorkers : 1;

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  workers,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox-smoke",
      grep: /@smoke/,
      retries: 1,
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit-smoke",
      grep: /@smoke/,
      retries: 1,
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
