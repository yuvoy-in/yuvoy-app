import { describe, it, expect, vi } from "vitest";

const sdk = vi.hoisted(() => ({ init: vi.fn(), capture: vi.fn() }));
vi.mock("posthog-js", () => ({ default: sdk }));

const { createPostHogReporter } = await import("./posthog");

/**
 * What the SDK may do by itself (production readiness, 6 Oct 2026).
 *
 * PostHog switches capture on from the project's own settings: replay,
 * heatmaps, web vitals. Each writes `location.href`, token and all, into
 * fields `sanitize_properties` never looked at, so the init has to say no
 * here, where a settings page cannot undo it.
 */
describe("the PostHog reporter", () => {
  type Config = {
    sanitize_properties: (
      properties: Record<string, unknown>,
      event: string,
    ) => Record<string, unknown>;
  };

  async function config(): Promise<Config> {
    sdk.init.mockClear();
    await createPostHogReporter("phc_test", "https://eu.i.posthog.com");
    return sdk.init.mock.calls[0][1] as Config;
  }

  it("lets nothing the project switches on record a page by itself", async () => {
    expect(await config()).toMatchObject({
      autocapture: false,
      capture_pageview: false,
      capture_heatmaps: false,
      disable_session_recording: true,
      disable_capture_url_hashes: true,
    });
  });

  it("scrubs every property, not only the current address", async () => {
    const { sanitize_properties } = await config();
    const clean = sanitize_properties(
      {
        $current_url: "https://app.yuvoy.in/booking#t=status_tok",
        $session_entry_url: "https://app.yuvoy.in/i/inv_tok_9f2",
        $set_once: {
          $initial_current_url: "https://app.yuvoy.in/trip/shr_tok_41",
        },
      },
      "reel_viewed",
    );
    expect(JSON.stringify(clean)).not.toMatch(/status_tok|inv_tok|shr_tok/);
  });
});
