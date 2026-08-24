"use client";

import { useState, useMemo, useId, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCreateReservation } from "@/lib/booking/use-checkout";
import { bookingUrl } from "@/lib/booking/token-store";
import {
  ScreeningFields,
  bandMeetsMinimum,
  type AgeBand,
} from "./screening-fields";
import { describeError } from "@/components/states";
import { YuvoyError } from "@/lib/api/errors";
import { formatMoney } from "@/lib/format/money";
import { cn } from "@/lib/cn";
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
 */
export function CheckoutForm({
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

  const safety = experience.safety;
  const maxParty = slot.maxPartySize ?? experience.maxPartySize ?? 10;
  const isRequest = slot.bookingMode === "request";

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
    return out;
  }, [name, whatsapp, policyAccepted, safety, declaredClear, ageBands, guests]);

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
    const reservation = await create.mutateAsync({
      slotId: slot.id,
      guests,
      contact: {
        name: name.trim(),
        whatsapp: whatsapp.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
      },
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

    // The token goes in the FRAGMENT, immediately, and is never put in a path
    // or a query — this API logs request URIs.
    if (reservation.statusToken) {
      router.replace(bookingUrl(reservation.statusToken));
    }
  }

  const failure = create.error ? describeError(create.error) : null;
  const capacityError =
    create.error instanceof YuvoyError &&
    create.error.code === "capacity_unavailable"
      ? create.error
      : null;

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) void submit();
      }}
    >
      {/* Party size, checked against the WHOLE party rather than one seat. */}
      <div>
        <span className="label text-forest/75">How many of you</span>
        <div className="mt-3 flex items-center gap-4">
          <button
            type="button"
            aria-label="One fewer guest"
            disabled={guests <= 1}
            onClick={() => setGuests((g) => Math.max(1, g - 1))}
            className="rounded-edge border-cream-line size-12 border text-lg disabled:opacity-40"
          >
            −
          </button>
          <span
            className="w-8 text-center text-lg font-bold"
            aria-live="polite"
          >
            {guests}
          </span>
          <button
            type="button"
            aria-label="One more guest"
            disabled={guests >= maxParty}
            onClick={() => setGuests((g) => Math.min(maxParty, g + 1))}
            className="rounded-edge border-cream-line size-12 border text-lg disabled:opacity-40"
          >
            +
          </button>
          <span className="text-forest/60 text-xs">Up to {maxParty}</span>
        </div>
      </div>

      {/* Name and WhatsApp. Nothing else is required, on purpose. */}
      <div className="space-y-4">
        <Field
          label="Your name"
          value={name}
          onChange={setName}
          autoComplete="name"
          required
        />
        <Field
          label="WhatsApp number"
          value={whatsapp}
          onChange={setWhatsapp}
          type="tel"
          autoComplete="tel"
          hint="This is how we send your booking and reach you if the sea changes."
          required
        />
        <Field
          label="Email (optional)"
          value={email}
          onChange={setEmail}
          type="email"
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

      {tooYoung && safety?.minAge ? (
        <p role="alert" className="text-terra-deep text-sm">
          This operator takes people aged {safety.minAge} and over. We check
          against the bottom of each range, so a range that starts below{" "}
          {safety.minAge} cannot be accepted.
        </p>
      ) : null}

      {/* Price and policy, frozen at this moment. */}
      <div className="rounded-edge border-cream-line bg-cream-deep border p-5">
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
        <p className="text-forest/60 mt-1.5 text-xs">
          All in. Nothing is added after this screen.
        </p>

        {experience.cancellationPolicy ? (
          <label className="mt-4 flex cursor-pointer gap-3 text-sm">
            <input
              type="checkbox"
              checked={policyAccepted}
              onChange={(e) => setPolicyAccepted(e.target.checked)}
              className="accent-terra-deep mt-0.5 shrink-0"
              aria-describedby="policy-text"
            />
            <span id="policy-text" className="text-forest/80">
              I have read what happens if it is called off:{" "}
              {experience.cancellationPolicy}
            </span>
          </label>
        ) : null}

        {/* Separate, and unticked. Consent to be marketed to is not consent
            to be transported. */}
        <label className="mt-3 flex cursor-pointer gap-3 text-sm">
          <input
            type="checkbox"
            checked={marketing}
            onChange={(e) => setMarketing(e.target.checked)}
            className="accent-terra-deep mt-0.5 shrink-0"
          />
          <span className="text-forest/70">
            Send me the occasional thing worth doing. Optional.
          </span>
        </label>
      </div>

      {failure ? (
        <div
          role="alert"
          className="rounded-edge border-terra-deep border-l-2 p-4"
        >
          <p className="text-sm font-bold">{failure.title}</p>
          <p className="text-forest/70 mt-1.5 text-sm">{failure.body}</p>
          {/* capacity_unavailable carries what is left — offer it. */}
          {capacityError?.remaining ? (
            <button
              type="button"
              onClick={() => setGuests(capacityError.remaining!)}
              className="label text-terra-deep tap-target mt-2 font-bold underline underline-offset-2"
            >
              Book {capacityError.remaining} instead
            </button>
          ) : null}
          {failure.requestId ? (
            <p className="text-forest/40 mt-3 font-mono text-[10px]">
              {failure.requestId}
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={!canSubmit}
          className={cn(
            "rounded-edge label h-13 w-full font-bold transition-transform",
            "bg-forest text-cream active:scale-[0.99]",
            "disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          {create.isPending
            ? "Holding your seats…"
            : isRequest
              ? "Ask the operator"
              : "Hold these seats"}
        </button>

        <p className="text-forest/60 mt-3 text-center text-xs">
          {isRequest
            ? "You pay only once the operator says yes."
            : "We hold your seats for 10 minutes while you pay."}
        </p>

        {blockers.length > 0 ? (
          <p className="text-forest/60 mt-2 text-center text-xs">
            Still needed: {blockers.join(", ")}.
          </p>
        ) : null}
      </div>
    </form>
  );
}

/**
 * A labelled field.
 *
 * The hint sits OUTSIDE the <label> and is bound with aria-describedby. Inside
 * it, the hint becomes part of the accessible name — a screen reader would
 * announce "WhatsApp number This is how we send your booking and reach you if
 * the sea changes" as the field's name every time it gained focus.
 */
function Field({
  label,
  value,
  onChange,
  type = "text",
  hint,
  required,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label htmlFor={id} className="label text-forest/75">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        autoComplete={autoComplete}
        aria-describedby={hintId}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-edge border-cream-line bg-cream-deep focus:border-terra-deep mt-2 h-12 w-full border px-3.5 text-base outline-none"
      />
      {hint ? (
        <span id={hintId} className="text-forest/60 mt-1.5 block text-xs">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
