"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useCreateReservation } from "@/lib/booking/use-checkout";
import { bookingUrl } from "@/lib/booking/token-store";
import { readAttribution } from "@/lib/booking/attribution";
import { checkoutRefusal } from "@/lib/booking/checkout-readiness";
import {
  ScreeningFields,
  bandMeetsMinimum,
  type AgeBand,
} from "@/components/checkout/screening-fields";
import { describeError, FailurePanel } from "@/components/states";
import { Sheet } from "@/components/ui/sheet";
import { Field } from "@/components/ui/field";
import { PhoneField, DEFAULT_DIAL_CODE } from "@/components/ui/phone-field";
import { Button, ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { CheckIcon } from "@/components/ui/icons";
import type { components } from "@/lib/api/schema.gen";

type Experience = components["schemas"]["Experience"];
type Slot = components["schemas"]["Slot"];

/**
 * Asking the operator, on the listing — yuvoy-app#32.
 *
 * "**Ask the operator** opens a pop-up on the listing, not a separate checkout
 * page. People and departure are already chosen, so it only asks for name,
 * WhatsApp number, email."
 *
 * A request charges nothing and holds nothing until the operator says yes, so
 * a whole checkout page for three fields was a screen between a traveller and
 * a question they had already decided to ask. Allotment mode still goes to
 * `/e/{slug}/book`: that one takes money, and money gets a page.
 *
 * ## Two fields the issue does not list, and why they are here anyway
 *
 * Both appear only when the LISTING carries them, so for the listing the owner
 * walked this really is three fields and nothing else.
 *
 *   - **The safety screener.** A request-mode listing may declare `safety`
 *     with a health screener and a minimum age. It is the one input on this
 *     flow that exists to stop somebody being taken somewhere dangerous, and
 *     "only asks for name, number, email" is a statement about ceremony rather
 *     than a decision to drop a safety gate. Dropping it silently is not mine
 *     to make.
 *   - **The cancellation terms.** The product refuses to take any booking
 *     without published terms (`checkoutRefusal`), and the acknowledgement is
 *     the pair to that refusal. Say so and I will take it out of the pop-up.
 *
 * ## The success screen is the issue's, exactly
 *
 * "Request sent", with **Back going to the home reels feed, not to the
 * listing**, and a button to Trips where the request now appears. Both are in
 * here rather than left to the page behind: the sheet is what the traveller is
 * looking at, and closing it onto the listing they just asked about is the
 * dead end the issue names.
 */
export function AskSheet({
  experience,
  slot,
  guests,
  onClose,
}: {
  experience: Experience;
  slot: Slot;
  guests: number;
  onClose: () => void;
}) {
  const create = useCreateReservation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(DEFAULT_DIAL_CODE);
  const [email, setEmail] = useState("");
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [declaredClear, setDeclaredClear] = useState<boolean | undefined>();
  const [ageBands, setAgeBands] = useState<(AgeBand | undefined)[]>([]);
  const [sentToken, setSentToken] = useState<string | null>(null);

  /*
    The same guard the checkout form carries, and for the same reason: React
    state is not committed synchronously, so two taps 40ms apart both read the
    old value — and the first tap CLEARS the idempotency key on success, so the
    second mints a fresh one and asks twice. A ref updates in the same tick.
  */
  const submitting = useRef(false);

  const refusal = checkoutRefusal(experience);
  const safety = experience.safety;

  /** The number with a country code and nothing else is not a number. */
  const phoneGiven = phone.replace(/\D/g, "").length > 4;

  const blockers: string[] = [];
  if (!name.trim()) blockers.push("your name");
  if (!phoneGiven) blockers.push("a WhatsApp number");
  if (!policyAccepted) blockers.push("the cancellation terms");
  // Omitted is not false. The form must not let an unanswered screener past.
  if (safety?.screener && declaredClear === undefined) {
    blockers.push("the health check");
  }
  if (safety?.minAge) {
    const filled = ageBands.slice(0, guests).filter(Boolean).length;
    if (filled < guests) blockers.push("an age range for everyone");
  }

  const declaredCondition = declaredClear === false;
  const tooYoung =
    safety?.minAge != null &&
    ageBands
      .slice(0, guests)
      .some((b) => b && !bandMeetsMinimum(b, safety.minAge!));

  const canSend =
    blockers.length === 0 &&
    !declaredCondition &&
    !tooYoung &&
    !create.isPending &&
    !create.isSuccess;

  async function send() {
    if (submitting.current) return;
    submitting.current = true;
    try {
      const attribution = readAttribution();
      const reservation = await create.mutateAsync({
        slotId: slot.id,
        guests,
        contact: {
          name: name.trim(),
          whatsapp: phone.trim(),
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
      });
      /*
        The token is kept so the success screen can offer the request itself.
        An empty string rather than null when the server sends none: the ask
        still went through, and the traveller is told where it lives instead of
        being handed a dead link. `useCreateReservation` has already written
        the token to the device store, so Trips finds it either way.
      */
      setSentToken(reservation.statusToken ?? "");
    } catch {
      // Swallowed deliberately: `mutateAsync` rejects AND stores the failure
      // on `create.error`, which is what renders the panel below, so letting
      // it propagate is an unhandled rejection for a visible failure.
    } finally {
      submitting.current = false;
    }
  }

  if (sentToken !== null) {
    return (
      <Sheet open onClose={onClose} title="Request sent">
        {/*
          The sheet's own header already says "Request sent". A second heading
          under it said the same words twice — visually a stutter, and to a
          screen reader two headings with one name inside one dialog.
        */}
        <div className="text-center">
          <span
            aria-hidden="true"
            className="bg-forest text-cream mx-auto inline-flex size-12 items-center justify-center rounded-full"
          >
            <CheckIcon className="size-6" />
          </span>
          <p className="text-forest/70 mx-auto mt-4 max-w-sm text-sm">
            {experience.operator.name} answers this one by hand, so it is a
            person reading it. Nothing has been charged and no seat is held
            until they say yes. It is in your trips either way.
          </p>
        </div>

        <div className="mt-6 space-y-3">
          {sentToken ? (
            <ButtonLink href={bookingUrl(sentToken)} size="lg" block>
              See this request
            </ButtonLink>
          ) : null}
          <ButtonLink
            href="/trips"
            size="lg"
            block
            variant={sentToken ? "outline" : undefined}
          >
            Go to my trips
          </ButtonLink>
          {/*
            BACK GOES TO THE FEED, not to the listing — the issue is explicit.
            Somebody who has just asked about this experience has finished with
            its page, and closing the sheet onto it is a dead end.
          */}
          <Link
            href="/"
            className="text-forest/70 hover:text-forest ease-interaction block py-2 text-center text-sm underline underline-offset-4 transition-colors duration-200"
          >
            Back to the feed
          </Link>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Ask the operator"
      footer={
        <>
          <Button
            size="lg"
            block
            disabled={!canSend || Boolean(refusal)}
            onClick={() => void send()}
          >
            {create.isPending ? "Sending…" : "Send the request"}
          </Button>
          {blockers.length > 0 ? (
            <p className="text-forest/70 mt-2.5 text-center text-xs">
              Still needs {blockers.join(", ")}.
            </p>
          ) : null}
        </>
      }
    >
      {refusal ? (
        <Panel>
          <p className="text-sm font-bold">{refusal.title}</p>
          <p className="text-forest/70 mt-1.5 text-sm">{refusal.body}</p>
        </Panel>
      ) : (
        <>
          {/*
            What they are asking about, restated. The sheet covers the page, so
            without this a traveller is filling in a form with no reminder of
            which departure they picked.
          */}
          <p className="text-forest/70 text-sm">
            {experience.title} · {slot.localDate} at{" "}
            {slot.localStartTime.slice(0, 5)} ·{" "}
            {guests === 1 ? "1 person" : `${guests} people`}
          </p>

          <div className="mt-5 space-y-4">
            <Field
              label="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
            <PhoneField
              label="WhatsApp number"
              value={phone}
              onChange={setPhone}
              hint="This is how the operator answers, and how we reach you if the sea changes."
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
            <div className="mt-6">
              <ScreeningFields
                safety={safety}
                guests={guests}
                declaredClear={declaredClear}
                onDeclaredClearChange={setDeclaredClear}
                ageBands={ageBands}
                onAgeBandChange={(i, band) =>
                  setAgeBands((prev) => {
                    const next = [...prev];
                    next[i] = band;
                    return next;
                  })
                }
              />
            </div>
          ) : null}

          {/*
            Unconditional, because its blocker is. The pair being
            conditional-and-unconditional is the defect `pnpm qa` checks for:
            a form asking for a checkbox that is not on the page has a
            permanently dead button. `checkoutRefusal` above is what handles a
            listing with no terms at all.
          */}
          <label className="mt-6 flex cursor-pointer gap-3 text-sm">
            <input
              type="checkbox"
              checked={policyAccepted}
              onChange={(e) => setPolicyAccepted(e.target.checked)}
              className="accent-terra-deep mt-0.5 size-4 shrink-0"
              aria-describedby="ask-policy"
            />
            <span id="ask-policy" className="text-forest/80">
              I have read what happens if it is called off:{" "}
              {experience.cancellationPolicy}
            </span>
          </label>

          {create.error ? (
            <FailurePanel
              failure={describeError(create.error)}
              className="mt-5"
            />
          ) : null}
        </>
      )}
    </Sheet>
  );
}
