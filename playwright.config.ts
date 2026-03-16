import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  webServer: {
    command:
      'cmd /c ".\\node_modules\\.bin\\tsc.cmd -b && .\\node_modules\\.bin\\vite.cmd build && .\\node_modules\\.bin\\vite.cmd preview --host 127.0.0.1 --port 4173"',
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
