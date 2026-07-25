import 'dotenv/config'
import { defineConfig, devices } from '@playwright/test'

// Layer 5 (end-to-end / user journeys) — see TESTING_PLAN.md §2.5 and swe-e2e-testing.
// Needs a real local Postgres and (for e2e/discogs-search-prefill.spec.ts) a real
// DISCOGS_TOKEN with network access. Runs serially against a single worker: specs
// share the same Postgres instance and the same Discogs rate-limited token, so
// parallelizing them buys nothing but flake.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
