"use client";

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCreateReservation } from "@/lib/booking/use-checkout";
import { bookingUrl } from "@/lib/booking/token-store";
import { readAttribution } from "@/lib/booking/attribution";
import {
  ScreeningFields,
  bandMeetsMinimum,
  type AgeBand,
} from "./screening-fields";
import { QuestionFields } from "./question-fields";
import { checkoutRefusal } from "@/lib/booking/checkout-readiness";
import {
  answersRequiredIds,
  canEnforceAnswers,
  toBookingAnswers,
  unansweredRequired,
  type AnswerDraft,
} from "@/lib/booking/answers";
import { describeError, FailurePanel, RECOVER_PATH } from "@/components/states";
import { YuvoyError } from "@/lib/api/errors";
import { formatMoney } from "@/lib/format/money";
import { Field } from "@/components/ui/field";
import { PartyStepper } from "@/components/ui/party-stepper";
import { Button, ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StickyBar } from "@/components/ui/sticky-bar";
import type { components } from "@/lib/api/schema.gen";

type Experience = components["schemas"]["Experience"];
type Slot = components["schemas"]["Slot"];

/**
 * T6 — checkout. The most important screen in the app.
 *
 * The form is deliberately tiny: a name and a WhatsApp number, and nothing
 * else required. Every extra field costs conversions on the one funnel there
 * is, and this is the screen where a traveller decides whether Yuvoy is worth
 * the trouble.
 *
 * The safety gates (T7) render inline rather than as a second step, because
 * the experience response already carries `safety` — a round trip here costs
 * bookings, which is why the contract puts it on the page response.
 *
 * The one action lives in a sticky bar at the foot, with the total on it, as
 * every reference checkout carries it. The bar is the form's last child, so
 * it sticks for the whole page and never covers the last field.
 */
export function CheckoutForm({
  experience,
  slot,
}: {
  experience: Experience;
  slot: Slot;
}) {
  /*
    THE DEAD FORM, REFUSED BEFORE IT RENDERS — yuvoy-app#28.

    This wrapper exists so the refusal can come before a single piece of form
    state is created: the rules of hooks forbid returning early from inside
    `CheckoutFields`, and a traveller must not be able to fill in a form that
    can never be submitted. `checkoutRefusal` owns both the condition and the
    sentence, so the two cannot drift apart the way the blocker and its
    checkbox did.
  */
  const refusal = checkoutRefusal(experience);
  if (refusal) {
    return (
      <Panel tone="alert" role="alert">
        <p className="text-sm font-bold">{refusal.title}</p>
        <p className="text-forest/70 mt-1.5 text-sm">{refusal.body}</p>
        <ButtonLink
          href={`/e/${experience.slug}`}
          variant="outline"
          size="sm"
          className="mt-4"
        >
          Back to this experience
        </ButtonLink>
      </Panel>
    );
  }

  return <CheckoutFields experience={experience} slot={slot} />;
}

function CheckoutFields({
  experience,
  slot,
}: {
  experience: Experience;
  slot: Slot;
}) {
  const router = useRouter();
  const create = useCreateReservation();

  /**
   * A synchronous guard against the fast double-tap.
   *
   * `create.isPending` is React state, so it is not true until a re-render —
   * and two taps 40ms apart both read the old value. On the first tap the
   * mutation succeeds and CLEARS the idempotency key (so the next checkout
   * gets a fresh one), which means the second tap mints a NEW key and books
   * a second time. A ref updates in the same tick and closes that window.
   *
   * The disabled attribute stays too: it is what a person sees, this is what
   * the machine obeys.
   */
  const submitting = useRef(false);

  const [guests, setGuests] = useState(1);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [declaredClear, setDeclaredClear] = useState<boolean | undefined>(
    undefined,
  );
  const [ageBands, setAgeBands] = useState<(AgeBand | undefined)[]>([]);
  /** One draft per question the listing asks. Empty means not answered yet. */
  const [answers, setAnswers] = useState<AnswerDraft>({});
  /**
   * The server made the reservation and returned no token to open it with.
   * The schema allows it; a traveller must not be left on a frozen form.
   */
  const [tokenMissing, setTokenMissing] = useState(false);

  const safety = experience.safety;
  const maxParty = slot.maxPartySize ?? experience.maxPartySize ?? 10;
  const isRequest = slot.bookingMode === "request";

  /*
    THE LISTING'S OWN QUESTIONS - yuvoy-app#46.

    `enforceAnswers` is the whole decision in one boolean. Sending `answers`,
    even as an empty list, is what makes a required question count; omitting
    it means "nothing about questions is checked" and the traveller answers
    from the booking link afterwards. Both are legitimate, and the second is
    the safe fallback when the listing carries a required question no control
    can answer - see `canEnforceAnswers`. Without that guard a mis-saved
    `choice` with no options would be a permanently dead Book button, which is
    yuvoy-app#28 all over again.
  */
  /*
    Memoised because `?? []` mints a new array every render, and this feeds the
    `blockers` memo below - so without it the memo's dependency changes on
    every render and the memo never memoises anything.
  */
  const questions = useMemo(
    () => experience.questions ?? [],
    [experience.questions],
  );
  const enforceAnswers = canEnforceAnswers(questions);

  const total = slot.price
    ? {
        amountMinor: slot.price.amountMinor * guests,
        currency: slot.price.currency,
      }
    : null;

  /** Everything that must be true before the button does anything. */
  const blockers = useMemo(() => {
    const out: string[] = [];
    if (!name.trim()) out.push("your name");
    if (!whatsapp.trim()) out.push("a WhatsApp number");
    if (!policyAccepted) out.push("the cancellation policy");
    if (safety?.screener && declaredClear === undefined) {
      // Omitted is not false — the form must not let this through.
      out.push("the health check");
    }
    if (safety?.minAge) {
      const filled = ageBands.slice(0, guests).filter(Boolean).length;
      if (filled < guests) out.push("an age range for everyone");
    }
    /*
      Refused here rather than by the server. The same test produces
      `409 answers_required`, so predicting it saves a traveller on island
      signal a round trip and a scroll back up a form they thought was done.
      Only when the body will actually carry `answers`: with nothing sent,
      nothing is required, and a blocker would be a button dead for no reason.
    */
    if (enforceAnswers && unansweredRequired(questions, answers).length > 0) {
      out.push("the operator's questions");
    }
    return out;
  }, [
    name,
    whatsapp,
    policyAccepted,
    safety,
    declaredClear,
    ageBands,
    guests,
    enforceAnswers,
    questions,
    answers,
  ]);

  const declaredCondition = declaredClear === false;
  const tooYoung =
    safety?.minAge != null &&
    ageBands
      .slice(0, guests)
      .some((b) => b && !bandMeetsMinimum(b, safety.minAge!));

  const canSubmit =
    blockers.length === 0 &&
    !declaredCondition &&
    !tooYoung &&
    !create.isPending &&
    // Succeeded already: they are on their way to the booking screen. A live
    // button here is a second booking waiting to happen if navigation is slow.
    !create.isSuccess;

  async function submit() {
    if (submitting.current) return;
    submitting.current = true;
    try {
      await hold();
    } catch {
      // Swallowed DELIBERATELY, and only here. `mutateAsync` rejects as well
      // as storing the failure on `create.error`, which is what renders the
      // message below — so letting it propagate produces an unhandled
      // rejection for a failure the traveller can already see. Nothing is lost:
      // the error object is still on the mutation.
    } finally {
      submitting.current = false;
    }
  }

  async function hold() {
    /*
      Where this visit came from, if it said. Read at submit rather than at
      mount, and part of the body — so it is inside the idempotency
      fingerprint, as the contract requires: "a retry that changes it is
      refused rather than silently re-attributing a booking that already
      exists". Absent when the visit made no claim; a checkout must not fail
      over a marketing field.
    */
    const attribution = readAttribution();

    const reservation = await create.mutateAsync({
      slotId: slot.id,
      guests,
      contact: {
        name: name.trim(),
        whatsapp: whatsapp.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
      },
      ...(attribution ? { attribution } : {}),
      ...(safety?.screener || safety?.minAge
        ? {
            screening: {
              ...(safety.screener ? { declaredClear } : {}),
              ...(safety.minAge
                ? { ageBands: ageBands.slice(0, guests) as AgeBand[] }
                : {}),
            },
          }
        : {}),
      /*
        SENT WHENEVER THE LISTING ASKS ANYTHING, EVEN AS AN EMPTY LIST.

        That is what turns required questions on. Omitted, the booking is made
        and every question reads as not answered yet on the operator's
        manifest - which is the right outcome only when this form could not
        ask them properly, and `enforceAnswers` is what says so.

        It is part of the body, so it is inside the idempotency fingerprint
        with nothing here arranging it. Changing an answer mints a new key,
        which is correct: replaying the old one would hand back a reservation
        carrying the answer the traveller just corrected.
      */
      ...(enforceAnswers && questions.length > 0
        ? { answers: toBookingAnswers(questions, answers) }
        : {}),
    });

    // The token goes in the FRAGMENT, immediately, and is never put in a path
    // or a query — this API logs request URIs.
    if (reservation.statusToken) {
      router.replace(bookingUrl(reservation.statusToken));
    } else {
      // Booked, and no way in. Say so, with the way in that does exist.
      setTokenMissing(true);
    }
  }

  const failure = create.error ? describeError(create.error) : null;
  /*
    The questions a `409 answers_required` named, marked in place. The panel
    below says what happened; this says WHICH, which is the part a traveller
    can act on without reading the form again from the top.
  */
  const flaggedQuestions = answersRequiredIds(create.error);
  const capacityError =
    create.error instanceof YuvoyError &&
    create.error.code === "capacity_unavailable"
      ? create.error
      : null;

  const action = create.isPending
    ? "Holding your seats…"
    : isRequest
      ? "Ask the operator"
      : total
        ? `Hold these seats · ${formatMoney(total)}`
        : "Hold these seats";

  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) void submit();
      }}
    >
      <div className="space-y-8">
        {/*
          Party size, checked against the WHOLE party rather than one seat.

          The same component the listing now carries (yuvoy-app#32), so the two
          cannot disagree about the cap or about what to say at it. A traveller
          who set four on the listing arrives here with four already chosen.
        */}
        <PartyStepper value={guests} onChange={setGuests} max={maxParty} />

        {/* Name and WhatsApp. Nothing else is required, on purpose. */}
        <div className="space-y-4">
          <Field
            label="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
          />
          <Field
            label="WhatsApp number"
            type="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            autoComplete="tel"
            hint="This is how we send your booking and reach you if the sea changes."
            required
          />
          <Field
            label="Email (optional)"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>

        {safety ? (
          <ScreeningFields
            safety={safety}
            guests={guests}
            declaredClear={declaredClear}
            ageBands={ageBands}
            onDeclaredClearChange={setDeclaredClear}
            onAgeBandChange={(i, band) =>
              setAgeBands((prev) => {
                const next = [...prev];
                next[i] = band;
                return next;
              })
            }
          />
        ) : null}

        {questions.length > 0 ? (
          <QuestionFields
            questions={questions}
            draft={answers}
            onChange={(id, value) =>
              setAnswers((prev) => ({ ...prev, [id]: value }))
            }
            flagged={flaggedQuestions}
            legend={`What ${experience.operator.name} asks`}
            intro="The operator asks these, and they go on their manifest with your booking."
          />
        ) : null}

        {tooYoung && safety?.minAge ? (
          <p role="alert" className="text-terra-deep text-sm">
            This operator takes people aged {safety.minAge} and over. We check
            against the bottom of each range, so a range that starts below{" "}
            {safety.minAge} cannot be accepted.
          </p>
        ) : null}

        {/* Price and policy, frozen at this moment. */}
        <Panel>
          <div className="flex items-baseline justify-between">
            <span className="label text-forest/75">Total</span>
            {total ? (
              <span className="text-xl font-bold">{formatMoney(total)}</span>
            ) : (
              <span className="text-forest/70 text-sm">
                Confirmed before you pay
              </span>
            )}
          </div>
          <p className="text-forest/70 mt-1.5 text-xs">
            All in. Nothing is added after this screen.
          </p>

          {/*
            UNCONDITIONAL, and that is the fix for yuvoy-app#28.

            `policyAccepted` is required unconditionally in `blockers`, so the
            control that clears it must render unconditionally too. It was
            gated on `experience.cancellationPolicy` while the blocker was
            not, and every listing that came back without the field — which
            was all of them — got a permanently dead submit button asking for
            a checkbox that was not on the page.

            The absent case is now refused above, in `CheckoutForm`, before
            this form exists at all. So by the time this renders the policy is
            present, and this must NOT go back to a conditional: the pair
            being conditional-and-unconditional is the defect itself.
          */}
          <label className="mt-4 flex cursor-pointer gap-3 text-sm">
            <input
              type="checkbox"
              checked={policyAccepted}
              onChange={(e) => setPolicyAccepted(e.target.checked)}
              className="accent-terra-deep mt-0.5 size-4 shrink-0"
              aria-describedby="policy-text"
            />
            <span id="policy-text" className="text-forest/80">
              I have read what happens if it is called off:{" "}
              {experience.cancellationPolicy}
            </span>
          </label>

          {/* Separate, and unticked. Consent to be marketed to is not consent
              to be transported. */}
          <label className="mt-3 flex cursor-pointer gap-3 text-sm">
            <input
              type="checkbox"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
              className="accent-terra-deep mt-0.5 size-4 shrink-0"
            />
            <span className="text-forest/70">
              Send me the occasional thing worth doing. Optional.
            </span>
          </label>
        </Panel>

        {failure ? (
          <FailurePanel failure={failure}>
            {/* capacity_unavailable carries what is left — offer it. */}
            {capacityError?.remaining ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setGuests(capacityError.remaining!)}
                className="mt-3"
              >
                Book {capacityError.remaining} instead
              </Button>
            ) : null}
          </FailurePanel>
        ) : null}

        {tokenMissing ? (
          <Panel tone="alert" role="alert">
            <p className="text-sm font-bold">
              Your seats are held, and we could not open the page for them
            </p>
            <p className="text-forest/70 mt-1.5 text-sm">
              The booking went through. To reach it, ask for your link with the
              number you just used. It arrives the same way it always does.
            </p>
            <ButtonLink
              href={RECOVER_PATH}
              variant="outline"
              size="sm"
              className="mt-4"
            >
              Get my link
            </ButtonLink>
          </Panel>
        ) : null}
      </div>

      <StickyBar className="mt-auto">
        <Button type="submit" size="lg" block disabled={!canSubmit}>
          {action}
        </Button>
        <p className="text-forest/70 mt-3 text-center text-xs">
          {isRequest
            ? "You pay only once the operator says yes."
            : "We hold your seats for 10 minutes while you pay."}
        </p>
        {blockers.length > 0 ? (
          <p className="text-forest/70 mt-1 text-center text-xs">
            Still needed: {blockers.join(", ")}.
          </p>
        ) : null}
      </StickyBar>
    </form>
  );
}
