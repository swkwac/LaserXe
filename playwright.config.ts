import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests require:
 * - Backend: cd backend && uvicorn main:app --port 8000
 * - Frontend: npm run dev (Astro on http://localhost:4321)
 * - Default user: user / 123 (from seed)
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: "http://localhost:4321",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: undefined,
});
