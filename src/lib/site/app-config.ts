import { cache } from "react";
import { createApiClient, serverScenarioHeaders } from "@/lib/api/client";
import type { components } from "@/lib/api/schema.gen";

/**
 * How far each release has reached, from `GET /app-config` (yuvoy-app#181,
 * R0-T2's switches on the web).
 *
 * Staff move a release from `off` to `staff`, `early` and `all` in the admin
 * console's Release switches, with no deploy, and the screens a release adds
 * appear on the web by the same rule the API applies to its routes. Nothing is
 * gated in R0: this is the reading, so R2's screens can be switched on from the
 * console rather than by a release of this app. The web's one switch of its
 * own stays `NEXT_PUBLIC_INVITE_ONLY` (`lib/site/access.ts`).
 *
 * Safe to import anywhere. The server's reads are `getAppConfig` here and
 * `getCohort` (`lib/auth/request-cohort.ts`); the browser's is `useRelease`
 * (`lib/site/use-release.ts`).
 */

export type AppConfig = components["schemas"]["AppConfig"];
export type ReleaseStage = components["schemas"]["ReleaseStage"];
export type ReleaseKey = keyof NonNullable<AppConfig["releases"]>;
/** Who sees releases early: `cohort` on `GET /me`. */
export type Cohort = "staff" | "early" | null;

const STAGES: ReadonlySet<string> = new Set<ReleaseStage>([
  "off",
  "staff",
  "early",
  "all",
]);

/**
 * A release's stage. A key that is absent, a config with no `releases` (an API
 * older than them) and no config at all are all `off`, as the contract says,
 * and so is a stage this build has never heard of: the safe reading of a word
 * nobody wrote a rule for is closed.
 */
export function releaseStage(
  config: Pick<AppConfig, "releases"> | null | undefined,
  key: ReleaseKey,
): ReleaseStage {
  const stage: unknown = config?.releases?.[key];
  return typeof stage === "string" && STAGES.has(stage)
    ? (stage as ReleaseStage)
    : "off";
}

/**
 * Whether a release is open to this traveller: the API's rule, word for word,
 * so the web never shows a screen whose routes the API would refuse. `all`
 * opens for everyone; `early` for the `early` and `staff` cohorts; `staff` for
 * `staff`; `off` for nobody.
 */
export function releaseOpen(stage: ReleaseStage, cohort: Cohort): boolean {
  switch (stage) {
    case "all":
      return true;
    case "early":
      return cohort === "early" || cohort === "staff";
    case "staff":
      return cohort === "staff";
    case "off":
      return false;
  }
}

/**
 * What the site says it is: the line under the name in search results, a
 * share card and the installed app.
 *
 * The positioning line waits for `explore` to reach everybody (REQ-R0-31,
 * DEC-5 decided A: "after R2 reaches everyone"). Until then it is the line
 * that is true today, in words that name no place. Read from the config, so
 * the line changes with the switch and needs no release of this app.
 */
export function siteDescription(
  config: Pick<AppConfig, "releases"> | null | undefined,
): string {
  return releaseStage(config, "explore") === "all"
    ? "Something to do every weekend, and the best of every trip."
    : "Find something worth doing, and book a seat on it.";
}

/**
 * The answer, if it reads as a config. Lenient on purpose: the API adds a
 * release key before this app is pinned to it (`creator` and `supply` were
 * live before this pin named them), and an unknown key must cost nothing.
 * Only `releases` is read here, so only `releases` has to make sense.
 */
export function asAppConfig(data: unknown): AppConfig | null {
  if (typeof data !== "object" || data === null) return null;
  const releases = (data as { releases?: unknown }).releases;
  if (
    releases !== undefined &&
    (typeof releases !== "object" || releases === null)
  ) {
    return { ...(data as AppConfig), releases: undefined };
  }
  return data as AppConfig;
}

/**
 * How long a server render waits for the config before it reads every
 * release as off: the same three seconds as the places read.
 */
export const APP_CONFIG_TIMEOUT_MS = 3_000;

/**
 * Seconds a server read is cached. A switch moved in the console reaches the
 * app "within about 8 minutes", so a minute here adds little to that.
 */
export const APP_CONFIG_REVALIDATE_SECONDS = 60;

/** Whether the last read failed: an outage is logged when it starts. */
let failing = false;

async function readAppConfig(scenario?: string): Promise<AppConfig | null> {
  /*
    A mocked build's `?__scenario=` moves the releases (yuvoy-app#180's
    `checkedCities`), so a page that decides one passes its scenario, and
    that read is never kept: the next page's scenario would be answered from
    this one. Outside a mocked build there is no header and nothing changes.
  */
  const scenarioHeaders = serverScenarioHeaders(scenario);
  const mocked = Object.keys(scenarioHeaders).length > 0;
  try {
    const { data, error } = await createApiClient().GET("/app-config", {
      headers: scenarioHeaders,
      ...(mocked
        ? { cache: "no-store" as const }
        : { next: { revalidate: APP_CONFIG_REVALIDATE_SECONDS } }),
      signal: AbortSignal.timeout(APP_CONFIG_TIMEOUT_MS),
    });
    if (error) throw error;
    const config = asAppConfig(data);
    if (!config) throw new Error("GET /app-config answered with no config.");
    failing = false;
    return config;
  } catch (cause) {
    /*
      Every release reads as off and the site says the line that is true
      today, so the page stays a 200 and the function log is the only place
      the cause shows.
    */
    if (!failing) {
      console.error(
        "[app-config] GET /app-config failed; every release reads as off.",
        cause,
      );
    }
    failing = true;
    return null;
  }
}

/**
 * `GET /app-config` on the server, once per render however many parts of a
 * page ask (React's `cache`: a read with a deadline is not memoised by Next).
 * Null when it did not load, which every caller reads as "every release off".
 * `scenario` is the page's own `?__scenario=`, read in a mocked build only.
 */
export const getAppConfig = cache(readAppConfig);
