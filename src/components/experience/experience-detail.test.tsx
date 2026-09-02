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
});
