import { describe, it, expect } from "vitest";
import { buildIcs, icsFilename } from "./calendar";

/**
 * The file a traveller's calendar has to read (yuvoy-app#38 item 5).
 *
 * Asserted as exact strings, because every defect this format has is a silent
 * one. A missing escape does not throw: it moves the rest of the line into a
 * different property, and the traveller finds out when the meeting point is
 * missing on the morning of the dive.
 */

const NOW = new Date("2026-08-20T09:00:00Z");

const base = {
  uid: "YV-4K2M9P7Q@yuvoy.in",
  title: "Try-dive at Nemo Reef",
  startsAt: "2026-08-22T01:30:00Z",
  durationMinutes: 180,
  location: "Havelock Jetty",
  description: "Booking YV-4K2M9P7Q",
};

describe("buildIcs", () => {
  it("writes a complete event a calendar will accept", () => {
    expect(buildIcs(base, NOW)).toBe(
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Yuvoy//Traveller//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        "UID:YV-4K2M9P7Q@yuvoy.in",
        "DTSTAMP:20260820T090000Z",
        "DTSTART:20260822T013000Z",
        "DTEND:20260822T043000Z",
        "SUMMARY:Try-dive at Nemo Reef",
        "LOCATION:Havelock Jetty",
        "DESCRIPTION:Booking YV-4K2M9P7Q",
        "END:VEVENT",
        "END:VCALENDAR",
        "",
      ].join("\r\n"),
    );
  });

  it("ends every line with CRLF, including the last", () => {
    /*
      The spec's line ending, and some parsers that tolerate a bare newline
      inside a file still reject one at the end of BEGIN:VCALENDAR.
    */
    const ics = buildIcs(base, NOW);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("omits DTEND rather than inventing a finishing time", () => {
    /*
      The issue's own instruction: the duration comes from a second request and
      is "left out if that call fails". A calendar renders an event with no end
      as a short default block, which is honest about not knowing. An invented
      hour is a wrong finishing time in somebody's day.
    */
    for (const duration of [null, undefined, 0, -30, NaN]) {
      const ics = buildIcs({ ...base, durationMinutes: duration }, NOW);
      expect(ics, String(duration)).not.toContain("DTEND");
      expect(ics).toContain("DTSTART:20260822T013000Z");
    }
  });

  it("escapes the four characters that carry meaning", () => {
    /*
      The defect that does not throw. An operator's name with a comma in it
      silently splits the value, and everything after the comma lands in a
      property nobody reads.
    */
    const ics = buildIcs(
      {
        ...base,
        title: "Dive, snorkel; and a swim",
        location: "Jetty 2\\Gate 3",
        description: "Line one\nLine two",
      },
      NOW,
    );
    expect(ics).toContain("SUMMARY:Dive\\, snorkel\\; and a swim");
    expect(ics).toContain("LOCATION:Jetty 2\\\\Gate 3");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two");
  });

  it("folds a long line, and never mid-character", () => {
    /*
      Folding counts OCTETS, not characters, which is the half that is easy to
      get wrong. A title in Devanagari is three bytes a character, so folding
      by `length` would cut one in half and put mojibake in a calendar.
    */
    const long =
      "नेमो रीफ पर ट्राई-डाइव के साथ एक लंबी सुबह की यात्रा और नाश्ता";
    const ics = buildIcs({ ...base, title: long }, NOW);

    const lines = ics.split("\r\n");
    for (const line of lines) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }

    // Unfolding puts it back exactly, which is the real assertion: a fold that
    // loses or mangles a byte would still pass the length check above.
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(`SUMMARY:${long}`);
  });

  it("leaves out a location or description there is none of", () => {
    const ics = buildIcs({ ...base, location: null, description: "   " }, NOW);
    expect(ics).not.toContain("LOCATION");
    expect(ics).not.toContain("DESCRIPTION");
  });

  it("refuses an instant it cannot read", () => {
    // Better than writing `DTSTART:NaNNaNNaN`, which a calendar accepts as a
    // line and then shows as an event in the year zero.
    expect(() => buildIcs({ ...base, startsAt: "nope" }, NOW)).toThrow();
  });

  it("pads a single-digit month, day and hour", () => {
    const ics = buildIcs(
      { ...base, startsAt: "2026-01-02T03:04:05Z", durationMinutes: null },
      NOW,
    );
    expect(ics).toContain("DTSTART:20260102T030405Z");
  });
});

describe("icsFilename", () => {
  it("makes a plain, lowercase name from the title", () => {
    expect(icsFilename("Try-dive at Nemo Reef")).toBe(
      "try-dive-at-nemo-reef.ics",
    );
    expect(icsFilename("Dive, snorkel & swim!")).toBe("dive-snorkel-swim.ics");
  });

  it("falls back rather than producing a nameless file", () => {
    // A title with nothing ASCII in it would otherwise be ".ics", which some
    // systems treat as a hidden file with no name.
    expect(icsFilename("नेमो रीफ")).toBe("trip.ics");
    expect(icsFilename("")).toBe("trip.ics");
  });
});
