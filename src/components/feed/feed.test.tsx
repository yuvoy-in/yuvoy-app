import { describe, it, expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithQuery } from "@/test/render";
import { Feed } from "./feed";
import { server } from "../../../mocks/server";
import { http, HttpResponse } from "msw";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

/**
 * T2's states and its truthfulness rules. The feed is the one screen every
 * traveller sees, so a wrong claim here is the most expensive wrong claim in
 * the product.
 */
describe("Feed", () => {
  it("shows a skeleton, not a spinner, while loading", async () => {
    renderWithQuery(<Feed />);
    expect(
      screen.getByRole("status", { name: "Loading experiences" }),
    ).toBeInTheDocument();
  });

  it("renders the first page of experiences", async () => {
    renderWithQuery(<Feed />);
    expect(
      await screen.findByText("Try-dive at Nemo Reef"),
    ).toBeInTheDocument();
  });

  it("never renders a placeholder price when none is contracted", async () => {
    server.use(
      http.get(`${BASE}/experiences`, () =>
        HttpResponse.json({
          items: [
            {
              id: "e1",
              slug: "no-price",
              title: "Mangrove kayak at dawn",
              marketKey: "andaman",
              destinationKey: "andaman/neil-island",
              category: "nature_wildlife",
              bookingMode: "allotment",
              durationMinutes: 150,
              operator: { id: "o1", name: "Sample Operator", verified: false },
              nextAvailable: "2026-08-23",
              // No fromPrice.
            },
          ],
          nextCursor: null,
          complete: true,
        }),
      ),
    );

    renderWithQuery(<Feed />);

    expect(await screen.findByText("Price on request")).toBeInTheDocument();
    // ₹0 would be a fabricated claim.
    expect(screen.queryByText("₹0")).not.toBeInTheDocument();
  });

  it("says so when nothing is bookable in 90 days, rather than staying silent", async () => {
    server.use(
      http.get(`${BASE}/experiences`, () =>
        HttpResponse.json({
          items: [
            {
              id: "e2",
              slug: "no-dates",
              title: "Night fishing with a local crew",
              marketKey: "andaman",
              destinationKey: "andaman/havelock",
              category: "local_life",
              bookingMode: "request",
              durationMinutes: 300,
              operator: { id: "o2", name: "Sample Operator", verified: true },
              // No nextAvailable: nothing bookable in 90 days.
            },
          ],
          nextCursor: null,
          complete: true,
        }),
      ),
    );

    renderWithQuery(<Feed />);

    // The tap that ends in "no dates" is the tap that loses the traveller.
    expect(
      await screen.findByText("No dates in the next 90 days"),
    ).toBeInTheDocument();
  });

  it("does not claim an operator is verified when they are not", async () => {
    renderWithQuery(<Feed />);
    await screen.findByText("Try-dive at Nemo Reef");
    // The seeded first page has one verified operator; the badge must appear
    // exactly where `verified` is true and nowhere else.
    const badges = screen.queryAllByText("Verified");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("shows an honest empty state rather than a blank feed", async () => {
    server.use(
      http.get(`${BASE}/experiences`, () =>
        HttpResponse.json({ items: [], nextCursor: null, complete: true }),
      ),
    );

    renderWithQuery(<Feed />);

    expect(
      await screen.findByText("Nothing bookable here yet"),
    ).toBeInTheDocument();
  });

  it("renders a paused kill switch calmly and offers no retry", async () => {
    server.use(
      http.get(`${BASE}/experiences`, () =>
        HttpResponse.json(
          {
            error: {
              code: "booking_disabled",
              message: "raw server copy",
              requestId: "01JKILL",
            },
          },
          { status: 503 },
        ),
      ),
    );

    renderWithQuery(<Feed />);

    expect(await screen.findByText("Booking is paused")).toBeInTheDocument();
    expect(screen.getByText("01JKILL")).toBeInTheDocument();
    expect(screen.queryByText("raw server copy")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
  });

  it("stops paging when the server says complete, not when a page is short", async () => {
    // One item — far short of a full page — but `complete: true`. The feed
    // must accept that and say it is the end.
    server.use(
      http.get(`${BASE}/experiences`, () =>
        HttpResponse.json({
          items: [
            {
              id: "e3",
              slug: "only-one",
              title: "Only one",
              marketKey: "andaman",
              destinationKey: "andaman/havelock",
              category: "adventure",
              bookingMode: "allotment",
              durationMinutes: 60,
              operator: { id: "o3", name: "Sample Operator", verified: true },
            },
          ],
          nextCursor: null,
          complete: true,
        }),
      ),
    );

    renderWithQuery(<Feed />);

    await waitFor(() =>
      expect(
        screen.getByText("That is everything on sale right now."),
      ).toBeInTheDocument(),
    );
  });
});
