import type { PlaceList } from "@/lib/site/places";
import type { LifeEntry } from "@/lib/me/types";

/*
  The small pieces of Me that only the page draws (yuvoy-mobile#444), kept as
  the phone app has them in `packages/core/src/me/life-list.ts`, so a card
  reads the same on both. Every one of them is a link, a number or a name;
  the sentences and the dates are in `@/lib/me/words`.
*/

/**
 * Where an entry opens: a trip its listing, a went entry the card it came
 * from. A plan or a table opens nothing, and neither does an entry missing
 * the key it would open by.
 */
export function entryTarget(
  entry: Pick<LifeEntry, "kind" | "experienceSlug" | "eventId">,
): string | null {
  if (entry.kind === "trip" && entry.experienceSlug) {
    return `/e/${encodeURIComponent(entry.experienceSlug)}`;
  }
  if (entry.kind === "went" && entry.eventId) {
    return `/f/${encodeURIComponent(entry.eventId)}`;
  }
  return null;
}

/** The owner's own rating as a whole number of stars, or null for none. */
export function starsOf(rating: number | null | undefined): number | null {
  if (typeof rating !== "number" || !Number.isInteger(rating)) return null;
  return rating >= 1 && rating <= 5 ? rating : null;
}

/** The destination's name from the places list, or empty when it is not in it. */
export function placeName(
  destinationKey: string | null | undefined,
  places: PlaceList | undefined,
): string {
  if (!destinationKey || !places) return "";
  for (const market of places.markets) {
    const found = market.destinations.find((d) => d.key === destinationKey);
    if (found) return found.name;
  }
  return "";
}
