import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithQuery } from "@/test/render";
import { ExperienceDetail } from "./experience-detail";
import { EXPERIENCE_DETAIL } from "../../../mocks/fixtures";
import type { components } from "@/lib/api/schema.gen";

type Experience = components["schemas"]["Experience"];

/**
 * Who runs the listing and the lines beside its price, moved out of
 * `experience-detail.test.tsx` word for word to keep both files under 500
 * lines. `withGallery` is the same listing that file builds.
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

  /*
    yuvoy-app#30 — reel → listing → operator. The operator's page existed, and
    nothing on the listing a traveller was reading led to it.
  */
  describe("who runs it", () => {
    const operator = withGallery.operator;

    it("leads to the business's own page, by slug and never by id", () => {
      renderWithQuery(<ExperienceDetail experience={withGallery} />);
      const link = screen.getByRole("link", { name: operator.name });
      expect(link).toHaveAttribute("href", `/o/${operator.slug}`);
      expect(link.getAttribute("href")).not.toContain(operator.id);
    });

    it("still names the business when the API sends no slug", () => {
      // Required in the contract — which is not yet a promise about the
      // deployed API.
      renderWithQuery(
        <ExperienceDetail
          experience={{
            ...withGallery,
            operator: {
              ...operator,
              slug: undefined,
            } as unknown as typeof operator,
          }}
        />,
      );
      expect(screen.getByText(operator.name)).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: operator.name })).toBeNull();
    });
  });

  /*
    The lines a traveller weighs with the price (yuvoy-app#110, #112). Both are
    the API's to word (yuvoy-api#248); see `listing-lines.ts`.
  */
  describe("beside the price", () => {
    it("says how it is paid for, before anybody reaches the pay step", () => {
      renderWithQuery(<ExperienceDetail experience={withGallery} />);
      expect(
        screen.getByText("Pay at the counter on the day"),
      ).toBeInTheDocument();
    });

    it("says it for a request listing too", () => {
      renderWithQuery(
        <ExperienceDetail
          experience={EXPERIENCE_DETAIL["night-fishing-with-a-local-crew"]}
        />,
      );
      expect(
        screen.getByText("Pay at the counter on the day"),
      ).toBeInTheDocument();
    });

    it("invents no cancellation line when the API sends no summary", () => {
      // The fixture has a policy paragraph and no summary: the paragraph stays
      // where it is and nothing is cut out of it for the price panel.
      renderWithQuery(<ExperienceDetail experience={withGallery} />);
      expect(screen.queryByRole("link", { name: "Full policy" })).toBeNull();
      expect(screen.getByText(withGallery.cancellationPolicy!)).toBeVisible();
    });

    it("prints the API's summary, and leads to the full policy", () => {
      renderWithQuery(
        <ExperienceDetail
          experience={
            {
              ...withGallery,
              cancellationSummary: "Full refund until 48 hours before",
            } as Experience
          }
        />,
      );
      expect(
        screen.getByText(/Full refund until 48 hours before/),
      ).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Full policy" })).toHaveAttribute(
        "href",
        "#cancellation",
      );
      expect(document.getElementById("cancellation")).toHaveTextContent(
        withGallery.cancellationPolicy!,
      );
    });
  });
});
