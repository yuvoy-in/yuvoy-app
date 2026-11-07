"use client";

import { useState, useMemo } from "react";
import { useCreateReservation } from "@/lib/booking/use-checkout";
import { PAY_AT_COUNTER, paymentLine } from "@/lib/booking/listing-lines";
import {
  ScreeningFields,
  bandMeetsMinimum,
  type AgeBand,
} from "./screening-fields";
import { QuestionFields } from "./question-fields";
import { canEnforceAnswers, type AnswerDraft } from "@/lib/booking/answers";
import { checkoutTotal, perPersonLine } from "@/lib/booking/checkout-total";
import { YuvoyError } from "@/lib/api/errors";
import { DEFAULT_DIAL_CODE } from "@/components/ui/phone-field";
import {
  ContactFields,
  useContactState,
} from "@/components/auth/contact-fields";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import { useStanding } from "@/lib/auth/use-access";
import { PartyStepper } from "@/components/ui/party-stepper";
import type { components } from "@/lib/api/schema.gen";
import { CheckoutTerms } from "./checkout-terms";
import {
  CheckoutBar,
  CheckoutRefusal,
  TokenMissingPanel,
} from "./checkout-foot";
import { useCheckoutSubmit } from "./checkout-submit";
import {
  checkoutAction,
  checkoutBlockers,
  checkoutSummaryLine,
  gateViewFor,
  readCheckoutFailure,
} from "./checkout-lines";
import { useCheckoutMotion } from "./use-checkout-motion";

type Experience = components["schemas"]["Experience"];
type Slot = components["schemas"]["Slot"];

export function CheckoutFields({
  experience,
  slot,
  initialGuests,
  onGuestsChange,
  onRefused,
  arrive,
  trigoCardId,
}: {
  experience: Experience;
  slot: Slot;
  initialGuests?: number;
  onGuestsChange?: (guests: number) => void;
  onRefused?: (message: string) => void;
  arrive: boolean;
  trigoCardId: string | null;
}) {
  const create = useCreateReservation();
  const { refresh, signedIn } = useTravellerSession();

  /*
    BOOKING BY INVITATION (yuvoy-api#195), and the one piece of this that
    ships whatever this app's own switch says.

    The API's gate and this app's are two switches, and Hima turns the API's
    on the day the code screen is live. So a build with `NEXT_PUBLIC_INVITE_ONLY`
    off can still meet `403 invite_required` here, and without this the
    traveller would get the generic failure panel: a refusal they cannot act
    on, over a form they have just filled in.

    `gateOpen` is the OTHER half, and that one is behind the switch. With the
    gate on, this form is only rendered for a number the server decided may
    see it, and the device can sign out from under that decision (Account in
    another tab, "Not you?" on a gate). The page asks the server again when it
    notices, but a submit in that window would be a guest booking the gate is
    supposed to be refusing, so it is refused here instead of sent.
  */
  const [gateOpen, setGateOpen] = useState(false);
  const inviteRefused =
    create.error instanceof YuvoyError &&
    create.error.code === "invite_required";
  const showGate = inviteRefused || gateOpen;
  /*
    Enabled only once the gate is showing, and then regardless of the switch:
    this is the one caller of `useStanding` that has to ask `GET /me` in a
    build where the app's own gate is off. Nothing is read before that, so a
    checkout that is never refused costs no request.
  */
  const standing = useStanding(showGate);

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
  /** The hold is taken and the same tap is finishing it in cash. */
  const [finishing, setFinishing] = useState(false);

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

  /*
    Per the listing's pricing unit, the way the API computes it: a price for
    the whole group is not multiplied by the party. See `checkoutTotal`.
  */
  const total = checkoutTotal(slot.price, guests, experience.pricingUnit);
  // A price for the whole group (boat or not) also says what it comes to each.
  const each = perPersonLine(total, guests, experience.pricingUnit);

  /** Everything that must be true before the button does anything. */
  const blockers = useMemo(
    () =>
      checkoutBlockers({
        needsName: contact.needsName,
        needsPhone: contact.needsPhone,
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
      }),
    [
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
    ],
  );

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

  const submit = useCheckoutSubmit({
    create,
    signedIn,
    refresh,
    setGateOpen,
    setTokenMissing,
    setFinishing,
    onRefused,
    experience,
    slot,
    trigoCardId,
    guests,
    total,
    contact,
    name,
    whatsapp,
    email,
    marketing,
    safety,
    declaredClear,
    ageBands,
    enforceAnswers,
    questions,
    answers,
  });

  const {
    failure,
    flaggedQuestions,
    answerReasons,
    capacityError,
    nameRefusal,
    phoneRefusal,
    sessionEnded,
  } = readCheckoutFailure(create.error);

  const summaryLine = checkoutSummaryLine(slot, guests, total);
  const gateView = gateViewFor(standing);

  /*
    "Book now, pay ₹4,500 cash on the day": the one tap books it, and says so
    with the money in it, as the booking page's own cash button does. Only
    where the listing is paid at the counter, which is every listing today
    (`PAY_AT_COUNTER` is what `paymentLine` says when the API names no other
    way); a listing the API says is paid otherwise is booked by "Book now"
    and finished on the booking page, without a promise about cash.
  */
  const cashAtCounter = paymentLine(experience) === PAY_AT_COUNTER;
  const action = checkoutAction(isRequest, total, cashAtCounter);
  /*
    WORKING, AND SAYING SO (T08 A, approved 4 Oct 2026). The tap that books
    used to fade the button to 40%, `disabled`, for as long as island signal
    took, so the moment of commitment looked like a switched-off control. The
    button now keeps its colour and focus while it works, its label
    cross-fades to the working verb, and a ring shows only for a wait over
    300ms (`Button`'s `pending`). The request still starts on the tap, and a
    second tap does nothing: `canSubmit` is false while it works, and the
    button swallows the tap besides.
  */
  const working =
    create.isPending ||
    finishing ||
    // Booked, and on its way to the booking page: working until it changes,
    // unless there is no page to go to (the form stays and says so).
    (create.isSuccess && !tokenMissing);
  /** What the invite gate tells them to tap again: the button, in short. */
  const retryAction = isRequest ? "Send request" : "Book now";

  /*
    A REFUSAL IS SEEN, NOT ONLY ANNOUNCED (T08 A). Its panel lands at the
    foot of the form, which is usually under the sticky bar or below the
    fold: it was announced (`role="alert"`) and seen by nobody. Each refusal
    is now its own arrival (keyed by the attempt), and as it lands the page
    makes room for it, so its foot sits 16px above the bar; it rises into
    view, and focus moves to it.
  */
  const refusal = showGate
    ? `gate-${gateOpen ? "here" : create.submittedAt}`
    : failure
      ? `failure-${create.submittedAt}`
      : null;
  const { refusalRef, barRef, fieldsRef } = useCheckoutMotion(refusal, arrive);

  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={(e) => {
        /*
          THIS FORM'S OWN SUBMIT, AND NOTHING ELSE'S.

          The invite gate draws its sign-in steps and its code form inside
          this one (yuvoy-api#195), and React dispatches `submit` up its tree,
          so "Send me a code" or "Use this code" would otherwise also run this
          handler and try to book. Both of those stop the event themselves;
          this is the half that does not depend on them remembering to,
          because what is downstream of forgetting is a reservation.
        */
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        if (canSubmit) void submit();
      }}
    >
      <div ref={fieldsRef} className="space-y-8">
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
          phoneError={phoneRefusal}
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
            reasons={answerReasons}
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
        <CheckoutTerms
          total={total}
          each={each}
          cancellationPolicy={experience.cancellationPolicy}
          policyAccepted={policyAccepted}
          onPolicyAcceptedChange={setPolicyAccepted}
          marketing={marketing}
          onMarketingChange={setMarketing}
        />

        {/*
          THE INVITATION, ASKED FOR IN PLACE (yuvoy-api#195).

          Where the generic failure panel would go, and instead of it: a
          refusal a traveller can act on, at the foot of the form they filled
          in, with every field still holding what they typed. Nothing is
          unmounted and no navigation happens, which is the whole point. The
          API held nothing and charged nothing, and the panel says so.

          `retryLabel` is the submit button's own words, so "tap it again"
          names the control rather than describing it.
        */}
        {refusal ? (
          <CheckoutRefusal
            refusal={refusal}
            refusalRef={refusalRef}
            showGate={showGate}
            gateView={gateView}
            retryAction={retryAction}
            failure={failure}
            capacityError={capacityError}
            onBookRemaining={setGuests}
          />
        ) : null}

        {tokenMissing ? <TokenMissingPanel /> : null}
      </div>

      <CheckoutBar
        barRef={barRef}
        summaryLine={summaryLine}
        action={action}
        canSubmit={canSubmit}
        working={working}
        isRequest={isRequest}
        cashAtCounter={cashAtCounter}
        blockers={blockers}
      />
    </form>
  );
}
