import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration.
 *
 * The device matters more than usual here. The traveller is on a mid-range
 * Android on island 4G, not a laptop on fibre, so the mobile project is the
 * primary one and desktop is the secondary check — the reverse of the usual
 * default.
 *
 * `webServer` builds and serves rather than running `next dev`: the production
 * build is what a traveller gets, and dev-only behaviour (React double-invoke,
 * unminified bundles) hides real problems.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        // Mocks stay ON: there is no staging API, and pointing e2e at
        // production would create real reservations against real inventory.
        command: "pnpm build && pnpm start --port 3100",
        url: "http://127.0.0.1:3100",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: { NEXT_PUBLIC_API_MOCKING: "enabled" },
      },
});
