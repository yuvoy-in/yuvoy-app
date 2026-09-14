"use client";

import { useTravellerSession } from "@/lib/auth/use-traveller";
import { useMyAccount } from "@/lib/auth/use-my-account";
import { Field } from "@/components/ui/field";
import { PhoneField, splitDial } from "@/components/ui/phone-field";
import { Skeleton } from "@/components/states";
import type { ReservationContactInput } from "@/lib/booking/contact";

/**
 * Who is booking, asked once or not at all — yuvoy-app#32.
 *
 * The owner raised it on 13 September: a signed-in traveller was still being
 * asked for their name and number, in the Ask pop-up and again at checkout,
 * on a phone whose number we had already proved by sending it a code. Both
 * forms had the same three inputs written out twice, so this is one block used
 * by both rather than the same fix applied twice and then drifting.
 *
 * ## Three shapes, decided by the profile and not by the session
 *
 *   - **Signed out.** Name and number, as before.
 *   - **Signed in, profile has a name.** Neither field. One line saying who is
 *     booking, with the number masked, and a way to say it is not them.
 *   - **Signed in, profile has NO name.** The name field only. A number that
 *     signed in to look at their trips and skipped the first-sign-in screen
 *     has `name: null`, which is a real and common state, not an edge: asking
 *     for a number we already have would still be wrong, and booking somebody
 *     onto a boat with no name to call out is worse.
 *
 * The number is never editable while signed in. The API ignores
 * `contact.whatsapp` on an authenticated reservation and uses the session's
 * number, so an editable field would be a lie: whatever was typed would be
 * discarded silently.
 */

export interface ContactFieldsProps {
  name: string;
  onNameChange: (value: string) => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  email: string;
  onEmailChange: (value: string) => void;
  /** Shown under the name field, from a `400` naming `contact.name`. */
  nameError?: string;
  /** The number is how the operator answers, so the hint differs per form. */
  phoneHint?: string;
}

/**
 * `+919000003210` becomes `+91 ••••••3210`.
 *
 * Enough for somebody to recognise their own number and not enough to read
 * out. The dial code is kept because "••••••3210" alone does not tell a
 * traveller with two numbers which one they signed in with, which is the whole
 * question this line answers.
 */
export function maskPhone(value: string): string {
  const { code, national } = splitDial(value);
  if (national.length <= 4) return `${code} ${national}`;
  const hidden = "•".repeat(Math.max(national.length - 4, 1));
  return `${code} ${hidden}${national.slice(-4)}`;
}

export function ContactFields({
  name,
  onNameChange,
  phone,
  onPhoneChange,
  email,
  onEmailChange,
  nameError,
  phoneHint,
}: ContactFieldsProps) {
  const { signedIn, signOut } = useTravellerSession();
  const account = useMyAccount(signedIn);

  /*
    Waiting on either read. Not a spinner: this sits between a departure and a
    Send button, and a form that reflows once the profile lands is one somebody
    taps in the wrong place.
  */
  if (signedIn === undefined || (signedIn && account.isPending)) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  /*
    A profile read that failed is treated as signed OUT for this form only.

    Not as an error state. The traveller came here to book, the guest path
    works perfectly, and blocking a booking on a profile lookup would turn a
    convenience into an outage. `401` also lands here, and `useMyAccount`'s own
    failure is what the parent reads to decide whether to send a session.
  */
  const profile = signedIn && account.data ? account.data : null;
  const known = profile?.name?.trim() ? profile : null;

  return (
    <div className="space-y-4">
      {known ? (
        <div>
          <p className="text-forest/80 text-sm">
            Booking as <span className="font-bold">{known.name}</span> (
            {maskPhone(known.phone)})
          </p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-terra-deep tap-target mt-1 text-sm underline underline-offset-4"
          >
            Not you?
          </button>
        </div>
      ) : (
        <Field
          label="Your name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          autoComplete="name"
          error={nameError}
          required
        />
      )}

      {/*
        Hidden for anybody signed in, with or without a profile name. The
        session's number is the number, and the API ignores whatever is sent.
      */}
      {profile ? null : (
        <PhoneField
          label="WhatsApp number"
          value={phone}
          onChange={onPhoneChange}
          hint={phoneHint}
          required
        />
      )}

      <Field
        label="Email (optional)"
        type="email"
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        autoComplete="email"
      />
    </div>
  );
}

/**
 * What the two forms still have to know: which fields they may demand, and
 * what to put in `contact`.
 *
 * Returned from a hook rather than read off the component, because the SEND
 * button's disabled state and the request body both depend on it and neither
 * is inside `ContactFields`.
 */
export function useContactState(email: string) {
  const { signedIn } = useTravellerSession();
  const account = useMyAccount(signedIn);

  const loading =
    signedIn === undefined || (signedIn === true && account.isPending);
  const profile = signedIn && account.data ? account.data : null;
  const hasProfileName = Boolean(profile?.name?.trim());

  return {
    /** Send must be disabled: we do not yet know which fields are required. */
    loading,
    /** Send the call with the session, so the API fills in what it knows. */
    authenticated: Boolean(profile),
    /** The form must still ask for a name. */
    needsName: !hasProfileName,
    /** The form must still ask for a number. */
    needsPhone: !profile,
    /** `email` prefilled from the profile, unless the traveller typed one. */
    emailValue: email || (profile?.email ?? ""),
    /**
     * `contact`, with the fields the API would ignore left OUT rather than
     * sent empty. An empty string is a value: `contact.name: ""` is a 400,
     * where an absent one means "use the profile's".
     */
    contactFor: (typed: {
      name: string;
      phone: string;
      email: string;
    }): ReservationContactInput => ({
      ...(hasProfileName ? {} : { name: typed.name.trim() }),
      ...(profile ? {} : { whatsapp: typed.phone.trim() }),
      ...(typed.email.trim()
        ? { email: typed.email.trim() }
        : profile?.email
          ? { email: profile.email }
          : {}),
    }),
  };
}
