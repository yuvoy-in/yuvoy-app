import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQuery } from "@/test/render";
import { CheckoutForm } from "./checkout-form";
import { EXPERIENCE_DETAIL, availabilityFor } from "../../../mocks/fixtures";
import { server } from "../../../mocks/server";
import { http, HttpResponse } from "msw";

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

    expect(screen.getByRole("button", { name: /^book now/i })).toBeDisabled();
    expect(
      screen.getByText(/Still needed:.*the operator's questions/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Yes" }));
    expect(screen.getByRole("button", { name: /^book now/i })).toBeEnabled();
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
    await user.click(screen.getByRole("button", { name: /^book now/i }));

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
    await user.click(screen.getByRole("button", { name: /^book now/i }));

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
    await user.click(screen.getByRole("button", { name: /^book now/i }));

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
    An answer holding a phone number, an email address or a link is refused,
    never dropped (yuvoy-api#282 item 5). Against the mock's own refusal,
    which is the API's: the reason goes beside the answer, and the panel says
    what happened rather than asking for answers already given.
  */
  it("says beside an answer holding a phone number why it was refused", async () => {
    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={dive} slot={diveSlot} />);
    await fillDive(user);
    await user.click(screen.getByRole("radio", { name: "Yes" }));
    await user.type(
      screen.getByLabelText(
        "Which hotel should we collect you from? (optional)",
      ),
      "Ring 98765 43210 at the gate",
    );
    await user.click(screen.getByRole("button", { name: /^book now/i }));

    expect(
      await screen.findByText("An answer has contact details in it"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "An answer cannot include a phone number, an email address or a link, and this one looks like it has a phone number, from seven or more digits written close together. Write it another way.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("This one needs an answer.")).toBeNull();
    expect(
      screen.queryByText("Some questions need an answer first"),
    ).toBeNull();
  });

  it("books with a time range in an answer, which is not a phone number", async () => {
    let sent: { answers?: unknown } | null = null;
    server.use(
      http.post(`${BASE}/reservations`, async ({ request }) => {
        sent = (await request.clone().json()) as { answers?: unknown };
        // On to the mock's own handler, which refuses a phone number.
        return undefined;
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<CheckoutForm experience={dive} slot={diveSlot} />);
    await fillDive(user);
    await user.click(screen.getByRole("radio", { name: "Yes" }));
    await user.type(
      screen.getByLabelText(
        "Which hotel should we collect you from? (optional)",
      ),
      "Sea Shell, any time 0830-0930",
    );
    await user.click(screen.getByRole("button", { name: /^book now/i }));

    // Held, and on to the booking: the mock took the answer.
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
    expect(sent!.answers).toContainEqual({
      questionId: "q_pickup",
      answer: "Sea Shell, any time 0830-0930",
    });
    expect(
      screen.queryByText("An answer has contact details in it"),
    ).toBeNull();
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

    const submit = screen.getByRole("button", { name: /^book now/i });
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
