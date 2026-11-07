"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { useCreateReservation } from "@/lib/booking/use-checkout";
import { bookingUrl } from "@/lib/booking/token-store";
import { markArrival } from "@/lib/booking/arrival";
import { finishInCash } from "@/lib/booking/cash-booking";
import { readAttribution } from "@/lib/booking/attribution";
import {
  clearTrigoCheckout,
  dropTrigoTotal,
  trigoCheckoutFor,
} from "@/lib/trigo/checkout-prefill";
import { readCardChatAgain } from "@/lib/trigo/actions";
import type { AgeBand } from "./screening-fields";
import { toBookingAnswers, type AnswerDraft } from "@/lib/booking/answers";
import { YuvoyError } from "@/lib/api/errors";
import type { useContactState } from "@/components/auth/contact-fields";
import type { useTravellerSession } from "@/lib/auth/use-traveller";
import { INVITE_ONLY } from "@/lib/site/access";
import type { components } from "@/lib/api/schema.gen";

type Experience = components["schemas"]["Experience"];
type Slot = components["schemas"]["Slot"];
type Money = components["schemas"]["Money"];
type Session = ReturnType<typeof useTravellerSession>;

/** What the booking tap reads from the form, as it is on this render. */
export interface CheckoutSubmitInput {
  create: ReturnType<typeof useCreateReservation>;
  signedIn: Session["signedIn"];
  refresh: Session["refresh"];
  setGateOpen: (open: boolean) => void;
  setTokenMissing: (missing: boolean) => void;
  setFinishing: (finishing: boolean) => void;
  onRefused?: (message: string) => void;
  experience: Experience;
  slot: Slot;
  trigoCardId: string | null;
  guests: number;
  total: Money | null;
  contact: ReturnType<typeof useContactState>;
  name: string;
  whatsapp: string;
  email: string;
  marketing: boolean;
  safety: Experience["safety"];
  declaredClear: boolean | undefined;
  ageBands: (AgeBand | undefined)[];
  enforceAnswers: boolean;
  questions: NonNullable<Experience["questions"]>;
  answers: AnswerDraft;
}

/**
 * The booking tap. `submit` refuses, guards and reports; `hold` makes the
 * reservation and finishes it. Both are plain functions, made again on
 * every render, so a tap reads the form as it stands on that render.
 */
export function useCheckoutSubmit({
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
}: CheckoutSubmitInput) {
  const router = useRouter();
  const queryClient = useQueryClient();

  /**
   * A synchronous guard against the fast double-tap.
   *
   * `create.isPending` is React state, so it is not true until a re-render,
   * and two taps 40ms apart both read the old value. On the first tap the
   * mutation succeeds and CLEARS the idempotency key (so the next checkout
   * gets a fresh one), which means the second tap mints a NEW key and books
   * a second time. A ref updates in the same tick and closes that window.
   *
   * The disabled attribute stays too: it is what a person sees, this is what
   * the machine obeys.
   */
  const submitting = useRef(false);

  async function submit() {
    if (submitting.current) return;
    /*
      Refused here rather than sent, and only with the switch on. See
      `gateOpen` in the form: signed OUT is the one state the server's decision
      cannot survive, because it changes on this device after the HTML was
      written. `signedIn === undefined` is not yet known and is never a
      refusal, so it falls through to the API, which is the authority anyway.
    */
    if (INVITE_ONLY && signedIn === false) {
      setGateOpen(true);
      return;
    }
    setGateOpen(false);
    submitting.current = true;
    try {
      await hold();
    } catch (error) {
      // Swallowed DELIBERATELY, and only here. `mutateAsync` rejects as well
      // as storing the failure on `create.error`, which is what renders the
      // message below, so letting it propagate produces an unhandled
      // rejection for a failure the traveller can already see. Nothing is lost:
      // the error object is still on the mutation.
      /*
        A REFUSAL THAT MEANS "THE CALENDAR IS OUT OF DATE" - yuvoy-app#62
        item 7.

        `capacity_unavailable` (the seats went while they were filling this
        in) and `price_moved` (the departure is not the price the calendar
        showed) are both statements about the availability this page was drawn
        from, not about the form. So they are reported UPWARD: the screen
        refetches the month and puts the API's own sentence over the calendar,
        which is where somebody looks next. The panel below still renders it
        from `create.error`: one event, two audiences.

        Reported HERE, once per refusal, because a refusal is an event and this
        is where it happens. It used to be an effect watching `create.error`
        and `onRefused`, and the screen above hands down a new `onRefused` on
        every render: the refetch it started re-rendered that screen, which
        re-ran the effect, which refetched. Availability was read back to back
        for as long as the form stood refused (6 Oct 2026, 91 reads in one
        test's wait).
      */
      if (
        error instanceof YuvoyError &&
        (error.code === "capacity_unavailable" || error.code === "price_moved")
      ) {
        onRefused?.(error.message);
      }
      // A Trigo card's total that moved is not sent again (yuvoy-app#223).
      if (error instanceof YuvoyError && error.code === "price_moved") {
        dropTrigoTotal(experience.slug);
      }
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
      mount, and part of the body, so it is inside the idempotency
      fingerprint, as the contract requires: "a retry that changes it is
      refused rather than silently re-attributing a booking that already
      exists". Absent when the visit made no claim; a checkout must not fail
      over a marketing field.
    */
    /*
      From a Trigo book card (yuvoy-app#223 part 2): attribution trigo with
      the card's id, and, while the departure and party are still the card's,
      the card's key and the total it was checked at. Only on the checkout
      the card opened (its `?card=`). Null otherwise.
    */
    const trigo = trigoCheckoutFor(experience.slug, trigoCardId, {
      slotId: slot.id,
      guests,
    });
    const attribution = trigo?.attribution ?? readAttribution();

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

        `expectTotalPaise`, the contract's name, and a DIRECT property on
        purpose. From 15 Sep this sent `expectedTotalMinor`, a name the API
        does not read: its binder drops unknown keys, so no total was ever
        checked and `price_moved` could not happen. It went in through a
        conditional spread, which TypeScript does not check for unknown keys.
        Written like this, a misspelt key is a compile error. `undefined`
        leaves it out of the JSON and out of the idempotency fingerprint.
      */
      expectTotalPaise: trigo?.expectTotalPaise ?? total?.amountMinor,
      authenticated: contact.authenticated,
      ...(trigo?.idempotencyKey
        ? { idempotencyKey: trigo.idempotencyKey }
        : {}),
      contact: {
        ...contact.contactFor({ name, phone: whatsapp, email }),
        /*
          THE MARKETING TICK, SENT (yuvoy-app#116 item 1). It was kept in
          state and never left the browser, so a traveller who ticked it was
          recorded as never asked: the safe direction, and still a promise
          the box did not keep.

          Always a boolean, never left out: the box is on this form every
          time, so the question WAS asked, and the contract records absent
          ("never asked") and `false` ("asked and declined") differently. It
          is part of the body, so changing the tick mints a new idempotency
          key, which is right: it is a different answer.
        */
        marketingConsent: marketing,
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
    if (trigo) {
      clearTrigoCheckout(experience.slug);
      // Back in the chat, the card reads Booked and offers no checkout.
      if (trigoCardId) readCardChatAgain(queryClient, trigoCardId);
    }

    if (!reservation.statusToken) {
      // Booked, and no way in. Say so, with the way in that does exist.
      setTokenMissing(true);
      return;
    }

    /*
      ONE TAP (owner ruling, 3 Oct 2026). A live hold is finished in cash here,
      in the tap that took it, because cash at the counter is how every booking
      finishes today and the hold step was a second tap that did nothing else.
      A request (`pending_request`) waits for the operator as it always did.
      If cash is not offered, or a call fails, the traveller still lands on
      the booking page with the hold alive, and it offers every way to finish,
      cash first (`PayButton`). Nothing here is shown as an error.
    */
    if (reservation.state === "active") {
      setFinishing(true);
      await finishInCash(reservation.reservationId, reservation.statusToken);
    }

    // The token goes in the FRAGMENT, immediately, and is never put in a path
    // or a query: this API logs request URIs.
    // And the page it opens is told it is being arrived at (T10 A), once.
    markArrival(reservation.statusToken);
    router.replace(bookingUrl(reservation.statusToken));
  }

  return submit;
}
