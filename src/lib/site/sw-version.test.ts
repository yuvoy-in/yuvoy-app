import { describe, it, expect, vi, afterEach } from "vitest";
import { swVersion } from "./sw-version";

/**
 * The service worker's version (see sw-version.ts). Production served
 * `register("/sw.js?v=")` because an empty commit SHA won over the fallbacks,
 * so the worker never changed between deploys. These pin that it cannot.
 */

const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);

describe("swVersion", () => {
  it("prefers the deployment, so a redeploy of one commit is a new worker", () => {
    expect(
      swVersion({
        VERCEL_DEPLOYMENT_ID: "dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3",
        VERCEL_GIT_COMMIT_SHA: "1231ebd8eb1dbb6f1cf6b65553371d6d30cbe6c0",
      }),
    ).toBe("dpl_7Gw5ZMBp");
  });

  it("falls back to the commit, then the Actions commit, then the clock", () => {
    expect(
      swVersion({
        VERCEL_GIT_COMMIT_SHA: "1231ebd8eb1dbb6f1cf6b65553371d6d30cbe6c0",
      }),
    ).toBe("1231ebd8eb1d");
    expect(
      swVersion({ GITHUB_SHA: "c754735fe2631847e0665e119b34103226efecc1" }),
    ).toBe("c754735fe263");
    expect(swVersion({}, NOW)).toBe(NOW.toString(36));
  });

  it("treats an empty value as missing, which is how production lost it", () => {
    expect(
      swVersion({
        VERCEL_DEPLOYMENT_ID: "",
        VERCEL_GIT_COMMIT_SHA: "",
        GITHUB_SHA: "c754735fe2631847e0665e119b34103226efecc1",
      }),
    ).toBe("c754735fe263");
    expect(
      swVersion(
        { VERCEL_DEPLOYMENT_ID: "", VERCEL_GIT_COMMIT_SHA: "", GITHUB_SHA: "" },
        NOW,
      ),
    ).toBe(NOW.toString(36));
  });
});

describe("next.config.ts", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("stamps a version even when every source arrives empty", async () => {
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    vi.stubEnv("GITHUB_SHA", "");
    vi.resetModules();
    const config = (await import("../../../next.config")).default;
    expect(config.env?.NEXT_PUBLIC_SW_VERSION).toMatch(/^[a-z0-9]+$/);
  });

  it("stamps the deployment when Vercel provides one", async () => {
    vi.stubEnv("VERCEL_DEPLOYMENT_ID", "dpl_7Gw5ZMBpQA8h9GF832KGp7nwbuh3");
    vi.resetModules();
    const config = (await import("../../../next.config")).default;
    expect(config.env?.NEXT_PUBLIC_SW_VERSION).toBe("dpl_7Gw5ZMBp");
  });
});
