import type { components } from "../src/lib/api/schema.gen";
import {
  HELPER_OF_EVENTS,
  HELPER_OF_HELPERS,
  MY_ORGANISERS,
  ORG_IDS,
  VERIFIED_EVENTS,
  VERIFIED_HELPERS,
} from "./organiser-fixtures";

/**
 * What the organiser mocks remember (yuvoy-app#224): writes per scenario and
 * session, and the sessions that gave an adult answer under `organisers-age`.
 * Split out of `organiser-handlers.ts` to keep it short.
 */

type Organiser = components["schemas"]["Organiser"];
type OrganiserEvent = components["schemas"]["OrganiserEvent"];
type OrganiserHelperListed = components["schemas"]["OrganiserHelperListed"];

export function scenarioOf(request: Request): string {
  return (
    request.headers.get("x-yuvoy-scenario") ??
    new URL(request.url).searchParams.get("__scenario") ??
    "ok"
  );
}

/** What `releases.supply` says under a scenario. */
export function organiserSupplyOf(scenario: string): "off" | "all" {
  return scenario === "organisers-closed-release" ? "off" : "all";
}

/** Sessions that gave an adult answer under `organisers-age`. */
export const adults = new Set<string>();

/** `ageConfirmed` on `GET /me`: false only under `organisers-age`, until answered. */
export function organiserAgeConfirmed(request: Request): boolean {
  if (scenarioOf(request) !== "organisers-age") return true;
  return adults.has(request.headers.get("authorization") ?? "");
}

export interface Store {
  organisers: Organiser[];
  events: Map<string, OrganiserEvent[]>;
  helpers: Map<string, OrganiserHelperListed[]>;
}

const stores = new Map<string, Store>();
let made = 0;

export function storeOf(request: Request): Store {
  const scenario = scenarioOf(request);
  const key = `${scenario}|${request.headers.get("authorization") ?? ""}`;
  let store = stores.get(key);
  if (!store) {
    const empty = scenario === "organisers-empty";
    store = {
      organisers: empty ? [] : structuredClone(MY_ORGANISERS),
      events: new Map<string, OrganiserEvent[]>(
        empty
          ? []
          : [
              [ORG_IDS.verified, structuredClone(VERIFIED_EVENTS)],
              [ORG_IDS.helperOf, structuredClone(HELPER_OF_EVENTS)],
            ],
      ),
      helpers: new Map<string, OrganiserHelperListed[]>(
        empty
          ? []
          : [
              [ORG_IDS.verified, structuredClone(VERIFIED_HELPERS)],
              [ORG_IDS.helperOf, structuredClone(HELPER_OF_HELPERS)],
            ],
      ),
    };
    stores.set(key, store);
  }
  return store;
}

/** A fresh uuid for an organiser or an event the mocks make. */
export function nextId(): string {
  made += 1;
  return `7e2d4b60-5a6c-4d8e-9fb0-${made.toString(16).padStart(12, "0")}`;
}

/** Test-only: forget every organiser write and age answer between cases. */
export function __resetOrganiserMocks(): void {
  stores.clear();
  adults.clear();
  made = 0;
}
