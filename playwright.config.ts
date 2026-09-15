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
/**
 * Specs that assert a WebKit behaviour and would pass vacuously on Chromium.
 * Named once so the `iphone` project and the two Chromium projects can never
 * disagree about what belongs where.
 */
const WEBKIT_ONLY = /(ios-input-zoom|hydration)\.spec\.ts/;

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
      testIgnore: WEBKIT_ONLY,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "desktop",
      testIgnore: WEBKIT_ONLY,
      use: { ...devices["Desktop Chrome"] },
    },
    /*
      WebKit, and only for the specs that need WebKit.

      Both projects above are Chromium, so the suite was structurally blind to
      anything that is Safari's behaviour rather than the web's — which is how
      yuvoy-app#35 (iOS Safari zooming the page in on a sub-16px form control)
      reached the owner's phone with a green gate behind it.

      Running the whole suite twice would roughly double the pre-push gate for
      one class of bug, so this project runs only the specs that need it. Add a
      spec here only when the thing it asserts is an engine difference; a spec
      that would pass on Chromium belongs in `mobile`.

      The second one earned its place the same way. `hydration.spec.ts` exists
      because node and WebKit carry different CLDR versions, so a date rendered
      on the server disagreed with the browser's first render and threw React
      #418 on every reel in production (yuvoy-app#67). Chromium agrees with
      node on that value, so both Chromium projects rendered it identically and
      the suite stayed green.
    */
    {
      name: "iphone",
      testMatch: WEBKIT_ONLY,
      use: { ...devices["iPhone 14"] },
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
