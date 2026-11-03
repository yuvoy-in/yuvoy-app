import { describe, expect, it } from "vitest";
import {
  emptyOrganiserForm,
  organiserForm,
  organiserInput,
} from "./organisers";
import { clubOrganiserInput, clubPageForm } from "./organisers-club";
import { sentLinkRows } from "./organisers-links";
import type { ClubToLink, Organiser } from "./types";

function organiser(over: Partial<Organiser> = {}): Organiser {
  return {
    id: "org_test",
    slug: "sunrise-walkers",
    name: "Sunrise Walkers",
    destinationKey: "goa",
    placeName: "Goa",
    departments: ["outdoors"],
    links: [],
    state: "verified",
    selfPublish: false,
    role: "owner",
    clubId: null,
    ...over,
  };
}

describe("a group's page", () => {
  const club = (over: Partial<ClubToLink> = {}): ClubToLink => ({
    clubId: "5a0c1e2f-0000-4000-8000-000000000000",
    name: "Sample Lagoon Runners",
    destinationKey: "andaman/havelock",
    placeName: "Havelock (Swaraj Dweep)",
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

  it("sends the links in the rows `sentLinkRows` names, so a links.N lands on its row", () => {
    const form = {
      ...clubPageForm(club()),
      links: [
        { kind: "website" as const, url: " " },
        { kind: "other" as const, url: "https://blocked.example" },
      ],
    };
    expect(sentLinkRows(form)).toEqual([1]);
    expect(clubOrganiserInput(form, "c1").links).toEqual([
      { kind: "other", url: "https://blocked.example" },
    ]);
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
