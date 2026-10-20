import { describe, it, expect, vi, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../../../mocks/server";
import {
  asAppConfig,
  getAppConfig,
  releaseOpen,
  releaseStage,
  siteDescription,
  type Cohort,
  type ReleaseStage,
} from "./app-config";

/**
 * Release stages on the web (yuvoy-app#181, R0-T2's switches): read from
 * `GET /app-config`, opened by the API's own rule, and the one line of copy
 * that waits on them.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

afterEach(() => vi.restoreAllMocks());

describe("release stages", () => {
  it("reads a missing release as off", () => {
    expect(releaseStage(null, "explore")).toBe("off");
    expect(releaseStage(undefined, "explore")).toBe("off");
    // An API older than releases sends none at all.
    expect(releaseStage({ releases: undefined }, "explore")).toBe("off");
    expect(releaseStage({ releases: {} }, "explore")).toBe("off");
    expect(releaseStage({ releases: { explore: "all" } }, "trigo")).toBe("off");
    // A stage nobody wrote a rule for is closed, not open.
    expect(
      releaseStage(
        { releases: { explore: "everyone" as unknown as ReleaseStage } },
        "explore",
      ),
    ).toBe("off");
    expect(releaseStage({ releases: { explore: "early" } }, "explore")).toBe(
      "early",
    );
  });

  it("opens a release by the same rule as the API", () => {
    // The 12 pairs of the API's TestOpenFollowsTheStageAndTheCohort.
    const pairs: [ReleaseStage, Cohort, boolean][] = [
      ["off", null, false],
      ["off", "early", false],
      ["off", "staff", false],
      ["staff", null, false],
      ["staff", "early", false],
      ["staff", "staff", true],
      ["early", null, false],
      ["early", "early", true],
      ["early", "staff", true],
      ["all", null, true],
      ["all", "early", true],
      ["all", "staff", true],
    ];
    for (const [stage, cohort, open] of pairs) {
      expect(releaseOpen(stage, cohort), `${stage} for ${cohort}`).toBe(open);
    }
  });

  it("uses the positioning line once explore reaches everyone", () => {
    const neutral = "Find something worth doing, and book a seat on it.";
    expect(siteDescription(null)).toBe(neutral);
    for (const stage of ["off", "staff", "early"] as const) {
      expect(siteDescription({ releases: { explore: stage } })).toBe(neutral);
    }
    expect(siteDescription({ releases: { explore: "all" } })).toBe(
      "Something to do every weekend, and the best of every trip.",
    );
  });
});

describe("reading the config", () => {
  it("takes release keys this pin has not named yet without complaint", () => {
    // `creator` and `supply` were live before this pin named them.
    const live = {
      releases: { explore: "off", creator: "staff", supply: "off" },
    };
    expect(releaseStage(asAppConfig(live), "explore")).toBe("off");
    // A `releases` that is not an object reads as none.
    expect(releaseStage(asAppConfig({ releases: "all" }), "explore")).toBe(
      "off",
    );
    expect(asAppConfig(null)).toBeNull();
    expect(asAppConfig("config")).toBeNull();
  });

  it("answers null when it did not load, which every caller reads as off", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    server.use(
      http.get(`${BASE}/app-config`, () =>
        HttpResponse.json(
          { error: { code: "invalid_input", message: "x" } },
          { status: 400 },
        ),
      ),
    );
    const config = await getAppConfig();
    expect(config).toBeNull();
    expect(releaseStage(config, "explore")).toBe("off");
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("reads the mock's config: every release off, as on dev and production", async () => {
    const config = await getAppConfig();
    expect(config?.releases?.explore).toBe("off");
    expect(siteDescription(config)).toBe(
      "Find something worth doing, and book a seat on it.",
    );
  });
});
