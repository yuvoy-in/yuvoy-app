/**
 * The trip as a calendar event (yuvoy-app#38 item 5).
 *
 * ## Why a file rather than a link to Google Calendar
 *
 * A `calendar.google.com/render?...` link is one line of code and it is the
 * wrong one here. It assumes an account this product never asks for, it opens
 * a browser on a phone whose calendar is not Google's, and on iOS it is a
 * detour through a web page to reach an app that reads `.ics` natively.
 *
 * An `.ics` file is the interchange format every calendar on every platform
 * already understands, and it works with no account and no network.
 *
 * ## RFC 5545 is picky in three ways that matter
 *
 * **CRLF, everywhere.** The spec says lines end `\r\n`, and some parsers that
 * tolerate bare `\n` inside a file still reject a `BEGIN:VCALENDAR` that does
 * not end correctly.
 *
 * **TEXT values are escaped**: backslash, semicolon, comma and newline all
 * carry meaning in the format. An operator's name with a comma in it, or a
 * meeting point written over two lines, silently truncates the field or shifts
 * everything after it into the wrong property.
 *
 * **Lines fold at 75 octets**, continued by CRLF and one space. Plenty of
 * parsers cope without it; Outlook historically has not, and a meeting point
 * is exactly the field long enough to hit it.
 *
 * Folding counts OCTETS rather than characters, which is the part that is easy
 * to get wrong: a listing title with an emoji or a name in Devanagari is
 * several bytes per character, so folding by `length` would split a character
 * in half and produce mojibake in somebody's calendar.
 */

export interface CalendarEvent {
  /** `SUMMARY`. The listing's title. */
  title: string;
  /** `DTSTART`. An ISO instant. */
  startsAt: string;
  /** Minutes. `DTEND` is omitted when this is absent. */
  durationMinutes?: number | null;
  /** `LOCATION`. The meeting point, with its landmark when there is one. */
  location?: string | null;
  /** `DESCRIPTION`. */
  description?: string | null;
  /** `UID`. Stable per booking, so re-adding updates rather than duplicates. */
  uid: string;
}

/**
 * `20260822T013000Z`, the only form of DTSTART this writes.
 *
 * UTC with the trailing `Z`, never a local time with a `TZID`. A floating or
 * zoned time needs the VTIMEZONE block that names it, and a `TZID` a calendar
 * does not recognise is displayed at the wrong hour rather than refused. The
 * instant is unambiguous and every client renders it in the reader's own zone,
 * which is what somebody adding a trip to their phone wants.
 */
function icsInstant(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return (
    `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** Escapes a TEXT value. Order matters: the backslash must go first. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Folds one content line to 75 octets, counting bytes rather than characters.
 *
 * A character is never split: the line is cut at the last boundary that still
 * fits, so a multi-byte name survives intact. Continuation lines carry one
 * leading space, which a parser strips.
 */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const out: string[] = [];
  let current = "";
  let used = 0;
  // 75 for the first line, 74 for continuations, which each spend one on the
  // leading space.
  let limit = 75;

  for (const char of line) {
    const size = new TextEncoder().encode(char).length;
    if (used + size > limit) {
      out.push(current);
      current = "";
      used = 0;
      limit = 74;
    }
    current += char;
    used += size;
  }
  if (current) out.push(current);
  return out.join("\r\n ");
}

/**
 * The whole file, as a string.
 *
 * `now` is injectable so `DTSTAMP` can be pinned in a test. It is the only
 * field that is not derived from the booking, and an un-pinnable one would
 * make the output untestable as a whole.
 */
export function buildIcs(event: CalendarEvent, now: Date = new Date()): string {
  const start = new Date(event.startsAt);
  if (!Number.isFinite(start.getTime())) {
    throw new Error("calendar: startsAt is not an instant");
  }

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Yuvoy//Traveller//EN",
    "CALSCALE:GREGORIAN",
    /*
      PUBLISH, not REQUEST. REQUEST is an invitation from an organiser and
      makes the traveller's calendar try to RSVP to an address we do not
      operate; some clients then show accept and decline buttons that answer
      nobody. This is a copy of something already arranged.
    */
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeText(event.uid)}`,
    `DTSTAMP:${icsInstant(now)}`,
    `DTSTART:${icsInstant(start)}`,
  ];

  /*
    DTEND only when the duration is known, and the issue says so: "left out if
    that call fails". An event with no end is rendered by every calendar as a
    short default block, which is honest about not knowing. Inventing an hour
    would put a wrong finishing time in somebody's day.
  */
  if (
    typeof event.durationMinutes === "number" &&
    Number.isFinite(event.durationMinutes) &&
    event.durationMinutes > 0
  ) {
    lines.push(
      `DTEND:${icsInstant(new Date(start.getTime() + event.durationMinutes * 60_000))}`,
    );
  }

  lines.push(`SUMMARY:${escapeText(event.title)}`);
  if (event.location?.trim()) {
    lines.push(`LOCATION:${escapeText(event.location.trim())}`);
  }
  if (event.description?.trim()) {
    lines.push(`DESCRIPTION:${escapeText(event.description.trim())}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");

  // Folded last, so escaping cannot push a line past 75 unnoticed.
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** "Try-dive at Nemo Reef" becomes `try-dive-at-nemo-reef.ics`. */
export function icsFilename(title: string): string {
  const stem =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "trip";
  return `${stem}.ics`;
}
