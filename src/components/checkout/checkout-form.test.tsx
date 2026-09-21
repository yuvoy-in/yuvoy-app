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

    const button = screen.getByRole("button", { name: /hold these seats/i });
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
    await user.click(screen.getByRole("button", { name: /hold these seats/i }));

    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole("button", { name: /hold these seats/i }),
    ).toBeDisabled();
  });

  it("puts the status token in the FRAGMENT, never a query", async () => {
    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={kayak} slot={kayakSlot} />);
    await fillContact(user);
    await user.click(screen.getByRole("button", { name: /hold these seats/i }));

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
    expect(
      screen.getByRole("button", { name: /hold these seats/i }),
    ).toBeDisabled();
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
    // Nothing has been booked and nothing charged — and the button must not
    // let them proceed into a refusal.
    expect(
      screen.getByRole("button", { name: /hold these seats/i }),
    ).toBeDisabled();
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
    await user.click(screen.getByRole("button", { name: /hold these seats/i }));

    // details.remaining exists so the UI can offer the smaller party rather
    // than sending them back to start again.
    expect(
      await screen.findByRole("button", { name: "Book 2 instead" }),
    ).toBeInTheDocument();
    expect(screen.getByText("01JCAP")).toBeInTheDocument();
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
        screen.queryByRole("button", { name: /hold these seats/i }),
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
    expect(
      screen.getByRole("button", { name: /hold these seats/i }),
    ).toBeDisabled();
    await user.click(box);
    expect(
      screen.getByRole("button", { name: /hold these seats/i }),
    ).toBeEnabled();
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

/* ------------------------------------- the listing's own questions (#46) */

describe("CheckoutForm — what the operator asks", () => {
  /** The 201 the dive checkout expects, so the flow reaches the router. */
  function held() {
    return HttpResponse.json(
      {
        reservationId: "res_q",
        state: "active",
        guests: 1,
        holdExpiresAt: new Date(Date.now() + 600_000).toISOString(),
        requestExpiresAt: null,
        statusToken: "tok_q",
      },
      { status: 201 },
    );
  }

  /** Everything the dive needs apart from the operator's own questions. */
  async function fillDive(user: ReturnType<typeof userEvent.setup>) {
    await fillContact(user);
    await user.click(
      screen.getByRole("radio", { name: /nobody in my party has any/i }),
    );
    await user.selectOptions(
      screen.getByLabelText("Your age range"),
      "18_plus",
    );
  }

  it("draws a control per answerType, and none a wrong answer fits through", () => {
    renderWithQuery(<CheckoutForm experience={dive} slot={diveSlot} />);

    // choice -> a select over the listing's own options, never free text.
    const agency = screen.getByLabelText(
      "Which agency certified you? (optional)",
    );
    expect(agency.tagName).toBe("SELECT");
    expect(
      Array.from(agency.querySelectorAll("option")).map((o) => o.textContent),
    ).toEqual(["Choose one", "PADI", "SSI", "NAUI", "Not certified yet"]);

    // yes_no -> two radios, with NO default. A default is an answer nobody
    // gave, recorded against the traveller's name on the manifest.
    const yes = screen.getByRole("radio", { name: "Yes" });
    const no = screen.getByRole("radio", { name: "No" });
    expect(yes).not.toBeChecked();
    expect(no).not.toBeChecked();

    // short_text -> capped where the API caps it, on the input.
    expect(
      screen.getByLabelText(
        "Which hotel should we collect you from? (optional)",
      ),
    ).toHaveAttribute("maxlength", "300");
  });

  it("refuses locally rather than spending a round trip on a 409 it can predict", async () => {
    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={dive} slot={diveSlot} />);
    await fillDive(user);

    expect(
      screen.getByRole("button", { name: /hold these seats/i }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Still needed:.*the operator's questions/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Yes" }));
    expect(
      screen.getByRole("button", { name: /hold these seats/i }),
    ).toBeEnabled();
  });

  it("sends answers, which is what makes a required question count", async () => {
    let sent: { answers?: unknown } | null = null;
    server.use(
      http.post(`${BASE}/reservations`, async ({ request }) => {
        sent = (await request.json()) as { answers?: unknown };
        return held();
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={dive} slot={diveSlot} />);
    await fillDive(user);
    await user.click(screen.getByRole("radio", { name: "Yes" }));
    await user.selectOptions(
      screen.getByLabelText("Which agency certified you? (optional)"),
      "SSI",
    );
    await user.click(screen.getByRole("button", { name: /hold these seats/i }));

    await waitFor(() => expect(sent).not.toBeNull());
    // The listing's order, and the untouched optional one left out rather than
    // sent blank: an empty answer "does not fit" and would be dropped anyway.
    expect(sent!.answers).toEqual([
      { questionId: "q_cert_agency", answer: "SSI" },
      { questionId: "q_dived_before", answer: "yes" },
    ]);
  });

  it("sends no answers key at all for a listing that asks nothing", async () => {
    let sent: Record<string, unknown> | null = null;
    server.use(
      http.post(`${BASE}/reservations`, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return held();
      }),
    );

    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={kayak} slot={kayakSlot} />);
    await fillContact(user);
    await user.click(screen.getByRole("button", { name: /hold these seats/i }));

    await waitFor(() => expect(sent).not.toBeNull());
    // Omitted, not empty. A listing with no questions books exactly as before.
    expect(sent!).not.toHaveProperty("answers");
  });

  it("points at each question a 409 named, rather than only saying something is wrong", async () => {
    server.use(
      http.post(`${BASE}/reservations`, () =>
        HttpResponse.json(
          {
            error: {
              code: "answers_required",
              message: "raw",
              details: {
                questions: [
                  {
                    questionId: "q_dived_before",
                    text: "Has everyone in your party dived before?",
                  },
                ],
              },
            },
          },
          { status: 409 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={dive} slot={diveSlot} />);
    await fillDive(user);
    await user.click(screen.getByRole("radio", { name: "Yes" }));
    await user.click(screen.getByRole("button", { name: /hold these seats/i }));

    // The panel says what happened ...
    expect(
      await screen.findByText("Some questions need an answer first"),
    ).toBeInTheDocument();
    // ... and the question itself says which, which is the actionable half.
    expect(screen.getByText("This one needs an answer.")).toBeInTheDocument();
    // Never the generic fallback: without `answers_required` in ERROR_CODES
    // this reads "Something went wrong" with a retry that cannot work.
    expect(document.body.textContent).not.toMatch(/Something went wrong/);
  });

  /*
    A `choice` question an operator saved with no options. Nothing can answer
    it, so if it were required and the body still sent `answers`, every
    checkout would be refused with a 409 the traveller cannot clear: the
    yuvoy-app#28 defect again, in a new field.
  */
  it("stops enforcing answers rather than shipping a dead button", async () => {
    let sent: Record<string, unknown> | null = null;
    server.use(
      http.post(`${BASE}/reservations`, async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return held();
      }),
    );

    const broken = {
      ...kayak,
      questions: [
        {
          id: "q_broken",
          text: "Pick one",
          answerType: "choice" as const,
          required: true,
        },
      ],
    };

    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={broken} slot={kayakSlot} />);
    await fillContact(user);

    const submit = screen.getByRole("button", { name: /hold these seats/i });
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent!).not.toHaveProperty("answers");
  });
});

describe("the cancellation terms, as production actually sends them", () => {
  /*
    Copied from the live API on 21 September 2026, not from a fixture.

    The fixtures carry a one-sentence policy that reads fine inline, and that
    is exactly why this went unseen: production sends four rules in 227
    characters, and inline they turned the consent checkbox into a wall of
    text. A test shaped like the fixture passes for the wrong reason.
  */
  const PRODUCTION_POLICY =
    "Cancel 48 hours or more before your trip starts: full refund. Cancel 24-48 hours before: half refund. Inside 24 hours: no refund. If the operator or the weather cancels your trip, you are always refunded in full, automatically.";

  it("lists every rule, in order, without hiding any of them", () => {
    renderWithQuery(
      <CheckoutForm
        experience={{ ...kayak, cancellationPolicy: PRODUCTION_POLICY }}
        slot={kayakSlot}
      />,
    );

    /*
      Consent has to be informed, so nothing sits behind a tap. Every rule is
      on screen, as its own line, in the operator's order.
    */
    const items = screen
      .getByText("If plans change")
      .parentElement!.querySelectorAll("li");
    expect(Array.from(items).map((li) => li.textContent)).toEqual([
      "Cancel 48 hours or more before your trip starts: full refund.",
      "Cancel 24-48 hours before: half refund.",
      "Inside 24 hours: no refund.",
      "If the operator or the weather cancels your trip, you are always refunded in full, automatically.",
    ]);
  });

  it("keeps the checkbox's own name short, and ties it to the terms", () => {
    renderWithQuery(
      <CheckoutForm
        experience={{ ...kayak, cancellationPolicy: PRODUCTION_POLICY }}
        slot={kayakSlot}
      />,
    );

    const box = screen.getByRole("checkbox", { name: /called off/i });
    /*
      THE DEFECT: the accessible NAME used to be the whole policy, so a screen
      reader announced 227 characters as the label of one checkbox. The name is
      the short sentence now and the terms are its DESCRIPTION, which is what
      `aria-describedby` is for.
    */
    /*
      The COMPUTED accessible name, not the `aria-label` attribute. A first
      version of this test read the attribute, which this control never had,
      so it compared an empty string and passed on the broken code too: a guard
      that could not fail. Checked by reverting the fix and watching it fail.
    */
    expect(box).toHaveAccessibleName(/called off/i);
    expect(box).not.toHaveAccessibleName(/refund/i);
    expect(box).toHaveAccessibleDescription(/full refund/i);
  });
});
