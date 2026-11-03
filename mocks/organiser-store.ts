import type { components } from "../src/lib/api/schema.gen";
import {
  CLUBS_HELD,
  HELPER_OF_EVENTS,
  HELPER_OF_HELPERS,
  MY_ORGANISERS,
  ORG_IDS,
  ORG_VERIFIED,
  VERIFIED_EVENTS,
  VERIFIED_HELPERS,
} from "./organiser-fixtures";

/**
 * What the organiser mocks remember (yuvoy-app#224): writes per scenario and
 * session (the groups still offered and the ones set up, yuvoy-app#225,
 * among them), and the sessions that gave an adult answer under
 * `organisers-age`. Split out of `organiser-handlers.ts` to keep it short.
 */

type Organiser = components["schemas"]["Organiser"];
type OrganiserEvent = components["schemas"]["OrganiserEvent"];
type OrganiserHelperListed = components["schemas"]["OrganiserHelperListed"];
type ClubToLink = (typeof CLUBS_HELD)[number];

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

/**
 * The door's scenarios (yuvoy-app#226): the caller owns one verified
 * organiser, and `organiser-door.ts` answers the codes.
 */
export const DOOR_SCENARIOS: ReadonlySet<string> = new Set([
  "organisers-door",
  "organisers-door-paused",
  "organisers-door-age",
]);

/** Scenarios where the caller has no age answer until `PUT /me/age` takes one. */
export function asksAge(scenario: string): boolean {
  return scenario === "organisers-age" || scenario === "organisers-door-age";
}

/** Sessions that gave an adult answer under an age scenario. */
export const adults = new Set<string>();

/** Door codes used, per scenario and session, with their first time. */
export const doorUsed = new Map<string, string>();

/** `ageConfirmed` on `GET /me`: false only under an age scenario, until answered. */
export function organiserAgeConfirmed(request: Request): boolean {
  if (!asksAge(scenarioOf(request))) return true;
  return adults.has(request.headers.get("authorization") ?? "");
}

export interface Store {
  organisers: Organiser[];
  events: Map<string, OrganiserEvent[]>;
  helpers: Map<string, OrganiserHelperListed[]>;
  /** `listMyOrganisers`' `clubsToLink`: held groups with no organiser yet, by name. */
  clubsToLink: ClubToLink[];
  /** Each group set up this session, by `clubId`, with its organiser's id. */
  linked: Map<string, string>;
}

/** The scenarios where the caller holds groups: none of their own organisers yet. */
export function holdsClubs(scenario: string): boolean {
  return (
    scenario === "organisers-club" || scenario === "organisers-club-paused"
  );
}

const stores = new Map<string, Store>();
let made = 0;

export function storeOf(request: Request): Store {
  const scenario = scenarioOf(request);
  const key = `${scenario}|${request.headers.get("authorization") ?? ""}`;
  let store = stores.get(key);
  if (!store) {
    const empty = scenario === "organisers-empty" || holdsClubs(scenario);
    const door = DOOR_SCENARIOS.has(scenario);
    store = {
      organisers: empty
        ? []
        : structuredClone(door ? [ORG_VERIFIED] : MY_ORGANISERS),
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
      // Paused People: the groups are still held, but none is offered.
      clubsToLink:
        scenario === "organisers-club" ? structuredClone(CLUBS_HELD) : [],
      linked: new Map<string, string>(),
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

/** Test-only: forget every organiser write, age answer and door check-in between cases. */
export function __resetOrganiserMocks(): void {
  stores.clear();
  adults.clear();
  doorUsed.clear();
  made = 0;
}
