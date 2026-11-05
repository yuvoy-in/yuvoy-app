import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { CheckoutForm } from "./checkout-form";
import { EXPERIENCE_DETAIL, availabilityFor } from "../../../mocks/fixtures";
import { server } from "../../../mocks/server";
import { http, HttpResponse, delay } from "msw";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8099/v1";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  /*
    `LoginButton` sits in every logo header and in the feed masthead
    (yuvoy-app#56), and it reads both of these. A mock missing either
    fails the whole file with "No export is defined", which reads as a
    broken screen rather than an incomplete mock.
  */
  usePathname: () => "/e/try-dive-nemo-reef/book",
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const kayak = EXPERIENCE_DETAIL["mangrove-kayak-at-dawn"];
const kayakSlot = availabilityFor("mangrove-kayak-at-dawn")[0];

// vi.fn() persists across cases; without this, "was never called" assertions
// pass or fail depending on what ran before them.
beforeEach(() => replace.mockClear());

async function fillContact(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("Your name"), "Asha Menon");
  await user.type(screen.getByLabelText("WhatsApp number"), "+919000000000");
  await user.click(screen.getByRole("checkbox", { name: /called off/i }));
}

/**
 * One tap (owner ruling, 3 Oct 2026): "Book now, pay ₹X cash on the day"
 * takes the hold and finishes it in cash before the booking page opens.
 */
describe("CheckoutForm — one tap", () => {
  const active = {
    reservationId: "res_tap",
    state: "active",
    guests: 1,
    holdExpiresAt: new Date(Date.now() + 600_000).toISOString(),
    requestExpiresAt: null,
    statusToken: "tok_tap",
  };

  it("says it books, with the amount and how it is paid", async () => {
    renderWithQuery(<CheckoutForm experience={kayak} slot={kayakSlot} />);
    expect(
      await screen.findByRole("button", {
        name: /^Book now, pay ₹[\d,]+ cash on the day$/,
      }),
    ).toBeInTheDocument();
  });

  it("holds, asks how it can be paid, books in cash, then opens the booking", async () => {
    const calls: string[] = [];
    server.use(
      http.post(`${BASE}/reservations`, () => {
        calls.push("reserve");
        return HttpResponse.json(active, { status: 201 });
      }),
      http.post(`${BASE}/reservations/:id/payment-order`, ({ request }) => {
        calls.push(`order ${request.headers.get("authorization")}`);
        return HttpResponse.json({
          state: "coming_soon",
          message: "Card and UPI are opening shortly.",
          payAtCounter: {
            available: true,
            confirmAt: "/reservations/res_tap/cash-booking",
          },
        });
      }),
      http.post(`${BASE}/reservations/:id/cash-booking`, ({ request }) => {
        calls.push(`cash ${request.headers.get("authorization")}`);
        return HttpResponse.json(
          { bookingReference: "YV-TAP" },
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={kayak} slot={kayakSlot} />);
    await fillContact(user);
    await user.click(screen.getByRole("button", { name: /^book now/i }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/booking#t=tok_tap"),
    );
    // Both hold writes with the link the reservation answered with (yuvoy-api#369).
    expect(calls).toEqual([
      "reserve",
      "order Bearer tok_tap",
      "cash Bearer tok_tap",
    ]);
  });

  it("sends a request as a request, and asks nothing about paying", async () => {
    const calls: string[] = [];
    server.use(
      http.post(`${BASE}/reservations`, () => {
        calls.push("reserve");
        return HttpResponse.json(
          { ...active, state: "pending_request", holdExpiresAt: null },
          { status: 201 },
        );
      }),
      http.post(`${BASE}/reservations/:id/payment-order`, () => {
        calls.push("order");
        return HttpResponse.json({});
      }),
    );
    const snorkel = EXPERIENCE_DETAIL["snorkel-elephant-beach"];
    const snorkelSlot = availabilityFor("snorkel-elephant-beach")[0];
    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={snorkel} slot={snorkelSlot} />);
    await fillContact(user);
    await user.click(screen.getByRole("button", { name: "Send request" }));
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/booking#t=tok_tap"),
    );
    expect(calls).toEqual(["reserve"]);
  });

  it("still opens the booking, with the hold alive, when cash cannot finish it", async () => {
    server.use(
      http.post(`${BASE}/reservations`, () =>
        HttpResponse.json(active, { status: 201 }),
      ),
      http.post(`${BASE}/reservations/:id/payment-order`, () =>
        HttpResponse.json(
          { error: { code: "payments_unavailable", message: "x" } },
          { status: 503 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={kayak} slot={kayakSlot} />);
    await fillContact(user);
    await user.click(screen.getByRole("button", { name: /^book now/i }));
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/booking#t=tok_tap"),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

/*
  T08 A (approved 4 Oct 2026): the tap that books is answered at once and the
  button keeps its colour while it works; a refusal is brought into view and
  takes focus, rather than being announced under the sticky bar.
*/
describe("CheckoutForm — working, and a refusal that is seen (T08 A)", () => {
  const held = {
    reservationId: "res_work",
    state: "active",
    guests: 1,
    holdExpiresAt: new Date(Date.now() + 600_000).toISOString(),
    requestExpiresAt: null,
    statusToken: "tok_work",
  };

  it("keeps its colour while it works: busy and saying so, never disabled", async () => {
    server.use(
      http.post(`${BASE}/reservations`, async () => {
        await delay(400);
        return HttpResponse.json(held, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={kayak} slot={kayakSlot} />);
    await fillContact(user);
    await user.click(screen.getByRole("button", { name: /^book now/i }));

    // One name at a time: the working verb, the old label hidden beside it.
    const button = await screen.findByRole("button", { name: "Booking" });
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button.querySelector('[data-shown="false"]')?.textContent).toMatch(
      /^Book now/,
    );
    expect(button.querySelector(".button-ring")).not.toBeNull();
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
  });

  it("brings a refusal into view, rising in, and gives it focus", async () => {
    server.use(
      http.post(`${BASE}/reservations`, () =>
        HttpResponse.json(
          {
            error: {
              code: "capacity_unavailable",
              message: "gone",
              details: { remaining: 2 },
              requestId: "01JSEEN",
            },
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={kayak} slot={kayakSlot} />);
    await fillContact(user);
    await user.click(screen.getByRole("button", { name: /^book now/i }));

    const alert = await screen.findByRole("alert");
    const landing = alert.closest<HTMLElement>('[tabindex="-1"]');
    expect(landing).not.toBeNull();
    expect(landing).toHaveClass("motion-rise-in");
    expect(landing).toHaveAttribute("data-motion");
    await waitFor(() => expect(document.activeElement).toBe(landing));
    // And the button is itself again, ready for another go.
    expect(
      screen.getByRole("button", { name: /^book now/i }),
    ).not.toHaveAttribute("aria-busy");
  });
});
