import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithQuery } from "@/test/render";
import { ExperienceDetail } from "./experience-detail";
import { EXPERIENCE_DETAIL } from "../../../mocks/fixtures";
import type { components } from "@/lib/api/schema.gen";

type Experience = components["schemas"]["Experience"];

/**
 * T3 — the three things the page carried in its response and never showed:
 * how long it takes (a required field), the rest of the gallery, and where the
 * meeting point actually is.
 */
describe("ExperienceDetail", () => {
  const base = EXPERIENCE_DETAIL["try-dive-nemo-reef"];
  const withGallery: Experience = {
    ...base,
    durationMinutes: 180,
    gallery: [
      ...base.gallery,
      {
        id: "m2",
        kind: "image",
        posterUrl: "https://videodelivery.net/x/thumb.jpg",
        alt: "Divers at the reef",
      },
      {
        id: "m3",
        kind: "video",
        posterUrl: "https://videodelivery.net/y/thumb.jpg",
      },
    ],
  };

  it("says how long it takes", () => {
    renderWithQuery(<ExperienceDetail experience={withGallery} />);
    expect(screen.getByText("About 3 hours")).toBeInTheDocument();
  });

  it("shows the rest of the gallery, marking clips", () => {
    renderWithQuery(<ExperienceDetail experience={withGallery} />);
    const strip = screen.getByRole("region", {
      name: "More from this experience",
    });
    expect(strip.querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByAltText("Divers at the reef")).toBeInTheDocument();
    expect(screen.getByText("Clip")).toBeInTheDocument();
  });

  it("links the meeting point to a map by its coordinates", () => {
    renderWithQuery(<ExperienceDetail experience={withGallery} />);
    expect(screen.getByRole("link", { name: "Open in maps" })).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=11.9756,92.9862",
    );
  });

  it("offers no map for a meeting point with no coordinates", () => {
    renderWithQuery(
      <ExperienceDetail
        experience={{ ...withGallery, meetingPoint: { text: "Jetty 2" } }}
      />,
    );
    expect(screen.queryByRole("link", { name: "Open in maps" })).toBeNull();
  });

  describe("a listing that cannot be sold right now", () => {
    /*
      yuvoy-app#19 §1. Still a 200 with the full listing, deliberately not a
      404: the card is already gone from every feed and from search, so the
      only way here is a link, a bookmark or a search result — and telling that
      person the business does not exist is worse than telling them it is not
      selling.
    */
    const notBookable: Experience = { ...withGallery, bookable: false };

    it("offers no way to pick a date", () => {
      renderWithQuery(<ExperienceDetail experience={notBookable} />);
      expect(
        screen.getByText(/not available to book right now/i),
      ).toBeInTheDocument();
      // No picker at all — one that will always be empty would render the
      // ordinary "no dates in this window" state, which is a different claim.
      expect(screen.queryByText("Checking seats…")).not.toBeInTheDocument();
    });

    it("does not imply the operator is gone", () => {
      renderWithQuery(<ExperienceDetail experience={notBookable} />);
      const text = document.body.textContent?.toLowerCase() ?? "";
      for (const guess of ["closed", "no longer", "suspend", "removed"]) {
        expect(text, guess).not.toContain(guess);
      }
      // The listing itself is still fully rendered — that is the point of the
      // 200.
      expect(screen.getByText(base.title)).toBeInTheDocument();
    });

    it("treats an ABSENT bookable as bookable", () => {
      /*
        The production regression this line caused, pinned so it cannot come
        back.

        The pinned contract marks `bookable` required, so reading
        `experience.bookable` and trusting falsiness looked correct — and on
        8 Sep 2026 it made every listing on `app.yuvoy.in` say "not available
        to book", because migration 0053 was merged but not yet DEPLOYED and
        the live API sent no such field.

        A pinned contract says what the API will send, never what it is
        sending today. Absent therefore falls back to the behaviour that was
        correct before the field existed.
      */
      const older: Experience = { ...withGallery };
      delete (older as { bookable?: boolean }).bookable;

      renderWithQuery(<ExperienceDetail experience={older} />);
      expect(
        screen.queryByText(/not available to book right now/i),
      ).not.toBeInTheDocument();
    });

    it("still shows the dates when it IS bookable", () => {
      renderWithQuery(<ExperienceDetail experience={withGallery} />);
      expect(
        screen.queryByText(/not available to book right now/i),
      ).not.toBeInTheDocument();
    });
  });

  describe("the price says what it means", () => {
    /*
      yuvoy-app#20 §1. This screen hard-coded "per person" on its own
      authority while the platform has always supported group pricing, so a
      ₹18,000 whole-boat charter read as ₹18,000 each.
    */
    it("renders the server's phrase verbatim", () => {
      const group: Experience = {
        ...withGallery,
        pricingUnit: "per_group",
        pricingUnitLabel: "for the group",
      };
      renderWithQuery(<ExperienceDetail experience={group} />);
      expect(screen.getByText(/for the group/)).toBeInTheDocument();
      expect(screen.queryByText(/per person/)).not.toBeInTheDocument();
    });

    it("never derives the phrase from the key", () => {
      /*
        The contract is explicit: "Render it verbatim; do not build one from
        `pricingUnit`." A client deriving its own is a second copy of a rule
        the API owns, and the copy that drifts is the one that misstates a
        price. A label that disagrees with its key must follow the LABEL.
      */
      const odd: Experience = {
        ...withGallery,
        pricingUnit: "per_group",
        pricingUnitLabel: "per boat",
      };
      renderWithQuery(<ExperienceDetail experience={odd} />);
      expect(screen.getByText(/per boat/)).toBeInTheDocument();
      expect(screen.queryByText(/for the group/)).not.toBeInTheDocument();
    });

    it("says nothing about the basis rather than guessing one", () => {
      const unlabelled: Experience = {
        ...withGallery,
        pricingUnitLabel: undefined,
      };
      renderWithQuery(<ExperienceDetail experience={unlabelled} />);
      expect(screen.queryByText(/per person/)).not.toBeInTheDocument();
      expect(screen.queryByText(/for the group/)).not.toBeInTheDocument();
    });
  });

  /*
    yuvoy-app#25. The section rendered unconditionally while everything inside
    it was guarded, so an empty meeting point produced a heading over an empty
    outlined box — live on two production listings when it was found.

    The data is not being fixed underneath us: migration 0055 gates the
    TRANSITION into published and deliberately unpublishes nothing, so the two
    listings already in that state stay live, stay in the feed and stay
    sellable. The guard is the fix.
  */
  describe("a meeting point with nothing in it", () => {
    const nothing: Experience = {
      ...withGallery,
      meetingPoint: { text: "" },
    };

    it("renders no section at all rather than an empty box", () => {
      renderWithQuery(<ExperienceDetail experience={nothing} />);
      expect(screen.queryByText("Where you meet")).toBeNull();
    });

    it("treats whitespace as empty, the way the publish gate does", () => {
      // The gate is `btrim(coalesce(meeting_point_text,'')) = ''`, so a screen
      // that tested truthiness alone would disagree with the database.
      renderWithQuery(
        <ExperienceDetail
          experience={{ ...withGallery, meetingPoint: { text: "   " } }}
        />,
      );
      expect(screen.queryByText("Where you meet")).toBeNull();
    });

    it("still shows the section when only a landmark is set", () => {
      renderWithQuery(
        <ExperienceDetail
          experience={{
            ...withGallery,
            meetingPoint: { text: "", landmark: "Beside the dive shop" },
          }}
        />,
      );
      expect(screen.getByText("Where you meet")).toBeInTheDocument();
      expect(screen.getByText("Beside the dive shop")).toBeInTheDocument();
    });

    it("still shows the section when only coordinates are set", () => {
      renderWithQuery(
        <ExperienceDetail
          experience={{
            ...withGallery,
            meetingPoint: { text: " ", lat: 11.9756, lng: 92.9862 },
          }}
        />,
      );
      expect(
        screen.getByRole("link", { name: "Open in maps" }),
      ).toBeInTheDocument();
    });

    it("promises nothing it cannot keep", () => {
      renderWithQuery(<ExperienceDetail experience={nothing} />);
      const text = document.body.textContent ?? "";
      expect(text).not.toMatch(/to be confirmed/i);
      expect(text).not.toMatch(/will confirm/i);
    });
  });

  /*
    yuvoy-app#21 — four fields the API sends that this page never read. Two of
    them are what the operator sat down and typed; the other two the feed card
    already renders, so the second screen was dropping what the first one used
    to earn the tap.
  */
  describe("what the operator wrote", () => {
    const written: Experience = {
      ...withGallery,
      description: "Two dives on the house reef.\n\nBoat leaves at seven.",
      safetyNotes: "There is current here. You must swim 200m unaided.",
      activityTypeLabel: "Scuba diving",
      operator: {
        ...withGallery.operator,
        logoUrl: "https://cdn.example.com/logo.png",
      },
    };

    it("renders the description as the paragraphs they typed", () => {
      renderWithQuery(<ExperienceDetail experience={written} />);
      expect(
        screen.getByText("Two dives on the house reef."),
      ).toBeInTheDocument();
      expect(screen.getByText("Boat leaves at seven.")).toBeInTheDocument();
    });

    it("gives the safety notes their own section, apart from You need", () => {
      renderWithQuery(<ExperienceDetail experience={written} />);
      expect(screen.getByText("Before you book")).toBeInTheDocument();
      expect(
        screen.getByText(/You must swim 200m unaided/),
      ).toBeInTheDocument();
    });

    it("shows the operator's mark beside their name", () => {
      renderWithQuery(<ExperienceDetail experience={written} />);
      const logo = document.querySelector(
        'img[src="https://cdn.example.com/logo.png"]',
      );
      expect(logo).not.toBeNull();
      // Decorative: the business name is right beside it and is the label.
      expect(logo?.getAttribute("alt")).toBe("");
    });

    it("prints the activity label, never the key", () => {
      renderWithQuery(
        <ExperienceDetail experience={{ ...written, activityType: "scuba" }} />,
      );
      expect(screen.getByText("Scuba diving")).toBeInTheDocument();
      expect(screen.queryByText("scuba")).toBeNull();
    });

    it("renders nothing for the fields a listing has not filled in", () => {
      // All four are `omitempty` on the wire, so an unfilled one arrives as an
      // ABSENT key rather than "". Nothing is rendered rather than a heading
      // over an empty box, or a placeholder noun where the label should be.
      renderWithQuery(
        <ExperienceDetail
          experience={{
            ...withGallery,
            description: undefined,
            safetyNotes: undefined,
            activityTypeLabel: undefined,
            operator: { ...withGallery.operator, logoUrl: undefined },
          }}
        />,
      );
      expect(screen.queryByText("About this experience")).toBeNull();
      expect(screen.queryByText("Before you book")).toBeNull();
      expect(
        document.querySelector('img[src="https://cdn.example.com/logo.png"]'),
      ).toBeNull();
    });

    it("renders no section for prose that is only whitespace", () => {
      renderWithQuery(
        <ExperienceDetail
          experience={{ ...withGallery, description: "  \n  \n " }}
        />,
      );
      expect(screen.queryByText("About this experience")).toBeNull();
    });
  });
});
