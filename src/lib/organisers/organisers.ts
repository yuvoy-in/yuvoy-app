import {
  civilFromDate,
  clockTime,
  weekdayDayMonth,
  type Civil,
} from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { sentLinkRows } from "./organisers-links";
import type {
  Organiser,
  OrganiserEvent,
  OrganiserEventInput,
  OrganiserEventNumbers,
  OrganiserEventState,
  OrganiserInput,
  OrganiserLink,
  OrganiserState,
} from "./types";
import { ORGANISER_WORDS as W } from "./words";

/**
 * What an organiser's state and the person's role allow, and how its pages
 * and events are said and sent (yuvoy-app#224, the web half of
 * yuvoy-mobile#393). Ported from the phone's `organisers.ts` on
 * yuvoy-mobile dev, with the group setup of yuvoy-app#225 (yuvoy-mobile#395).
 * The API holds every one of these rules too; these decide only what is drawn
 * and what is sent.
 */

/** The most departments a page runs, and the most links it carries. */
export const ORGANISER_MAX_DEPARTMENTS = 3;
export const ORGANISER_MAX_LINKS = 3;
/** The page's limits, as the API holds them. */
export const ORGANISER_NAME_MIN = 2;
export const ORGANISER_NAME_MAX = 120;
export const ORGANISER_ABOUT_MAX = 600;
export const ORGANISER_LINK_MAX = 2048;

/* ------------------------------------------------------------ the page -- */

/** The state card's sentence. The code is drawn large beside it while it waits. */
export function organiserStateLine(
  organiser: Pick<Organiser, "state" | "name" | "verificationCode">,
): string {
  const code = organiser.verificationCode ?? "";
  switch (organiser.state) {
    case "pending":
      return W.pendingLine(code);
    case "not_verified":
      return W.notVerifiedLine(code);
    case "verified":
      return W.verifiedLine(organiser.name);
    case "suspended":
      return W.suspended;
    case "closed":
      return W.closed;
  }
}

/** The code shows, with Copy code, only while pending or not verified, and only when sent. */
export function showsCode(
  organiser: Pick<Organiser, "state" | "verificationCode">,
): boolean {
  return (
    (organiser.state === "pending" || organiser.state === "not_verified") &&
    typeof organiser.verificationCode === "string" &&
    organiser.verificationCode.trim() !== ""
  );
}

/** "Post an event": hidden while suspended or closed. */
export function canPost(organiser: Pick<Organiser, "state">): boolean {
  return organiser.state !== "suspended" && organiser.state !== "closed";
}

/** "Edit page": owners only, and never once closed (a suspended page can still be edited). */
export function canEditPage(
  organiser: Pick<Organiser, "state" | "role">,
): boolean {
  return organiser.role === "owner" && organiser.state !== "closed";
}

/** "Helpers": owners only. Adding one needs a verified organiser (`canAddHelpers`). */
export function seesHelpers(organiser: Pick<Organiser, "role">): boolean {
  return organiser.role === "owner";
}

/** Only a verified organiser takes helpers; before that the button is off with the API's line. */
export function canAddHelpers(
  organiser: Pick<Organiser, "state" | "role">,
): boolean {
  return organiser.role === "owner" && organiser.state === "verified";
}

/** Why "Add helper" is off for an owner, or null when it is on. */
export function addHelpersOffLine(state: OrganiserState): string | null {
  if (state === "verified") return null;
  if (state === "suspended") return W.suspended;
  if (state === "closed") return W.closed;
  return W.helpersAfterCheck;
}

/** Every button the organiser's page draws, at once, for its state and the person's role. */
export interface OrganiserActions {
  post: boolean;
  editPage: boolean;
  helpers: boolean;
  addHelpers: boolean;
  /** Why "Add helper" is off, for an owner who sees it off; null otherwise. */
  addHelpersOff: string | null;
  copyCode: boolean;
}

export function organiserActions(
  organiser: Pick<Organiser, "state" | "role" | "verificationCode">,
): OrganiserActions {
  const helpers = seesHelpers(organiser);
  return {
    post: canPost(organiser),
    editPage: canEditPage(organiser),
    helpers,
    addHelpers: canAddHelpers(organiser),
    addHelpersOff: helpers ? addHelpersOffLine(organiser.state) : null,
    copyCode: showsCode(organiser),
  };
}

/** The page form as typed. */
export interface OrganiserPageForm {
  name: string;
  destinationKey: string;
  departments: readonly string[];
  about: string;
  links: readonly OrganiserLink[];
  contactEmail: string;
}

/**
 * The whole page as `createOrganiser` and `updateOrganiser` take it, from what
 * the form holds. Every field is sent: one left out is cleared, so the contact
 * email an owner was shown goes back to keep it, and an emptied one is left
 * out to clear it. Nothing is trimmed away but blank optional fields.
 */
export function organiserInput(form: OrganiserPageForm): OrganiserInput {
  const body: OrganiserInput = {
    name: form.name.trim(),
    destinationKey: form.destinationKey,
    departments: [...form.departments],
    runsIt: true,
  };
  const about = form.about.trim();
  if (about) body.about = about;
  const links = sentLinkRows(form).map((row) => {
    const link = form.links[row] as OrganiserLink;
    return { kind: link.kind, url: link.url.trim() };
  });
  if (links.length > 0) body.links = links;
  const email = form.contactEmail.trim();
  if (email) body.contactEmail = email;
  return body;
}

/** A new page's form. */
export function emptyOrganiserForm(destinationKey = ""): OrganiserPageForm {
  return {
    name: "",
    destinationKey,
    departments: [],
    about: "",
    links: [],
    contactEmail: "",
  };
}

/** What the edit form starts from: the page as the API sent it, every optional field filled in. */
export function organiserForm(organiser: Organiser): OrganiserPageForm {
  return {
    name: organiser.name,
    destinationKey: organiser.destinationKey,
    departments: [...organiser.departments],
    about: organiser.about ?? "",
    links: organiser.links.map((link) => ({ ...link })),
    contactEmail: organiser.contactEmail ?? "",
  };
}

/* -------------------------------------------------------- times and dates -- */

/**
 * The civil fields of an instant as the API wrote it, in its own offset: an
 * event's `startsAt` is in the place's zone already, so it is read as written
 * and never moved to the browser's zone. Null for anything that is not
 * `YYYY-MM-DDTHH:MM`, so a screen shows nothing rather than a wrong time.
 */
export function civilAsWritten(iso: string): Civil | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (!realDay(year, month, day)) return null;
  if (hour > 23 || minute > 59) return null;
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { year, month, day, hour, minute, weekday };
}

/** True for a day that exists: 30 February and 31 April do not. */
export function realDay(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const at = new Date(Date.UTC(year, month - 1, day));
  return at.getUTCMonth() === month - 1 && at.getUTCDate() === day;
}

/** An event's start on its row: "Sun, 1 Nov, 06:30", in the place's own time. Empty if unreadable. */
export function eventStartLabel(
  event: Pick<OrganiserEvent, "startsAt">,
): string {
  const civil = civilAsWritten(event.startsAt);
  return civil ? `${weekdayDayMonth(civil)}, ${clockTime(civil)}` : "";
}

/**
 * An event's time as written, in the place's own zone: "Sun, 1 Nov, 06:30 to
 * 08:00", with the end's day when it falls on another. Empty when the start
 * cannot be read.
 */
export function eventTimeLabel(
  event: Pick<OrganiserEvent, "startsAt" | "endsAt">,
): string {
  const start = civilAsWritten(event.startsAt);
  if (!start) return "";
  const first = `${weekdayDayMonth(start)}, ${clockTime(start)}`;
  const end = event.endsAt ? civilAsWritten(event.endsAt) : null;
  if (!end) return first;
  const sameDay =
    end.year === start.year &&
    end.month === start.month &&
    end.day === start.day;
  return sameDay
    ? `${first} to ${clockTime(end)}`
    : `${first} to ${weekdayDayMonth(end)}, ${clockTime(end)}`;
}

/** A date (`YYYY-MM-DD`) as the screens say it: "Sat, 31 Oct". Empty if it is not one. */
export function eventDayLabel(day: string | null | undefined): string {
  const civil = day ? civilFromDate(day) : null;
  return civil ? weekdayDayMonth(civil) : "";
}

const IST_MS = 330 * 60_000;

/**
 * An instant written in India's offset, as the API writes a place's time:
 * `2026-11-01T06:30:00+05:30`. Every place an organiser can pick is in India.
 * Null for anything that is not an instant.
 */
export function writtenInIndia(instant: string): string | null {
  const at = Date.parse(instant);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(instant) || !Number.isFinite(at)) return null;
  return `${new Date(at + IST_MS).toISOString().slice(0, 19)}+05:30`;
}

/**
 * A date seven days before `on` (`YYYY-MM-DD`), for the numbers' last-week
 * block: the current date's numbers come with no `on`, last week's with this
 * one. Null for anything else.
 */
export function weekBefore(on: string | null): string | null {
  if (!on || !/^\d{4}-\d{2}-\d{2}$/.test(on)) return null;
  const at = Date.parse(`${on}T00:00:00Z`);
  if (!Number.isFinite(at)) return null;
  return new Date(at - 7 * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The `on` for the numbers' last-week block, or null when there is none: a
 * weekly event with a card, whose current date (`on`, from the current block)
 * is at least a week after its first. A one-off event has one date, so one
 * block.
 */
export function lastWeekOn(
  event: Pick<OrganiserEvent, "eventId" | "repeatsWeeklyUntil" | "startsAt">,
  on: string | null,
): string | null {
  if (!event.eventId || !event.repeatsWeeklyUntil) return null;
  const before = weekBefore(on);
  const first = event.startsAt.slice(0, 10);
  return before && /^\d{4}-\d{2}-\d{2}$/.test(first) && before >= first
    ? before
    : null;
}

/* ------------------------------------------------------- events as shown -- */

/** An event row's state line: the spec's label, with the desk's reason on a not accepted one. */
export function eventStateLine(
  event: Pick<OrganiserEvent, "state" | "notAcceptedReason">,
): string {
  return W.eventStateLabel(event.state, event.notAcceptedReason);
}

/** "Free", or "From ₹499" for a paid event; empty for a paid one that came with no price. */
export function eventPriceLine(
  event: Pick<OrganiserEvent, "free" | "priceFromRupees">,
): string {
  if (event.free) return W.eventFree;
  return typeof event.priceFromRupees === "number"
    ? W.priceFrom(
        formatMoney({
          amountMinor: event.priceFromRupees * 100,
          currency: "INR",
        }),
      )
    : "";
}

/** The spec's numbers line. Counts only, never a name. */
export function numbersLine(
  numbers: Pick<
    OrganiserEventNumbers,
    "going" | "ticketTapsAtLeast" | "checkedIn" | "went"
  >,
): string {
  return W.numbers(numbers);
}

/* ---------------------------------------------------- events as changed -- */

/** The event states a member can still change or cancel. */
const OPEN_EVENT: ReadonlySet<OrganiserEventState> = new Set([
  "in_checking",
  "live",
  "changes_in_checking",
]);

/** "Change": while the event is open and the organiser can post (not suspended or closed). */
export function canChangeEvent(
  organiser: Pick<Organiser, "state">,
  event: Pick<OrganiserEvent, "state">,
): boolean {
  return canPost(organiser) && OPEN_EVENT.has(event.state);
}

/**
 * The API's sentence for a change the event's state no longer allows, said
 * where "Change" would be; null while it can be changed.
 */
export function eventChangeRefusal(state: OrganiserEventState): string | null {
  if (state === "ended") return W.endedNoChange;
  if (state === "cancelled") return W.cancelledNoChange;
  if (state === "not_accepted") return W.notAcceptedNoChange;
  return null;
}

/**
 * "Cancel this event": while it is open, in every organiser state and while
 * paused (the API takes a cancel then too). A cancelled one is cancelled
 * already; an ended or not accepted one is 409.
 */
export function canCancelEvent(event: Pick<OrganiserEvent, "state">): boolean {
  return OPEN_EVENT.has(event.state);
}

/** The event form as typed: every field text, the start and end as their boxes hold them. */
export interface OrganiserEventForm {
  title: string;
  department: string;
  /** What the date and time box holds: the API's start, a picked instant, or typed text. */
  start: string;
  end: string;
  /** `YYYY-MM-DD`, or "" for an event on one date. */
  until: string;
  destinationKey: string;
  venueName: string;
  address: string;
  free: boolean;
  price: string;
  priceNote: string;
  link: string;
  about: string;
}

/** A new event's form, in the organiser's own place. */
export function emptyEventForm(destinationKey: string): OrganiserEventForm {
  return {
    title: "",
    department: "",
    start: "",
    end: "",
    until: "",
    destinationKey,
    venueName: "",
    address: "",
    free: true,
    price: "",
    priceNote: "",
    link: "",
    about: "",
  };
}

/** What the change form starts from: the event as the API sent it, absent fields empty. */
export function eventForm(event: OrganiserEvent): OrganiserEventForm {
  return {
    title: event.title,
    department: event.department,
    start: event.startsAt,
    end: event.endsAt ?? "",
    until: event.repeatsWeeklyUntil ?? "",
    destinationKey: event.destinationKey,
    venueName: event.venueName,
    address: event.address ?? "",
    free: event.free,
    price:
      event.priceFromRupees === undefined ? "" : String(event.priceFromRupees),
    priceNote: event.priceNote ?? "",
    link: event.link,
    about: event.about ?? "",
  };
}

/** A price as typed, in whole rupees ("1,000" and "1000" alike), or undefined when it is not one. */
export function typedRupees(text: string): number | undefined {
  const digits = text.replace(/[\s,]/g, "");
  return /^\d{1,9}$/.test(digits) ? Number(digits) : undefined;
}

/**
 * The whole event as `postOrganiserEvent` and `editOrganiserEvent` take it.
 * The start and end come already written with their offset (`writtenInIndia`,
 * or the API's own when unchanged). Every field is sent; an empty optional one
 * is left out, which clears it on an edit. A price goes only with a paid
 * event, and the server judges it.
 */
export function eventInput(
  form: OrganiserEventForm,
  times: { startsAt: string; endsAt?: string | undefined },
): OrganiserEventInput {
  const body: OrganiserEventInput = {
    title: form.title.trim(),
    department: form.department,
    startsAt: times.startsAt,
    destinationKey: form.destinationKey,
    venueName: form.venueName.trim(),
    free: form.free,
    link: form.link.trim(),
  };
  if (times.endsAt) body.endsAt = times.endsAt;
  if (form.until.trim()) body.repeatsWeeklyUntil = form.until.trim();
  const address = form.address.trim();
  if (address) body.address = address;
  const price = form.free ? undefined : typedRupees(form.price);
  if (price !== undefined) body.priceFromRupees = price;
  const note = form.priceNote.trim();
  if (note) body.priceNote = note;
  const about = form.about.trim();
  if (about) body.about = about;
  return body;
}
