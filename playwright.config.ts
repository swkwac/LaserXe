import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests require:
 * - Backend: cd backend && uvicorn main:app --port 8000
 * - Frontend: npm run dev or npm run preview (Astro server.port in config, default 3000)
 * - Default user: user / 123 (from seed)
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFile: "playwright-report/index.html" }]] : "html",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    actionTimeout: 15000,
  },
  expect: { timeout: 10000 },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: undefined,
});
