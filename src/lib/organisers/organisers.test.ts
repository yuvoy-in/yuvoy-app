import { describe, expect, it } from "vitest";
import {
  addHelpersOffLine,
  canAddHelpers,
  canCancelEvent,
  canChangeEvent,
  canEditPage,
  canPost,
  civilAsWritten,
  clubOrganiserInput,
  clubPageForm,
  eventChangeRefusal,
  eventDayLabel,
  eventForm,
  eventInput,
  eventPriceLine,
  eventStartLabel,
  eventStateLine,
  eventTimeLabel,
  emptyEventForm,
  emptyOrganiserForm,
  lastWeekOn,
  numbersLine,
  organiserActions,
  organiserForm,
  organiserInput,
  organiserStateLine,
  seesHelpers,
  showsCode,
  typedRupees,
  weekBefore,
  writtenInIndia,
} from "./organisers";
import type { ClubToLink, Organiser, OrganiserEvent } from "./types";
import { ORGANISER_WORDS as W } from "./words";

function organiser(over: Partial<Organiser> = {}): Organiser {
  return {
    id: "org_test",
    slug: "sunrise-walkers",
    name: "Sunrise Walkers",
    destinationKey: "goa",
    departments: ["outdoors"],
    links: [],
    state: "verified",
    selfPublish: false,
    role: "owner",
    clubId: null,
    ...over,
  };
}

function event(over: Partial<OrganiserEvent> = {}): OrganiserEvent {
  return {
    id: "post_test",
    state: "live",
    title: "Beach walk",
    department: "outdoors",
    startsAt: "2026-11-01T06:30:00+05:30",
    destinationKey: "goa",
    venueName: "Miramar steps",
    free: true,
    link: "https://example.com/walk",
    ...over,
  };
}

describe("the state card", () => {
  it("says each state's line, the code inside the waiting ones", () => {
    const code = "YV-4821";
    expect(
      organiserStateLine(
        organiser({ state: "pending", verificationCode: code }),
      ),
    ).toBe(W.pendingLine(code));
    expect(
      organiserStateLine(
        organiser({ state: "not_verified", verificationCode: code }),
      ),
    ).toContain(code);
    expect(organiserStateLine(organiser())).toBe(
      "Checked by Yuvoy. Your events show as posted by Sunrise Walkers.",
    );
    expect(organiserStateLine(organiser({ state: "suspended" }))).toBe(
      "This organiser is suspended.",
    );
    expect(organiserStateLine(organiser({ state: "closed" }))).toBe(
      "This organiser is closed.",
    );
  });

  it("shows the code only while it waits, and only when one came", () => {
    expect(
      showsCode(organiser({ state: "pending", verificationCode: "A1" })),
    ).toBe(true);
    expect(
      showsCode(organiser({ state: "pending", verificationCode: " " })),
    ).toBe(false);
    expect(showsCode(organiser({ state: "pending" }))).toBe(false);
    expect(
      showsCode(organiser({ state: "verified", verificationCode: "A1" })),
    ).toBe(false);
  });
});

describe("what the role and state allow", () => {
  it("posts in every state but suspended and closed", () => {
    expect(canPost(organiser({ state: "pending" }))).toBe(true);
    expect(canPost(organiser({ state: "not_verified" }))).toBe(true);
    expect(canPost(organiser({ state: "suspended" }))).toBe(false);
    expect(canPost(organiser({ state: "closed" }))).toBe(false);
  });

  it("lets an owner edit the page until it is closed, never a helper", () => {
    expect(canEditPage(organiser({ state: "suspended" }))).toBe(true);
    expect(canEditPage(organiser({ state: "closed" }))).toBe(false);
    expect(canEditPage(organiser({ role: "helper" }))).toBe(false);
  });

  it("shows helpers to an owner, and adding them only once verified", () => {
    expect(seesHelpers(organiser({ role: "helper" }))).toBe(false);
    expect(canAddHelpers(organiser())).toBe(true);
    expect(canAddHelpers(organiser({ state: "pending" }))).toBe(false);
    expect(addHelpersOffLine("verified")).toBeNull();
    expect(addHelpersOffLine("pending")).toBe(W.helpersAfterCheck);
    expect(addHelpersOffLine("not_verified")).toBe(W.helpersAfterCheck);
    expect(addHelpersOffLine("closed")).toBe(W.closed);
  });

  it("gathers every button at once", () => {
    expect(
      organiserActions(organiser({ state: "pending", verificationCode: "A1" })),
    ).toEqual({
      post: true,
      editPage: true,
      helpers: true,
      addHelpers: false,
      addHelpersOff: W.helpersAfterCheck,
      copyCode: true,
    });
    expect(organiserActions(organiser({ role: "helper" }))).toEqual({
      post: true,
      editPage: false,
      helpers: false,
      addHelpers: false,
      addHelpersOff: null,
      copyCode: false,
    });
  });
});

describe("the page body", () => {
  it("sends the whole page, blank optional fields left out", () => {
    expect(
      organiserInput({
        name: "  Sunrise Walkers ",
        destinationKey: "goa",
        departments: ["outdoors"],
        about: "  ",
        links: [
          { kind: "website", url: " https://example.com " },
          { kind: "other", url: "" },
        ],
        contactEmail: "",
      }),
    ).toEqual({
      name: "Sunrise Walkers",
      destinationKey: "goa",
      departments: ["outdoors"],
      links: [{ kind: "website", url: "https://example.com" }],
      runsIt: true,
    });
  });

  it("round-trips a page through its edit form", () => {
    const page = organiser({
      about: "Walks at dawn.",
      contactEmail: "walks@example.com",
      links: [{ kind: "meetup", url: "https://example.com/m" }],
    });
    expect(organiserInput(organiserForm(page))).toEqual({
      name: page.name,
      destinationKey: page.destinationKey,
      departments: page.departments,
      about: "Walks at dawn.",
      links: page.links,
      contactEmail: "walks@example.com",
      runsIt: true,
    });
  });
});

describe("a group's page", () => {
  const club = (over: Partial<ClubToLink> = {}): ClubToLink => ({
    clubId: "5a0c1e2f-0000-4000-8000-000000000000",
    name: "Sample Lagoon Runners",
    destinationKey: "andaman/havelock",
    category: "sports",
    ...over,
  });

  it("starts from the empty form with the group's name and place, its category ticked", () => {
    expect(clubPageForm(club())).toEqual({
      ...emptyOrganiserForm("andaman/havelock"),
      name: "Sample Lagoon Runners",
      departments: ["sports"],
    });
  });

  it("ticks nothing for a group with no category, or one the form cannot draw", () => {
    expect(clubPageForm(club({ category: null })).departments).toEqual([]);
    expect(clubPageForm(club({ category: "stargazing" })).departments).toEqual(
      [],
    );
    expect(clubPageForm(club({ category: "toString" })).departments).toEqual(
      [],
    );
  });

  it("sends the group's id and the form's fields, never its name or place", () => {
    const body = clubOrganiserInput(
      {
        ...clubPageForm(club()),
        departments: ["sports", "community"],
        about: "  We run 5 km every Sunday. ",
        links: [
          { kind: "website", url: " https://runners.example.com " },
          { kind: "other", url: " " },
        ],
        contactEmail: " runners@example.com ",
      },
      "5a0c1e2f-0000-4000-8000-000000000000",
    );
    expect(body).toEqual({
      clubId: "5a0c1e2f-0000-4000-8000-000000000000",
      departments: ["sports", "community"],
      about: "We run 5 km every Sunday.",
      links: [{ kind: "website", url: "https://runners.example.com" }],
      contactEmail: "runners@example.com",
      runsIt: true,
    });
    expect("name" in body).toBe(false);
    expect("destinationKey" in body).toBe(false);
  });

  it("leaves out the blank optional fields, as the plain page does", () => {
    expect(clubOrganiserInput(clubPageForm(club()), "c1")).toEqual({
      clubId: "c1",
      departments: ["sports"],
      runsIt: true,
    });
  });

  it("sends a group's page back on an edit with its name and place as read", () => {
    const page = organiser({
      clubId: "5a0c1e2f-0000-4000-8000-000000000000",
      name: "Sample Lagoon Runners",
      destinationKey: "andaman/havelock",
    });
    expect(organiserInput(organiserForm(page))).toMatchObject({
      name: "Sample Lagoon Runners",
      destinationKey: "andaman/havelock",
    });
  });
});

describe("times, dates and prices", () => {
  it("reads an instant as written, never in the browser's zone", () => {
    expect(civilAsWritten("2026-11-01T06:30:00+05:30")).toMatchObject({
      year: 2026,
      month: 11,
      day: 1,
      hour: 6,
      minute: 30,
      weekday: 0,
    });
    expect(civilAsWritten("1 Nov")).toBeNull();
    expect(civilAsWritten("2026-13-01T06:30")).toBeNull();
  });

  it("says a start, a span and a date", () => {
    expect(eventStartLabel(event())).toBe("Sun, 1 Nov, 06:30");
    expect(eventStartLabel(event({ startsAt: "soon" }))).toBe("");
    expect(eventTimeLabel(event({ endsAt: "2026-11-01T08:00:00+05:30" }))).toBe(
      "Sun, 1 Nov, 06:30 to 08:00",
    );
    expect(eventTimeLabel(event({ endsAt: "2026-11-02T08:00:00+05:30" }))).toBe(
      "Sun, 1 Nov, 06:30 to Mon, 2 Nov, 08:00",
    );
    expect(eventDayLabel("2026-10-31")).toBe("Sat, 31 Oct");
    expect(eventDayLabel(null)).toBe("");
  });

  it("writes an instant in India's offset", () => {
    expect(writtenInIndia("2026-11-01T01:00:00Z")).toBe(
      "2026-11-01T06:30:00+05:30",
    );
    expect(writtenInIndia("tomorrow")).toBeNull();
  });

  it("says free, a price, or nothing", () => {
    expect(eventPriceLine(event())).toBe("Free");
    expect(eventPriceLine(event({ free: false, priceFromRupees: 499 }))).toBe(
      "From ₹499",
    );
    expect(eventPriceLine(event({ free: false }))).toBe("");
  });

  it("reads typed rupees", () => {
    expect(typedRupees("1,000")).toBe(1000);
    expect(typedRupees(" 499 ")).toBe(499);
    expect(typedRupees("4.5")).toBeUndefined();
    expect(typedRupees("")).toBeUndefined();
  });
});

describe("event states and changes", () => {
  it("labels each state, with the desk's reason on a not accepted one", () => {
    expect(eventStateLine(event({ state: "in_checking" }))).toBe("In checking");
    expect(eventStateLine(event())).toBe("Live");
    expect(eventStateLine(event({ state: "changes_in_checking" }))).toBe(
      "Changes in checking",
    );
    expect(eventStateLine(event({ state: "cancelled" }))).toBe("Cancelled");
    expect(eventStateLine(event({ state: "ended" }))).toBe("Ended");
    expect(
      eventStateLine(
        event({
          state: "not_accepted",
          notAcceptedReason: " It does not look like a real event ",
        }),
      ),
    ).toBe("Not accepted: It does not look like a real event");
    expect(eventStateLine(event({ state: "not_accepted" }))).toBe(
      "Not accepted",
    );
  });

  it("changes and cancels only an open event", () => {
    expect(canChangeEvent(organiser(), event())).toBe(true);
    expect(canChangeEvent(organiser({ state: "suspended" }), event())).toBe(
      false,
    );
    expect(canChangeEvent(organiser(), event({ state: "ended" }))).toBe(false);
    expect(canCancelEvent(event({ state: "changes_in_checking" }))).toBe(true);
    expect(canCancelEvent(event({ state: "cancelled" }))).toBe(false);
    expect(eventChangeRefusal("live")).toBeNull();
    expect(eventChangeRefusal("ended")).toBe(W.endedNoChange);
    expect(eventChangeRefusal("cancelled")).toBe(W.cancelledNoChange);
    expect(eventChangeRefusal("not_accepted")).toBe(W.notAcceptedNoChange);
  });

  it("sends the whole event, a price only with a paid one", () => {
    const form = {
      ...emptyEventForm("goa"),
      title: " Beach walk ",
      department: "outdoors",
      venueName: "Miramar steps",
      link: "https://example.com/walk",
      free: false,
      price: "1,000",
      priceNote: "Students pay half",
      until: "2026-12-27",
    };
    expect(eventInput(form, { startsAt: "2026-11-01T06:30:00+05:30" })).toEqual(
      {
        title: "Beach walk",
        department: "outdoors",
        startsAt: "2026-11-01T06:30:00+05:30",
        repeatsWeeklyUntil: "2026-12-27",
        destinationKey: "goa",
        venueName: "Miramar steps",
        free: false,
        priceFromRupees: 1000,
        priceNote: "Students pay half",
        link: "https://example.com/walk",
      },
    );
    const free = eventInput(
      { ...form, free: true },
      { startsAt: "2026-11-01T06:30:00+05:30" },
    );
    expect(free.priceFromRupees).toBeUndefined();
  });

  it("round-trips an event through its change form", () => {
    const posted = event({
      endsAt: "2026-11-01T08:00:00+05:30",
      address: "Miramar, Panaji",
      about: "Bring water.",
    });
    expect(
      eventInput(eventForm(posted), {
        startsAt: posted.startsAt,
        endsAt: posted.endsAt,
      }),
    ).toEqual({
      title: posted.title,
      department: posted.department,
      startsAt: posted.startsAt,
      endsAt: posted.endsAt,
      destinationKey: posted.destinationKey,
      venueName: posted.venueName,
      address: "Miramar, Panaji",
      free: true,
      link: posted.link,
      about: "Bring water.",
    });
  });
});

describe("numbers", () => {
  it("says the counts in the spec's line", () => {
    expect(
      numbersLine({ going: 12, ticketTapsAtLeast: 30, checkedIn: 8, went: 9 }),
    ).toBe("12 going · at least 30 ticket taps · 8 checked in · 9 went");
  });

  it("finds last week's date for a weekly event past its first week", () => {
    expect(weekBefore("2026-11-15")).toBe("2026-11-08");
    expect(weekBefore(null)).toBeNull();
    expect(weekBefore("15 Nov")).toBeNull();
    const weekly = event({
      eventId: "evt_test",
      repeatsWeeklyUntil: "2026-12-27",
    });
    expect(lastWeekOn(weekly, "2026-11-15")).toBe("2026-11-08");
    expect(lastWeekOn(weekly, "2026-11-01")).toBeNull();
    expect(lastWeekOn(event({ eventId: "evt_test" }), "2026-11-15")).toBeNull();
    expect(
      lastWeekOn({ ...weekly, eventId: undefined }, "2026-11-15"),
    ).toBeNull();
  });
});
