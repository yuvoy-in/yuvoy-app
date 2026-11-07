import type { components } from "../src/lib/api/schema.gen";
import { PLACES } from "./fixtures";

/**
 * The field checks the organiser mocks make on a page or an event body,
 * with the sentences the API gives (yuvoy-app#224). Split out of
 * `organiser-handlers.ts` to keep it short.
 */

type Organiser = components["schemas"]["Organiser"];
type OrganiserEvent = components["schemas"]["OrganiserEvent"];

/**
 * Places the API names but `GET /places` does not list yet: an organiser's
 * `placeName` still reads right there (yuvoy-api#596).
 */
export const NOT_OPEN_PLACES: Readonly<Record<string, string>> = {
  "andaman/long_island": "Long Island",
};

/** `placeName` as the API fills it: the listed name, else the unlisted one. */
export function placeNameOf(key: string): string {
  for (const market of PLACES.markets) {
    const found = market.destinations.find((d) => d.key === key);
    if (found) return found.name;
  }
  return NOT_OPEN_PLACES[key] ?? key;
}

/** The API's whole-body 400 for a field the input lacks (`planBody`). */
export const BAD_BODY = "Send it as the API contract describes it.";

/** `placeName` is read only: a page body that sends it is a bad body. */
export const sendsReadOnly = (body: Record<string, unknown>) =>
  "placeName" in body;

export async function bodyOf(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    return typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** A sent string, trimmed; anything else is empty. */
export const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** The page fields as `createOrganiser` and `updateOrganiser` check them. */
export function pageProblems(
  body: Record<string, unknown>,
): Record<string, string> {
  const problems: Record<string, string> = {};
  const name = text(body.name);
  if (name.length < 2 || name.length > 120) {
    problems.name = "Give the name people know you by, 2 to 120 characters.";
  }
  if (!text(body.destinationKey)) problems.destinationKey = "Choose a place.";
  return { ...problems, ...restProblems(body) };
}

/**
 * The fields every page body has, a group's too (yuvoy-app#225): departments,
 * the ticked line and the links. A group's name and place are the group's.
 */
export function restProblems(
  body: Record<string, unknown>,
): Record<string, string> {
  const problems: Record<string, string> = {};
  const departments = Array.isArray(body.departments) ? body.departments : [];
  if (departments.length < 1 || departments.length > 3) {
    problems.departments = "Choose one to three kinds of event.";
  }
  if (body.runsIt !== true) {
    problems.runsIt = "Say that you run this group or these events.";
  }
  const links = Array.isArray(body.links) ? body.links : [];
  links.forEach((link, i) => {
    const u = text((link as { url?: unknown } | null)?.url);
    if (!u.startsWith("https://")) {
      problems[`links.${i}`] = "Give a link that starts with https://.";
    }
  });
  return problems;
}

export function pageFrom(body: Record<string, unknown>) {
  return {
    name: text(body.name),
    destinationKey: text(body.destinationKey),
    placeName: placeNameOf(text(body.destinationKey)),
    departments: (body.departments as string[]).slice(0, 3),
    ...(text(body.about) ? { about: text(body.about) } : {}),
    links: Array.isArray(body.links) ? (body.links as Organiser["links"]) : [],
    ...(text(body.contactEmail)
      ? { contactEmail: text(body.contactEmail) }
      : {}),
  };
}

/** The event fields as `postOrganiserEvent` and `editOrganiserEvent` check them. */
export function eventProblems(
  body: Record<string, unknown>,
): Record<string, string> {
  const problems: Record<string, string> = {};
  if (!text(body.title)) problems.title = "Give the event a name.";
  if (!text(body.department)) problems.department = "Choose a kind of event.";
  if (Number.isNaN(Date.parse(text(body.startsAt)))) {
    problems.startsAt = "Give the day and time it starts.";
  }
  if (!text(body.venueName)) problems.venueName = "Give the place it is at.";
  if (!text(body.link).startsWith("https://")) {
    problems.link = "Give a link that starts with https://.";
  }
  const price = body.priceFromRupees;
  if (body.free === true && price !== undefined) {
    problems.priceFromRupees = "A free event has no price.";
  }
  if (
    body.free !== true &&
    (typeof price !== "number" || price < 1 || price > 100_000)
  ) {
    problems.priceFromRupees = "Give a price from 1 to 1,00,000 rupees.";
  }
  if (text(body.priceNote).length > 80) {
    problems.priceNote = "Keep the price note to 80 characters.";
  }
  return problems;
}

export type EventFields = Omit<
  OrganiserEvent,
  "id" | "state" | "eventId" | "notAcceptedReason" | "lastCheckedAt" | "picture"
>;

export function eventFrom(body: Record<string, unknown>): EventFields {
  const optional = (key: string) => text(body[key]) || undefined;
  const fields: EventFields = {
    title: text(body.title),
    department: text(body.department),
    startsAt: text(body.startsAt),
    endsAt: optional("endsAt"),
    repeatsWeeklyUntil: optional("repeatsWeeklyUntil"),
    destinationKey: text(body.destinationKey),
    venueName: text(body.venueName),
    address: optional("address"),
    free: body.free === true,
    priceFromRupees:
      body.free === true ? undefined : Number(body.priceFromRupees),
    priceNote: optional("priceNote"),
    link: text(body.link),
    about: optional("about"),
  };
  // Leave out what was not sent, as the API does.
  return Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== undefined),
  ) as EventFields;
}
