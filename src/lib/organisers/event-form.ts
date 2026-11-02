import { civilFromDate } from "@/lib/format/date";
import {
  civilAsWritten,
  typedRupees,
  writtenInIndia,
  type OrganiserEventForm,
} from "./organisers";
import type { OrganiserEventState } from "./types";
import { ORGANISER_WORDS as W } from "./words";

/**
 * The event form's boxes and checks on the web (yuvoy-app#224, from the
 * phone's `organiser-event-form.tsx` on yuvoy-mobile dev). The web's start
 * and end are `datetime-local` boxes holding India's wall clock
 * (`2026-11-01T06:30`, no offset) and the weekly repeat is a `date` box
 * (`YYYY-MM-DD`). Every place an organiser can pick is in India, so a typed
 * time is sent with `+05:30`. The server judges everything else.
 */

const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
/** The weekly repeat's last date may be at most 26 weeks from today. */
export const REPEAT_WEEKS = 26;

/** India's wall clock at an instant, as a date and time box holds it: `2026-11-01T06:30`. */
export function indiaClock(ms: number): string {
  return new Date(ms + IST_MS).toISOString().slice(0, 16);
}

/**
 * What a date and time box shows for a value. An instant with an offset (the
 * API's own) is shown as India's wall clock; anything else (typed, or empty)
 * is shown as it is.
 */
export function eventBoxValue(value: string): string {
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value.trim())) {
    const india = writtenInIndia(value.trim());
    if (india) return india.slice(0, 16);
  }
  return value;
}

/**
 * A start or end box's value as the API takes it: the API's own instant
 * (`kept`) when the box still shows it, so an event that has started may keep
 * its start; else the typed India time with `+05:30`. "" for an empty box,
 * null for one no time can be read from.
 */
export function eventTimeOf(box: string, kept = ""): string | null {
  const value = box.trim();
  if (!value) return "";
  if (kept && value === eventBoxValue(kept)) return kept;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::00)?$/.exec(value);
  if (!match?.[1] || !civilAsWritten(match[1])) return null;
  return `${match[1]}:00+05:30`;
}

/** A date as typed, `YYYY-MM-DD`, or null when it is not a real date. */
export function typedDay(text: string): string | null {
  const value = text.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && civilFromDate(value)
    ? value
    : null;
}

/**
 * The weekly repeat's bounds: from the start's own date (today in India while
 * no start is picked) to 26 weeks from today in India.
 */
export function repeatBounds(
  startBox: string,
  nowMs: number,
): { min: string; max: string } {
  const start = eventBoxValue(startBox).slice(0, 10);
  return {
    min: typedDay(start) ?? indiaClock(nowMs).slice(0, 10),
    max: indiaClock(nowMs + REPEAT_WEEKS * 7 * DAY_MS).slice(0, 10),
  };
}

/** What the change form started from: the API's own start, end and repeat. */
export interface EventKept {
  start: string;
  end: string;
  until: string;
}

export type EventFormCheck =
  | { ok: true; times: { startsAt: string; endsAt?: string } }
  | { ok: false; fields: Record<string, string>; line: string | null };

/**
 * What the form cannot send at all, in the API's own words, each under its
 * field. `line` is "Check the fields marked" only when more than one is
 * marked; one sentence stays under its field alone. An unchanged repeat on a
 * change is not judged here.
 */
export function checkEventForm(
  form: OrganiserEventForm,
  kept: EventKept,
  nowMs: number,
): EventFormCheck {
  const fields: Record<string, string> = {};
  const startsAt = eventTimeOf(form.start, kept.start);
  if (!startsAt) fields.startsAt = W.needStart;
  const endsAt = eventTimeOf(form.end, kept.end);
  if (endsAt === null) fields.endsAt = W.needEnd;
  const until = form.until.trim();
  if (until && until !== kept.until) {
    const day = typedDay(until);
    const { min, max } = repeatBounds(form.start, nowMs);
    if (!day || day < min || day > max) {
      fields.repeatsWeeklyUntil = W.repeatRange;
    }
  }
  if (
    !form.free &&
    form.price.trim() &&
    typedRupees(form.price) === undefined
  ) {
    fields.priceFromRupees = W.needPrice;
  }
  const marked = Object.keys(fields).length;
  if (marked > 0 || !startsAt) {
    return { ok: false, fields, line: marked > 1 ? W.checkFields : null };
  }
  return { ok: true, times: endsAt ? { startsAt, endsAt } : { startsAt } };
}

const STATES: ReadonlySet<string> = new Set<OrganiserEventState>([
  "in_checking",
  "live",
  "changes_in_checking",
  "cancelled",
  "not_accepted",
  "ended",
]);

/** The state a post came back in, from the form's `?sent=`; null for anything else. */
export function sentState(value: unknown): OrganiserEventState | null {
  const one = Array.isArray(value) ? value[0] : value;
  return typeof one === "string" && STATES.has(one)
    ? (one as OrganiserEventState)
    : null;
}
