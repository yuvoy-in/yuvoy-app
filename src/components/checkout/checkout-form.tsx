"use client";

import { useState, useMemo, useRef, useEffect } from "react";
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
import { civilFromDate, weekdayDayMonth } from "@/lib/format/date";
import { DEFAULT_DIAL_CODE } from "@/components/ui/phone-field";
import {
  ContactFields,
  useContactState,
} from "@/components/auth/contact-fields";
import { useTravellerSession } from "@/lib/auth/use-traveller";
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
  initialGuests,
  onGuestsChange,
  onRefused,
}: {
  experience: Experience;
  slot: Slot;
  /** Restored from the URL, so a refresh keeps the party (yuvoy-app#62). */
  initialGuests?: number;
  /** Lifted so the screen above can keep it in the URL. */
  onGuestsChange?: (guests: number) => void;
  /**
   * The API refused the reservation because the calendar is out of date:
   * `capacity_unavailable` or `price_moved`. The screen above refetches the
   * month and puts this sentence over the calendar, which is where the
   * traveller looks next.
   */
  onRefused?: (message: string) => void;
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

  return (
    <CheckoutFields
      experience={experience}
      slot={slot}
      initialGuests={initialGuests}
      onGuestsChange={onGuestsChange}
      onRefused={onRefused}
    />
  );
}

function CheckoutFields({
  experience,
  slot,
  initialGuests,
  onGuestsChange,
  onRefused,
}: {
  experience: Experience;
  slot: Slot;
  initialGuests?: number;
  onGuestsChange?: (guests: number) => void;
  onRefused?: (message: string) => void;
}) {
  const router = useRouter();
  const create = useCreateReservation();
  const { refresh } = useTravellerSession();

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

  /*
    Seeded from the URL, and clamped, because `?guests=` survives a bookmark
    and a departure's cap is not the one it was booked under. The stepper
    enforces the cap while somebody taps; this is the same guard for a number
    that arrives already typed.
  */
  const [guests, setGuests] = useState(() =>
    Math.max(1, Math.min(initialGuests ?? 1, slot.maxPartySize ?? 99)),
  );
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState(DEFAULT_DIAL_CODE);
  const [email, setEmail] = useState("");

  /*
    Which fields this form may still demand, and what goes in `contact`
    (yuvoy-app#32). Declared here because `blockers` below reads it and
    `ContactFields` cannot tell the Pay button anything.
  */
  const contact = useContactState(email);
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
    /*
      Only the fields the form is still SHOWING (yuvoy-app#32). A signed-in
      traveller has no name box and no number box, so demanding either leaves
      Pay permanently dead under "still needs your name" on a form that does
      not ask for one.

      `phoneGiven` rather than a non-empty check: `PhoneField` seeds the value
      with a dial code, so "+91" alone is not a number.
    */
    if (contact.needsName && !name.trim()) out.push("your name");
    if (contact.needsPhone && whatsapp.replace(/\D/g, "").length <= 4) {
      out.push("a WhatsApp number");
    }
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
    contact.needsName,
    contact.needsPhone,
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
    } catch (error) {
      // Swallowed DELIBERATELY, and only here. `mutateAsync` rejects as well
      // as storing the failure on `create.error`, which is what renders the
      // message below — so letting it propagate produces an unhandled
      // rejection for a failure the traveller can already see. Nothing is lost:
      // the error object is still on the mutation.
      /*
        A 401 is the exception worth acting on rather than only showing. The
        proxy has already dropped the cookie by the time it arrives, so the
        cached "signed in" is stale and the form is still hiding the name and
        number fields behind "Booking as ...". `refresh` re-asks the server and
        brings them back (yuvoy-app#32).
      */
      if (error instanceof YuvoyError && error.status === 401) {
        await refresh();
      }
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
      /*
        THE TOTAL THE TRAVELLER AGREED TO - yuvoy-app#62 item 7.

        "Optional, and send it." An operator changes their own price with no
        review since D-032.3, so the gap between reading a total and pressing
        this button is however long a checkout screen sits open. Without this
        field the traveller is charged the NEW number having agreed to the old
        one, and the snapshot records the new number as what they agreed to.

        Sent only when there is a price to state. It is part of the body, so it
        is inside the idempotency fingerprint, which is correct: a retry after
        the price moved is a different agreement.
      */
      ...(total ? { expectedTotalMinor: total.amountMinor } : {}),
      authenticated: contact.authenticated,
      contact: contact.contactFor({ name, phone: whatsapp, email }),
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

  /*
    A REFUSAL THAT MEANS "THE CALENDAR IS OUT OF DATE" - yuvoy-app#62 item 7.

    `capacity_unavailable` (the seats went while they were filling this in) and
    `price_moved` (the departure is not the price the calendar showed) are both
    statements about the availability this page was drawn from, not about the
    form. So they are reported UPWARD: the screen refetches the month and puts
    the API's own sentence over the calendar, which is where somebody looks
    next.

    Reported in an effect rather than from the mutation's `onError`, because
    `describeError` and the branches below still render it here too. One event,
    two audiences, and neither is a substitute for the other.
  */
  useEffect(() => {
    if (!(create.error instanceof YuvoyError)) return;
    if (
      create.error.code !== "capacity_unavailable" &&
      create.error.code !== "price_moved"
    ) {
      return;
    }
    onRefused?.(create.error.message);
  }, [create.error, onRefused]);

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
  /*
    The two refusals about WHO is booking (yuvoy-app#32), handled the same way
    as in the Ask pop-up.

    `400` with `details["contact.name"]` is a profile with no name on record,
    and the sentence belongs on the field it concerns. `401` is a session that
    ended mid-form; `refresh` re-asks the server so the block flips back to
    both fields rather than showing "Booking as ..." over a dead session.
  */
  const whoFailure = create.error instanceof YuvoyError ? create.error : null;
  const nameRefusal =
    whoFailure?.status === 400 &&
    typeof whoFailure.details["contact.name"] === "string"
      ? (whoFailure.details["contact.name"] as string)
      : undefined;
  const sessionEnded = whoFailure?.status === 401;

  /*
    "Send request", not "Ask the operator" (yuvoy-app#62 item 7).

    The old label belonged to a pop-up on the listing page that this issue
    deleted. On a checkout page with a day, a time, a party and their details
    already filled in, "Ask" understates what the traveller just did: they have
    committed to everything except the operator's yes.
  */
  /*
    Built from what is chosen, skipping what is not, so it never reads
    "· · 2 people". The day comes from our own tables rather than `Intl`: this
    page is server rendered and that is the app#67 hydration case.
  */
  const civil = civilFromDate(slot.localDate ?? "");
  const summaryLine = [
    civil ? weekdayDayMonth(civil) : null,
    slot.localStartTime ? slot.localStartTime.slice(0, 5) : null,
    `${guests} ${guests === 1 ? "person" : "people"}`,
    total ? formatMoney(total) : null,
  ].filter(Boolean) as string[];

  const action = create.isPending
    ? isRequest
      ? "Sending…"
      : "Holding your seats…"
    : isRequest
      ? "Send request"
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
        <PartyStepper
          value={guests}
          onChange={(next) => {
            setGuests(next);
            onGuestsChange?.(next);
          }}
          max={maxParty}
        />

        {/*
          Who is booking. The SAME block the Ask pop-up uses (yuvoy-app#32), so
          a signed-in traveller is not asked for a name and number here either,
          and the two forms cannot drift apart the way they already had.

          The number is a `PhoneField` now rather than a free-text `tel` input.
          That arrived with the shared block rather than being asked for, and
          it is the better half of the two: it always emits E.164, which is
          what `contact.whatsapp` is specified as.
        */}
        {sessionEnded ? (
          <p role="alert" className="text-terra-deep text-sm">
            Your sign-in has ended. Enter your name and number to book this.
          </p>
        ) : null}
        <ContactFields
          name={name}
          onNameChange={setName}
          phone={whatsapp}
          onPhoneChange={setWhatsapp}
          email={contact.emailValue}
          onEmailChange={setEmail}
          nameError={nameRefusal}
          phoneHint="This is how we send your booking and reach you if the sea changes."
        />

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
        {/*
          The whole choice in one line (yuvoy-app#62 item 7). It is the last
          thing read before committing, and on a page where the day, the time
          and the party were each chosen several scrolls apart, it is the only
          place they appear together.
        */}
        <p className="text-forest/75 mb-3 text-center text-xs">
          {summaryLine.join(" · ")}
        </p>
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
