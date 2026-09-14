"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { YuvoyError } from "@/lib/api/errors";
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
import { DEFAULT_DIAL_CODE } from "@/components/ui/phone-field";
import {
  ContactFields,
  useContactState,
} from "@/components/auth/contact-fields";
import { useTravellerSession } from "@/lib/auth/use-traveller";
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
 * ## The terms checkbox is gone, and the screener stays
 *
 * The owner said on 14 September that the pop-up had more fields than the
 * three asked for. The acknowledgement checkbox went: the API has no field for
 * accepting it, so it was ceremony this form invented, and the policy is now
 * one line of text above Send. `checkoutRefusal` still refuses a listing with
 * no published terms at all, which is the part that was actually load-bearing.
 *
 * The safety screener stays, and appears only when the LISTING declares it. It
 * is the one input here that exists to stop somebody being taken somewhere
 * dangerous, `POST /reservations` answers `400 screening_required` without it,
 * and "only asks for name, number, email" is a statement about ceremony rather
 * than a decision to drop a safety gate. On a listing with no `safety` the
 * pop-up really is three fields and Send.
 *
 * ## A signed-in traveller is not asked who they are
 *
 * `ContactFields` decides that, and the same block runs in checkout, so the
 * two cannot drift (yuvoy-app#32).
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
  const router = useRouter();
  const { refresh } = useTravellerSession();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(DEFAULT_DIAL_CODE);
  const [email, setEmail] = useState("");
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

  const contact = useContactState(email);

  /*
    The two refusals the API can make about WHO is asking (yuvoy-app#32).

    `400` with `details["contact.name"]` is a profile with no name on record:
    the sentence belongs on the field it concerns, not in a panel below the
    button, which is where the traveller is not looking.

    `401` is a session that ended between opening the sheet and pressing Send.
    `refresh` re-asks the server, which flips `ContactFields` back to both
    fields; without it the form keeps showing "Booking as ..." over a session
    that no longer exists and Send fails identically forever.
  */
  const failure = create.error instanceof YuvoyError ? create.error : null;
  const nameRefusal =
    failure?.status === 400 &&
    typeof failure.details["contact.name"] === "string"
      ? (failure.details["contact.name"] as string)
      : undefined;
  const sessionEnded = failure?.status === 401;

  const refusal = checkoutRefusal(experience);
  const safety = experience.safety;

  /** The number with a country code and nothing else is not a number. */
  const phoneGiven = phone.replace(/\D/g, "").length > 4;

  const blockers: string[] = [];
  /*
    Only the fields the form is still SHOWING. A signed-in traveller has no
    name box and no number box, so demanding either would leave Send
    permanently dead with "still needs your name" under a form that does not
    ask for one. That is the class of defect `pnpm qa` already checks for on
    the checkbox pair.
  */
  if (contact.needsName && !name.trim()) blockers.push("your name");
  if (contact.needsPhone && !phoneGiven) blockers.push("a WhatsApp number");
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
    !contact.loading &&
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
        authenticated: contact.authenticated,
        contact: contact.contactFor({ name, phone, email }),
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
    } catch (error) {
      // Swallowed deliberately: `mutateAsync` rejects AND stores the failure
      // on `create.error`, which is what renders the panel below, so letting
      // it propagate is an unhandled rejection for a visible failure.
      if (error instanceof YuvoyError && error.status === 401) {
        await refresh();
      }
    } finally {
      submitting.current = false;
    }
  }

  if (sentToken !== null) {
    return (
      /*
        CLOSING GOES TO THE FEED, not back to the listing (yuvoy-app#32
        item 3). `onClose` returns to the page underneath, which is the
        experience the traveller has just finished asking about: a dead end,
        and the owner said so. The × , the backdrop and Escape all run this,
        so all three land in the same place as "Back to the feed" below rather
        than one of them being the odd one out.
      */
      <Sheet open onClose={() => router.push("/")} title="Request sent">
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

          {sessionEnded ? (
            <p role="alert" className="text-terra-deep mt-5 text-sm">
              Your sign-in has ended. Enter your name and number to send this.
            </p>
          ) : null}

          <div className="mt-5">
            <ContactFields
              name={name}
              onNameChange={setName}
              phone={phone}
              onPhoneChange={setPhone}
              email={contact.emailValue}
              onEmailChange={setEmail}
              nameError={nameRefusal}
              phoneHint="This is how the operator answers, and how we reach you if the sea changes."
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
            The policy, as a sentence rather than a checkbox (yuvoy-app#32
            item 4). The API has no field for accepting it, so the checkbox was
            an acknowledgement this form invented and then made Send depend on.
            `checkoutRefusal` above still refuses a listing with no published
            terms at all, which is the part that protects anybody.
          */}
          <p className="text-forest/70 mt-6 text-sm">
            If it is called off: {experience.cancellationPolicy}
          </p>

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
