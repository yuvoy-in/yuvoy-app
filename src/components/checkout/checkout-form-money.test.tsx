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

const dive = EXPERIENCE_DETAIL["try-dive-nemo-reef"];
const diveSlot = availabilityFor("try-dive-nemo-reef")[0];
const kayak = EXPERIENCE_DETAIL["mangrove-kayak-at-dawn"];
const kayakSlot = availabilityFor("mangrove-kayak-at-dawn")[0];
const charter = EXPERIENCE_DETAIL["private-boat-charter"];
const charterSlot = availabilityFor("private-boat-charter")[0];

// vi.fn() persists across cases; without this, "was never called" assertions
// pass or fail depending on what ran before them.
beforeEach(() => replace.mockClear());

async function fillContact(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("Your name"), "Asha Menon");
  await user.type(screen.getByLabelText("WhatsApp number"), "+919000000000");
  await user.click(screen.getByRole("checkbox", { name: /called off/i }));
}

describe("CheckoutForm — the money rules", () => {
  it("asks for a name and a WhatsApp number, and nothing else required", async () => {
    renderWithQuery(<CheckoutForm experience={kayak} slot={kayakSlot} />);
    expect(await screen.findByLabelText("Your name")).toBeRequired();
    expect(screen.getByLabelText("WhatsApp number")).toBeRequired();
    // Every extra required field costs conversions on the one funnel there is.
    expect(screen.getByLabelText("Email (optional)")).not.toBeRequired();
  });

  it("sends ONE idempotency key when the traveller double-taps", async () => {
    // The real hazard: two taps ~40ms apart, both BEFORE the first request
    // resolves. `isPending` is React state and is still false on the second,
    // so only a synchronous guard closes this window.
    server.use(
      http.post(`${BASE}/reservations`, async () => {
        await delay(120);
        return HttpResponse.json(
          {
            reservationId: "res_1",
            state: "active",
            guests: 1,
            holdExpiresAt: new Date(Date.now() + 600_000).toISOString(),
            requestExpiresAt: null,
            statusToken: "tok_abc",
          },
          { status: 201 },
        );
      }),
    );

    const seen: string[] = [];
    server.events.on("request:start", ({ request }) => {
      const key = request.headers.get("idempotency-key");
      if (key) seen.push(key);
    });

    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={kayak} slot={kayakSlot} />);
    await fillContact(user);

    const button = screen.getByRole("button", { name: /^book now/i });
    // Fire both without awaiting the first — a real double-tap.
    await Promise.all([user.click(button), user.click(button)]);
    await waitFor(() => expect(replace).toHaveBeenCalled());

    expect(seen.length).toBeLessThanOrEqual(1);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("goes dead once it has succeeded, so a slow navigation cannot double-book", async () => {
    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={kayak} slot={kayakSlot} />);
    await fillContact(user);
    await user.click(screen.getByRole("button", { name: /^book now/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    /*
      Working until the page changes, and dead: busy, and a tap does nothing.
      It keeps its colour while it works (T08 A, approved 4 Oct 2026), so it
      is `aria-disabled` rather than `disabled`, which faded it to 40%.
    */
    const button = screen.getByRole("button", { name: "Booking" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    await user.click(button);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("puts the status token in the FRAGMENT, never a query", async () => {
    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={kayak} slot={kayakSlot} />);
    await fillContact(user);
    await user.click(screen.getByRole("button", { name: /^book now/i }));

    await waitFor(() => expect(replace).toHaveBeenCalled());
    const url = replace.mock.calls.at(-1)![0] as string;

    expect(url).toMatch(/^\/booking#t=/);
    // This API logs request URIs — a query string would be written to them.
    expect(url.split("#")[0]).not.toContain("t=");
  });

  it("will not submit until the health check is answered", async () => {
    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={dive} slot={diveSlot} />);
    await fillContact(user);
    // Age band still needed too, but the health check is the point here.
    expect(screen.getByRole("button", { name: /^book now/i })).toBeDisabled();
    expect(
      screen.getByText(/Still needed:.*health check/i),
    ).toBeInTheDocument();
  });

  it("treats a declared condition as a conversation, and books nothing", async () => {
    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={dive} slot={diveSlot} />);
    await fillContact(user);

    await user.click(
      screen.getByRole("radio", { name: /One or more of these applies/i }),
    );

    expect(await screen.findByText("Let us talk first")).toBeInTheDocument();
    // And a way to have that word (yuvoy-app#116 item 2), which needs no
    // WhatsApp and no session: this traveller may be a guest.
    expect(
      screen.getByRole("link", { name: "Call Yuvoy on +91 81216 57657" }),
    ).toHaveAttribute("href", "tel:+918121657657");
    // Nothing has been booked and nothing charged — and the button must not
    // let them proceed into a refusal.
    expect(screen.getByRole("button", { name: /^book now/i })).toBeDisabled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("refuses an age band whose FLOOR is below the minimum", async () => {
    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={dive} slot={diveSlot} />);

    // minAge is 12, so 10–11 must be refused. Comparing the TOP of the band
    // would admit exactly the person the rule exists to stop.
    const select = screen.getByLabelText("Your age range");
    const tooYoung = screen.getByRole("option", { name: /10-11/ });
    expect(tooYoung).toBeDisabled();

    await user.selectOptions(select, "18_plus");
    expect((select as HTMLSelectElement).value).toBe("18_plus");
  });

  it("offers what is left when the seats went while they were deciding", async () => {
    server.use(
      http.post(`${BASE}/reservations`, () =>
        HttpResponse.json(
          {
            error: {
              code: "capacity_unavailable",
              message: "gone",
              details: { remaining: 2 },
              requestId: "01JCAP",
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

    // details.remaining exists so the UI can offer the smaller party rather
    // than sending them back to start again.
    expect(
      await screen.findByRole("button", { name: "Book 2 instead" }),
    ).toBeInTheDocument();
    expect(screen.getByText("01JCAP")).toBeInTheDocument();
  });

  /*
    yuvoy-app#219, the web half of yuvoy-mobile#368. A price for the whole
    group also says what it comes to each, and the Total does not move.
  */
  it("says what a group price comes to each, under an unchanged Total", async () => {
    expect(charter.pricingUnit).toBe("per_group");
    renderWithQuery(
      <CheckoutForm
        experience={charter}
        slot={charterSlot}
        initialGuests={4}
      />,
    );
    expect(await screen.findByTestId("checkout-each")).toHaveTextContent(
      "₹4,500 each for 4 of you",
    );
    expect(screen.getByText("₹18,000")).toBeInTheDocument();
    expect(screen.queryByText("₹72,000")).not.toBeInTheDocument();
  });

  it("says nothing each for one guest on a group price", async () => {
    renderWithQuery(
      <CheckoutForm
        experience={charter}
        slot={charterSlot}
        initialGuests={1}
      />,
    );
    await screen.findByLabelText("Your name");
    expect(screen.queryByTestId("checkout-each")).not.toBeInTheDocument();
    expect(screen.queryByText(/ each for /)).not.toBeInTheDocument();
  });

  it("says nothing each on a per-person price", async () => {
    expect(dive.pricingUnit ?? "per_person").toBe("per_person");
    renderWithQuery(
      <CheckoutForm experience={dive} slot={diveSlot} initialGuests={3} />,
    );
    await screen.findByLabelText("Your name");
    expect(screen.queryByTestId("checkout-each")).not.toBeInTheDocument();
  });

  it("charges a price for the whole group once, and says so on the button", async () => {
    /*
      A ₹18,000 charter for three is ₹18,000. The form multiplied every price
      by the party, so it read ₹54,000 on the button, and the moment the agreed
      total reached the API under its real name, every such booking would have
      been refused `price_moved`: the API prices `per_group` whole.
    */
    expect(charter.pricingUnit).toBe("per_group");
    let sent: Record<string, unknown> | undefined;
    server.use(
      http.post(`${BASE}/reservations`, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            reservationId: "res_charter",
            state: "active",
            guests: 3,
            holdExpiresAt: "2026-09-14T04:10:00Z",
            requestExpiresAt: null,
            statusToken: "tok_charter",
          },
          { status: 201 },
        );
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(
      <CheckoutForm
        experience={charter}
        slot={charterSlot}
        initialGuests={3}
      />,
    );
    await fillContact(user);
    const unit = charterSlot.price!.amountMinor;
    const button = screen.getByRole("button", { name: /^book now/i });
    expect(button).toHaveAccessibleName(/₹18,000/);
    expect(button).not.toHaveAccessibleName(/₹54,000/);

    await user.click(button);

    await waitFor(() => expect(sent).toBeDefined());
    expect(sent!.guests).toBe(3);
    // The contract's name, the API's arithmetic.
    expect(sent!.expectTotalPaise).toBe(unit);
    expect(sent).not.toHaveProperty("expectedTotalMinor");
  });

  /*
    yuvoy-app#116 item 1. The box was kept in state and never sent, so a
    traveller who ticked it was recorded as never asked. The box is on the
    form every time, so the answer is always a boolean: `false` is "asked and
    declined", which the contract records apart from "never asked".
  */
  it.each([
    [true, "ticked"],
    [false, "left unticked"],
  ])("sends marketingConsent %s when the box is %s", async (ticked) => {
    let sent: { contact?: Record<string, unknown> } | undefined;
    server.use(
      http.post(`${BASE}/reservations`, async ({ request }) => {
        sent = (await request.json()) as typeof sent;
        return HttpResponse.json(
          {
            reservationId: "res_consent",
            state: "active",
            guests: 1,
            holdExpiresAt: "2026-09-14T04:10:00Z",
            requestExpiresAt: null,
            statusToken: "tok_consent",
          },
          { status: 201 },
        );
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={kayak} slot={kayakSlot} />);
    await fillContact(user);
    if (ticked) {
      await user.click(
        screen.getByRole("checkbox", { name: /occasional thing worth doing/i }),
      );
    }
    await user.click(screen.getByRole("button", { name: /^book now/i }));

    await waitFor(() => expect(sent).toBeDefined());
    expect(sent!.contact?.marketingConsent).toBe(ticked);
  });

  it("multiplies a per-person price by the party, and sends that", async () => {
    let sent: Record<string, unknown> | undefined;
    server.use(
      http.post(`${BASE}/reservations`, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          {
            reservationId: "res_kayak",
            state: "active",
            guests: 2,
            holdExpiresAt: "2026-09-14T04:10:00Z",
            requestExpiresAt: null,
            statusToken: "tok_kayak",
          },
          { status: 201 },
        );
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(
      <CheckoutForm experience={kayak} slot={kayakSlot} initialGuests={2} />,
    );
    await fillContact(user);
    await user.click(screen.getByRole("button", { name: /^book now/i }));

    await waitFor(() => expect(sent).toBeDefined());
    expect(sent!.expectTotalPaise).toBe(kayakSlot.price!.amountMinor * 2);
  });

  /*
    THE BUG THAT STOPPED EVERY SALE — yuvoy-app#28.

    The blocker was unconditional and its checkbox was not, so a listing with
    no `cancellationPolicy` asked the traveller to accept something that was
    never on the page. Every listing on `app.yuvoy.in` was in that state from
    launch: the field is `omitempty` and the API populated it with nothing.

    These fixtures all carry the field, which is exactly why the suite stayed
    green through the whole outage — so the absent case has to be built by
    hand here, and both halves of the pair are asserted.
  */
  describe("when the operator has published no cancellation terms", () => {
    const noPolicy = { ...kayak, cancellationPolicy: undefined };

    it("says so, and does not render a form that can never be submitted", () => {
      renderWithQuery(<CheckoutForm experience={noPolicy} slot={kayakSlot} />);

      expect(
        screen.getByText(/cannot take a booking for this one yet/i),
      ).toBeInTheDocument();
      // The dead button is the defect. There must be no submit at all.
      expect(
        screen.queryByRole("button", { name: /^book now/i }),
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Your name")).not.toBeInTheDocument();
      // And nothing may name a control that is not on the page.
      expect(screen.queryByText(/Still needed:/i)).not.toBeInTheDocument();
    });

    it("leaves a way back rather than a dead end", () => {
      renderWithQuery(<CheckoutForm experience={noPolicy} slot={kayakSlot} />);
      expect(
        screen.getByRole("link", { name: /back to this experience/i }),
      ).toHaveAttribute("href", `/e/${kayak.slug}`);
    });

    it("treats terms of whitespace as no terms at all", () => {
      renderWithQuery(
        <CheckoutForm
          experience={{ ...kayak, cancellationPolicy: "   " }}
          slot={kayakSlot}
        />,
      );
      expect(
        screen.getByText(/cannot take a booking for this one yet/i),
      ).toBeInTheDocument();
    });
  });

  it("renders the acceptance checkbox whenever the form itself renders", async () => {
    // The other half of the pair: the control that clears the blocker must be
    // there every time the blocker is asked for.
    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={kayak} slot={kayakSlot} />);

    const box = screen.getByRole("checkbox", { name: /called off/i });
    expect(box).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(kayak.cancellationPolicy!.slice(0, 30), "i")),
    ).toBeInTheDocument();

    await user.type(await screen.findByLabelText("Your name"), "Asha Menon");
    await user.type(screen.getByLabelText("WhatsApp number"), "+919000000000");
    // Blocked until it is ticked, and released by ticking it — which is the
    // thing that was impossible.
    expect(screen.getByRole("button", { name: /^book now/i })).toBeDisabled();
    await user.click(box);
    expect(screen.getByRole("button", { name: /^book now/i })).toBeEnabled();
  });

  it("says the operator answers first in request mode, and does not promise a seat", () => {
    /*
      "Send request", not "Ask the operator" (yuvoy-app#62 item 7). The old
      label belonged to a pop-up on the LISTING page that this issue deleted.
      On a checkout page with a day, a time, a party and their details already
      filled in, "Ask" understates what the traveller just did: they have
      committed to everything except the operator's yes.
    */
    const snorkel = EXPERIENCE_DETAIL["snorkel-elephant-beach"];
    const snorkelSlot = availabilityFor("snorkel-elephant-beach")[0];
    renderWithQuery(<CheckoutForm experience={snorkel} slot={snorkelSlot} />);

    expect(
      screen.getByRole("button", { name: /send request/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/You pay only once the operator says yes/i),
    ).toBeInTheDocument();
  });
});
