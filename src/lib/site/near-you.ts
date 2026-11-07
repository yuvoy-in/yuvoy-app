import type { PlaceList } from "./places";

/**
 * "Near you · {place}", the picker's first row, on the web only (DEC-14 A,
 * yuvoy-app#179).
 *
 * Vercel writes the visitor's country and region onto every request it
 * forwards, from the connection, and this reads them once for the one row.
 * Nothing is asked of the visitor, and nothing is kept: the headers are read
 * in the render that draws the row and are never stored, logged or sent on,
 * which is what lets the row exist without a consent question.
 *
 * Both headers, not the region alone (section 6 point 3): region codes repeat
 * across countries, and DEC-14 A meant the Indian states. `KA` is Karnataka
 * only beside `IN`.
 */

/**
 * Indian state codes to the API's market keys. Telangana took `TG` in 2024
 * and the older `TS` is still seen, so both. Keys rather than names: a key is
 * the API's stable word for a market, and the name is copy.
 */
const REGION_MARKET: Readonly<Record<string, string>> = {
  TG: "telangana",
  TS: "telangana",
  KA: "karnataka",
};

export interface NearYou {
  key: string;
  name: string;
}

/**
 * The visitor's region's first local place, in the server's order, when
 * their list has one open; otherwise none. A travel place is never "near
 * you": it is somewhere people go, not somewhere they live.
 */
export function nearYou(
  headers: Pick<Headers, "get"> | null | undefined,
  list: PlaceList | null,
): NearYou | null {
  if (!headers || !list) return null;
  if (headers.get("x-vercel-ip-country")?.trim() !== "IN") return null;
  const region = headers.get("x-vercel-ip-country-region")?.trim();
  const marketKey = region ? REGION_MARKET[region] : undefined;
  if (!marketKey) return null;
  const market = list.markets.find(
    (m) => m.key === marketKey && m.mode === "discover",
  );
  const place = market?.destinations.find((d) => d.kind === "local");
  return place ? { key: place.key, name: place.name } : null;
}
