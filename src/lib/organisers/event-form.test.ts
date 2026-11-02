import { describe, expect, it } from "vitest";
import {
  checkEventForm,
  eventBoxValue,
  eventTimeOf,
  indiaClock,
  repeatBounds,
  sentState,
  typedDay,
} from "./event-form";
import { emptyEventForm, type OrganiserEventForm } from "./organisers";
import { ORGANISER_WORDS as W } from "./words";

/** 2026-11-01T00:30Z: 06:00 on 1 Nov in India. */
const NOW = Date.parse("2026-11-01T00:30:00Z");
const NONE = { start: "", end: "", until: "" };

function form(over: Partial<OrganiserEventForm> = {}): OrganiserEventForm {
  return {
    ...emptyEventForm("andaman/havelock"),
    title: "Sunrise walk",
    department: "nature_wildlife",
    start: "2026-11-08T06:30",
    venueName: "Forest Gate",
    link: "https://walkers.example.com",
    ...over,
  };
}

describe("indiaClock", () => {
  it("writes India's wall clock, crossing midnight", () => {
    expect(indiaClock(NOW)).toBe("2026-11-01T06:00");
    expect(indiaClock(Date.parse("2026-10-31T19:00:00Z"))).toBe(
      "2026-11-01T00:30",
    );
  });
});

describe("eventBoxValue", () => {
  it("shows an instant with an offset as India's wall clock", () => {
    expect(eventBoxValue("2026-11-08T06:30:00+05:30")).toBe("2026-11-08T06:30");
    expect(eventBoxValue("2026-11-08T01:00:00Z")).toBe("2026-11-08T06:30");
  });

  it("leaves typed and empty values as they are", () => {
    expect(eventBoxValue("2026-11-08T06:30")).toBe("2026-11-08T06:30");
    expect(eventBoxValue("")).toBe("");
    expect(eventBoxValue("soon")).toBe("soon");
  });
});

describe("eventTimeOf", () => {
  it("sends a typed time with India's offset", () => {
    expect(eventTimeOf("2026-11-08T06:30")).toBe("2026-11-08T06:30:00+05:30");
  });

  it("keeps the API's own instant while the box still shows it", () => {
    const kept = "2026-11-08T01:00:00Z";
    expect(eventTimeOf("2026-11-08T06:30", kept)).toBe(kept);
    expect(eventTimeOf("2026-11-08T07:00", kept)).toBe(
      "2026-11-08T07:00:00+05:30",
    );
  });

  it("is empty for an empty box and null for one that is not a time", () => {
    expect(eventTimeOf("  ")).toBe("");
    expect(eventTimeOf("tomorrow")).toBeNull();
    expect(eventTimeOf("2026-13-08T06:30")).toBeNull();
    expect(eventTimeOf("2026-11-08T25:00")).toBeNull();
  });
});

describe("typedDay", () => {
  it("takes a real date only", () => {
    expect(typedDay("2026-11-08")).toBe("2026-11-08");
    expect(typedDay(" 2026-11-08 ")).toBe("2026-11-08");
    expect(typedDay("2026-02-30")).toBeNull();
    expect(typedDay("8 Nov")).toBeNull();
  });
});

describe("repeatBounds", () => {
  it("runs from the start's date to 26 weeks from today in India", () => {
    expect(repeatBounds("2026-11-08T06:30", NOW)).toEqual({
      min: "2026-11-08",
      max: "2027-05-02",
    });
  });

  it("starts today while no start is picked", () => {
    expect(repeatBounds("", NOW).min).toBe("2026-11-01");
  });
});

describe("checkEventForm", () => {
  it("passes a whole form with its times written in India", () => {
    expect(
      checkEventForm(form({ end: "2026-11-08T08:00" }), NONE, NOW),
    ).toEqual({
      ok: true,
      times: {
        startsAt: "2026-11-08T06:30:00+05:30",
        endsAt: "2026-11-08T08:00:00+05:30",
      },
    });
  });

  it("leaves the end out when it is empty", () => {
    expect(checkEventForm(form(), NONE, NOW)).toEqual({
      ok: true,
      times: { startsAt: "2026-11-08T06:30:00+05:30" },
    });
  });

  it("marks one field with its sentence and no line", () => {
    expect(checkEventForm(form({ start: "" }), NONE, NOW)).toEqual({
      ok: false,
      fields: { startsAt: W.needStart },
      line: null,
    });
  });

  it("says check the fields when more than one is marked", () => {
    const check = checkEventForm(
      form({ end: "later", until: "2028-01-01", free: false, price: "abc" }),
      NONE,
      NOW,
    );
    expect(check).toEqual({
      ok: false,
      fields: {
        endsAt: W.needEnd,
        repeatsWeeklyUntil: W.repeatRange,
        priceFromRupees: W.needPrice,
      },
      line: W.checkFields,
    });
  });

  it("refuses a repeat before the start", () => {
    const check = checkEventForm(form({ until: "2026-11-07" }), NONE, NOW);
    expect(check.ok).toBe(false);
  });

  it("does not judge an unchanged repeat on a change", () => {
    const kept = { start: "", end: "", until: "2026-10-01" };
    expect(checkEventForm(form({ until: "2026-10-01" }), kept, NOW).ok).toBe(
      true,
    );
  });

  it("leaves an empty price on a paid event to the server", () => {
    expect(checkEventForm(form({ free: false, price: "" }), NONE, NOW).ok).toBe(
      true,
    );
  });
});

describe("sentState", () => {
  it("takes one of the six states only", () => {
    expect(sentState("live")).toBe("live");
    expect(sentState(["in_checking"])).toBe("in_checking");
    expect(sentState("deleted")).toBeNull();
    expect(sentState(undefined)).toBeNull();
  });
});
