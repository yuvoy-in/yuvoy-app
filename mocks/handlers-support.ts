import { HttpResponse, delay } from "msw";
import type { components } from "../src/lib/api/schema.gen";
import { mockHeaders } from "./fixtures";
import type { Scenario } from "./handlers-scenario";

/* The API base, the scenario switch, the request ids (`requestSeq` with `requestId`, its one writer), the envelope and the shared checks, moved word for word out of handlers.ts (yuvoy-app#243). */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";
export const url = (p: string) => `${BASE}${p}`;

export function scenarioOf(request: Request): Scenario {
  const fromHeader = request.headers.get("x-yuvoy-scenario");
  if (fromHeader) return fromHeader as Scenario;
  const s = new URL(request.url).searchParams.get("__scenario");
  return (s as Scenario) ?? "ok";
}

/** The views this process has stored, by `eventId`: a repeat is one view. */
export const recordedViews = new Set<string>();

/** The outcomes this process has stored, by `eventId`: a repeat is one. */
export const recordedOutcomes = new Set<string>();

let requestSeq = 0;
export const requestId = () =>
  `01J${(++requestSeq).toString(36).toUpperCase().padStart(6, "0")}MOCK`;

export function envelope(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
) {
  return HttpResponse.json(
    { error: { code, message, details, requestId: requestId() } },
    { status, headers: mockHeaders(requestId()) },
  );
}

/** Failures any endpoint can produce, applied before its own logic. */
export async function commonFailure(request: Request) {
  const s = scenarioOf(request);
  switch (s) {
    case "slow":
      await delay(3000);
      return null;
    case "offline":
      return HttpResponse.error();
    case "server-error":
      return envelope(
        "internal_error",
        "Something went wrong at our end.",
        500,
      );
    case "rate-limited":
      return envelope(
        "rate_limited",
        "Too many requests. Try again shortly.",
        429,
      );
    case "booking-disabled":
      return envelope(
        "booking_disabled",
        "Booking is paused right now. Browsing still works.",
        503,
      );
    case "operator-not-bookable":
      return envelope(
        "operator_not_bookable",
        "This operator is paused while we check something.",
        503,
      );
    default:
      return null;
  }
}

/**
 * The closed browse vocabulary, so the mock can tell an unknown category from
 * one that simply matches nothing.
 *
 * Kept in step with `Category` in the contract by the type below: adding a
 * value there without adding it here is a build failure, which is the only
 * way a set written twice stays written once.
 */
export const CATEGORIES: ReadonlySet<string> = new Set<
  components["schemas"]["Category"]
>([
  "adventure",
  "nature_wildlife",
  "food_drink",
  "arts_creativity",
  "learning",
  "culture_heritage",
  "wellness",
  "entertainment",
  "community",
  "sports",
  "local_life",
  "events",
]);

/**
 * The twelve categories the contract declares, for the 400 an unknown one gets.
 *
 * Typed off the schema rather than written out, so the day the enum grows this
 * mock grows with it instead of refusing a value production accepts — which is
 * the exact drift `pnpm contract:check` exists to prevent one layer up.
 */
export const KNOWN_CATEGORIES = new Set<string>([
  "adventure",
  "nature_wildlife",
  "food_drink",
  "arts_creativity",
  "learning",
  "culture_heritage",
  "wellness",
  "entertainment",
  "community",
  "sports",
  "local_life",
  "events",
] satisfies components["schemas"]["Category"][]);

/**
 * `bookableFrom` and `bookableTo` (yuvoy-api#258), read and refused as the
 * API reads and refuses them: both or neither, never beside `bookableOn`,
 * real days, the end not before the start and at most 31 days after it, each
 * refusal its `400 invalid_input` with the API's own words. Refused, never
 * clamped: a mock that quietly cut a long range would let a client that
 * sends one pass, against an API that answers it with a 400.
 *
 * `null` for no range, or the 400 to answer with.
 */
export function bookableRangeOf(
  u: URL,
): { from: string; to: string } | null | Response {
  const from = u.searchParams.get("bookableFrom") ?? "";
  const to = u.searchParams.get("bookableTo") ?? "";
  const bookableOn = u.searchParams.get("bookableOn") ?? "";
  if (!from && !to) return null;

  const refuse = (message: string, details: Record<string, string>) =>
    HttpResponse.json(
      { error: { code: "invalid_input", message, details } },
      { status: 400, headers: mockHeaders(requestId()) },
    );
  if (!from || !to) {
    return refuse("send bookableFrom and bookableTo together", {
      bookableFrom: from,
      bookableTo: to,
    });
  }
  if (bookableOn) {
    return refuse(
      "use bookableOn for one day, or bookableFrom and bookableTo for several, not both",
      { bookableOn, bookableFrom: from, bookableTo: to },
    );
  }
  const day = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [y, m, d] = value.split("-").map(Number);
    const ms = Date.UTC(y, m - 1, d);
    return new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
  };
  const start = day(from);
  if (start === null) {
    return refuse("bookableFrom should look like 2026-10-15", {
      bookableFrom: from,
    });
  }
  const end = day(to);
  if (end === null) {
    return refuse("bookableTo should look like 2026-10-18", {
      bookableTo: to,
    });
  }
  if (end < start) {
    return refuse("bookableTo cannot be before bookableFrom", {
      bookableFrom: from,
      bookableTo: to,
    });
  }
  if (end - start > 31 * 86_400_000) {
    return refuse("bookableFrom and bookableTo can be at most 31 days apart", {
      bookableFrom: from,
      bookableTo: to,
    });
  }
  return { from, to };
}

/**
 * Whether a listing is bookable on some day of the range. `nextAvailable` is
 * the only date a fixture carries, so it stands in for the departure list, as
 * it does for `bookableOn`; and under a range the API answers the first
 * departure INSIDE it there, which a fixture's one date already is.
 */
export function inRange(
  nextAvailable: string | undefined | null,
  range: { from: string; to: string } | null,
): boolean {
  if (!range) return true;
  return Boolean(
    nextAvailable && nextAvailable >= range.from && nextAvailable <= range.to,
  );
}
