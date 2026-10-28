import { cache } from "react";
import { headers } from "next/headers";
import { callUpstream } from "@/lib/auth/upstream";
import {
  getPlaces,
  PLACES_TIMEOUT_MS,
  type PlaceList,
  type PlaceMarket,
} from "./places";

/**
 * The places THIS caller may pick, for `/` (yuvoy-app#179).
 *
 * `GET /places` is the public list, the same for everybody and cached for
 * five minutes. A staff or early number also sees places still opening, and
 * only `GET /me/places` (`listMyPlaces`) says which, so a session reads that
 * one, signed with its token through `callUpstream`, uncached: it is one
 * person's answer. Without a session, or with one the API no longer accepts
 * (401), it is the public list as every other page reads it (`getPlaces`).
 *
 * Null when the list did not load. `choiceFrom` reads null as "a read
 * failed", never as "the place has gone", so nothing is forgotten on a bad
 * minute (section 6 point 2).
 *
 * Server only: it reads the request's headers, and the token never leaves
 * this server.
 */

export interface MyPlaces {
  list: PlaceList | null;
  /** Whether the list is this person's own (`/me/places` answered). */
  signedIn: boolean;
}

/**
 * The answer, if it is a list of markets: the same check as `getPlaces`
 * makes, so a page never falls over on an answer that is not one.
 */
function asPlaceList(data: unknown): PlaceList | null {
  if (typeof data !== "object" || data === null) return null;
  const markets = (data as { markets?: unknown }).markets;
  if (!Array.isArray(markets)) return null;
  return {
    markets: markets.filter(
      (market): market is PlaceMarket =>
        typeof market === "object" &&
        market !== null &&
        typeof market.key === "string" &&
        typeof market.name === "string" &&
        Array.isArray(market.destinations),
    ),
  };
}

async function visitorHeaders(): Promise<Headers | undefined> {
  try {
    return await headers();
  } catch {
    return undefined;
  }
}

/**
 * The public list, for a page carrying a `?__scenario=` in a mocked build.
 *
 * `getPlaces` is cached and sends no scenario, so without this a signed-out
 * `?__scenario=explore-all` or `places-error` would never reach the server
 * render of `/`. Compiled out of any build without mocking, where the
 * scenario is always undefined by the time it gets here.
 */
async function scenarioPlaces(scenario: string): Promise<PlaceList | null> {
  try {
    const answer = await callUpstream({
      method: "GET",
      path: "/places",
      scenario,
      signal: AbortSignal.timeout(PLACES_TIMEOUT_MS),
    });
    return answer.status === 200 ? asPlaceList(answer.body) : null;
  } catch {
    return null;
  }
}

/**
 * The mocked scenarios R2 reads places under: `places-*`, `explore-*`,
 * `found-*`, `report-*` and `item-*` (section 6 point 8), each of which opens
 * a discover place. Only these reach the places read. The older ones
 * (`server-error`, `slow`, `offline`, ...) fail every call they reach, and
 * before R2 the list on `/` never saw them, so passing them on would change
 * what `/` says under every spec that uses one.
 */
const PLACE_SCENARIO = /^(places|explore|found|report|item)-/;

async function readMyPlaces(
  token: string | null,
  scenario?: string,
): Promise<MyPlaces> {
  const mocked =
    process.env.NEXT_PUBLIC_API_MOCKING === "enabled" &&
    scenario &&
    PLACE_SCENARIO.test(scenario)
      ? scenario
      : undefined;
  const publicList = async (): Promise<MyPlaces> => ({
    list: mocked ? await scenarioPlaces(mocked) : await getPlaces(),
    signedIn: false,
  });

  if (!token) return publicList();

  try {
    const answer = await callUpstream({
      method: "GET",
      path: "/me/places",
      token,
      scenario: mocked,
      visitor: await visitorHeaders(),
      signal: AbortSignal.timeout(PLACES_TIMEOUT_MS),
    });
    // A session the API no longer knows is somebody signed out.
    if (answer.status === 401) return publicList();
    if (answer.status !== 200) {
      throw new Error(`GET /me/places answered ${answer.status}.`);
    }
    const list = asPlaceList(answer.body);
    if (!list) throw new Error("GET /me/places answered with no list of markets.");
    return { list, signedIn: true };
  } catch (cause) {
    /*
      Logged, because `/` stays a 200 showing the reels, and the function log
      is the only place the cause is visible (as `getPlaces` does). Nothing
      about the person is in it: the token is in a header this never prints.
    */
    console.error(
      "[places] GET /me/places failed; / shows the reels and keeps the remembered place.",
      cause,
    );
    return { list: null, signedIn: true };
  }
}

/**
 * Once per server render however many parts of `/` ask, as `getPlaces`.
 */
export const myPlaces = cache(readMyPlaces);
