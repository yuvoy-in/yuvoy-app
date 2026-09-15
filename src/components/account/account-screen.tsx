"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { YuvoyError } from "@/lib/api/errors";
import {
  useTravellerSession,
  useRequestSignInCode,
  useVerifySignInCode,
} from "@/lib/auth/use-traveller";
import { Field } from "@/components/ui/field";
import { PhoneField, DEFAULT_DIAL_CODE } from "@/components/ui/phone-field";
import { Button, ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Screen } from "@/components/chrome/screen";
import { LegalLinks } from "@/components/site/legal-links";
import { safeNextPath } from "@/lib/site/next-path";
import { Skeleton, LoadingState } from "@/components/states";

/**
 * Signing in — T5, rebuilt on the real sign-in (yuvoy-app#34, yuvoy-api#172).
 *
 * ## What was wrong, in the owner's words: "That code did not work"
 *
 * This screen ran on booking RECOVERY, because until 12 September that was the
 * only OTP there was. Two consequences, both of which the owner hit:
 *
 *   - Recovery refuses a correct code for a number that has never booked. It
 *     is a recovery endpoint and there is nothing to recover. So a first-time
 *     traveller typed the right code and was told it was wrong.
 *   - Every successful recovery revokes the booking links already saved on the
 *     phone. So signing in to SEE your trips took away the ones you had.
 *
 * `/me/sign-in/*` fixes both: any number, 30 days, and it revokes nothing.
 * Recovery stays at `/trips/recover`, where rotating the link is the point.
 *
 * There is still no account to create, and this screen still says so as its
 * heading. A login prompt in front of a stranger with a phone is the largest
 * drop-off available in this product, and none of it appears in checkout.
 */
export function AccountScreen() {
  const { signedIn, signIn, signOut } = useTravellerSession();
  const router = useRouter();
  const [phone, setPhone] = useState(DEFAULT_DIAL_CODE);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [resent, setResent] = useState(false);

  const request = useRequestSignInCode();
  const verify = useVerifySignInCode();

  const phoneGiven = phone.replace(/\D/g, "").length > 4;

  async function askForCode(again = false) {
    verify.reset();
    setCode("");
    const answer = await request.mutateAsync(phone).catch(() => null);
    if (!answer) return;
    setSent(true);
    setDevCode(answer.devCode);
    setResent(again);
  }

  async function submitCode() {
    /*
      The answer carries no token any more, only `{ signedIn: true }`. The
      session is already in an HttpOnly cookie by the time this resolves,
      because `POST /api/session` set it server-side (yuvoy-app#57).
    */
    const answer = await verify.mutateAsync({ phone, code }).catch(() => null);
    if (answer?.signedIn) {
      await signIn();
      setSent(false);
      setCode("");

      /*
        Back where the Login button was pressed (yuvoy-app#56 item 5).

        Read off `window.location` in the handler rather than with
        `useSearchParams`. The hook would bail this whole page out of static
        rendering unless it sat inside a Suspense boundary, and a boundary
        around the screen empties the prerendered HTML: `/account` is where the
        privacy and terms links live, `e2e/audit.spec.ts` asserts them in the
        SERVER-RENDERED source, and it caught exactly that. The value is only
        needed at the instant sign-in succeeds, which is browser-only anyway.

        `safeNextPath` is an open-redirect guard, not a formality: `next`
        arrives from the query string, so a link to
        `/account?next=https://evil.example/login` would otherwise hand a
        traveller who has just signed in on OUR domain to somebody else's page,
        in the same tab, already trusting what they see. Anything that is not a
        path on this origin answers null and they stay here, signed in, which
        is the issue's own instruction.
      */
      const next = safeNextPath(
        new URLSearchParams(window.location.search).get("next"),
      );
      if (next) router.replace(next);
    }
  }

  if (signedIn === undefined) {
    return (
      <Screen>
        <LoadingState label="Checking this device">
          <Skeleton className="h-32 w-full" />
        </LoadingState>
        {/*
          Here too, because this is the branch that PRERENDERS — `/account` is
          a static route and this shell is what the HTML contains. A policy
          link that only exists after hydration is one a crawler, a reader with
          JavaScript off, and anybody reading the source cannot find.
        */}
        <LegalLinks className="mt-10 text-xs" />
      </Screen>
    );
  }

  if (signedIn) return <SignedIn onSignOut={signOut} />;

  const failure = signInFailure(verify.error ?? request.error, sent);

  return (
    <Screen>
      <h1 className="font-display tracking-display text-3xl leading-tight">
        {sent ? "Check your WhatsApp" : "There is no account to make"}
      </h1>
      <p className="text-forest/70 mt-3 text-sm">
        {sent
          ? `We sent a six-digit code to ${phone}. It is good for a few minutes.`
          : "Booking never needs one. Sign in with your number and every trip on it is in one place, including ones booked on another phone. No password and no sign-up."}
      </p>

      <form
        className="mt-8 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (sent) void submitCode();
          else void askForCode();
        }}
      >
        {sent ? (
          <Field
            label="The code we sent"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="font-mono"
            error={failure?.field === "code" ? failure.body : undefined}
            hint={
              devCode ? `Development build: the code is ${devCode}.` : undefined
            }
            autoFocus
            required
          />
        ) : (
          <PhoneField
            label="Your WhatsApp number"
            value={phone}
            onChange={setPhone}
            error={failure?.field === "phone" ? failure.body : undefined}
            hint="The number you book with. Any number works, whether or not it has booked before."
            required
          />
        )}

        <Button
          type="submit"
          size="lg"
          block
          disabled={
            request.isPending ||
            verify.isPending ||
            (sent ? code.trim().length === 0 : !phoneGiven)
          }
        >
          {request.isPending
            ? "Sending a code…"
            : verify.isPending
              ? "Signing you in…"
              : sent
                ? "Show me my trips"
                : "Send me a code"}
        </Button>
      </form>

      {/*
        THE TWO WAYS OUT, as buttons rather than small print — yuvoy-app#34.

        "The owner took a while to find both." They were two underlined words
        inside a sentence of 12px grey text, and the number field was simply
        disabled once a code had been sent, so a wrong number had no visible
        way back at all.
      */}
      {sent ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={request.isPending}
            onClick={() => void askForCode(true)}
          >
            {request.isPending ? "Sending…" : "Send another code"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setSent(false);
              setCode("");
              setDevCode(undefined);
              setResent(false);
              request.reset();
              verify.reset();
            }}
          >
            Change number
          </Button>
        </div>
      ) : null}

      {resent && !failure ? (
        <p role="status" className="text-forest/70 mt-4 text-xs">
          A new code is on its way. The older one stops working.
        </p>
      ) : null}

      {/*
        The failure, said as a product rather than a stub. `signInFailure` is
        what turns a code into a sentence; a message attached to the FIELD it
        concerns is rendered on the field instead of here, so it is beside the
        thing to change rather than below the button.
      */}
      {failure && !failure.field ? (
        <Panel role="alert" className="mt-6">
          <p className="text-sm font-bold">{failure.title}</p>
          <p className="text-forest/70 mt-1.5 text-sm">{failure.body}</p>
          {failure.action ? <div className="mt-4">{failure.action}</div> : null}
        </Panel>
      ) : null}

      <p className="text-forest/70 mt-8 text-xs">
        Lost the link to a booking?{" "}
        <Link
          href="/trips/recover"
          className="text-terra-deep tap-target underline"
        >
          Get a new one sent
        </Link>
        .
      </p>

      {/*
        On BOTH branches of this screen — yuvoy-app#15. It was on the signed-in
        one only, and almost nobody is signed in: this product has no account
        to make, so the signed-out form is what a traveller meets here.
      */}
      <LegalLinks className="border-cream-line mt-10 border-t pt-6 text-xs" />
    </Screen>
  );
}

/**
 * What went wrong, as something a person can act on.
 *
 * The owner's words about what was here: "just basic AI generated, make it
 * proper. Say what happened, what to do next and where, with the field it
 * concerns."
 *
 * So each branch answers three things — what happened, what to do, and which
 * field to do it in — and `field` is what puts the sentence beside the input
 * rather than in a panel below the button.
 *
 * The generic `describeError` is deliberately not used here. It is written for
 * a booking that may have taken money, and its vocabulary ("this link no
 * longer opens anything") is wrong for somebody who has typed six digits.
 */
function signInFailure(
  error: unknown,
  sent: boolean,
): {
  title: string;
  body: string;
  /** Renders on that field instead of in a panel. */
  field?: "phone" | "code";
  action?: React.ReactNode;
} | null {
  if (!error) return null;

  const code = error instanceof YuvoyError ? error.code : null;
  const status = error instanceof YuvoyError ? error.status : null;

  if (status === 429) {
    return {
      title: "Too many tries",
      body: "We have stopped sending codes to this number for a few minutes. Nothing is wrong with your account. Wait a moment and ask for another.",
    };
  }

  if (status === 401) {
    /*
      "Wrong, expired, used and over-attempted codes all answer 401 with one
      message." So this cannot say WHICH, and must not guess — but it can say
      the three things that are true of all four, and offer the way out.
    */
    return {
      title: "That code did not work",
      body: "It may be wrong, it may have expired, or it may already have been used. Ask for a new one and try again.",
      field: "code",
    };
  }

  if (status === 400 || code === "invalid_input") {
    return sent
      ? {
          title: "That does not look like the code",
          body: "It is six digits, from the message we sent.",
          field: "code",
        }
      : {
          title: "That number did not go through",
          body: "Check the country code and the digits. An Indian mobile is ten digits after +91.",
          field: "phone",
        };
  }

  /*
    Everything else: the network, or us. Not the traveller's fault and not
    their problem to diagnose, so it says so and offers the one thing that
    still works with no session at all.
  */
  return {
    title: "We could not reach us",
    body: "That is our side or the island signal, not your number. Try again in a moment.",
    action: (
      <ButtonLink href="/trips" variant="outline" size="sm">
        Go to my trips
      </ButtonLink>
    ),
  };
}

/** Signed in. The trips themselves live on the Trips tab now — see #34. */
function SignedIn({ onSignOut }: { onSignOut: () => Promise<void> }) {
  return (
    <Screen>
      <h1 className="font-display tracking-display text-3xl leading-tight">
        You are signed in
      </h1>
      {/*
        The list moved to Trips — yuvoy-app#34.

        This screen used to render every trip on the number, beside a Trips tab
        rendering every trip on the device. Two lists of overlapping bookings,
        in two places, with different cards. They are one list now, on the tab
        whose name says so, and this screen is what it always claimed to be:
        the account.
      */}
      <p className="text-forest/70 mt-3 text-sm">
        Every trip on your number is under Trips, including ones booked on
        another phone.
      </p>

      <ButtonLink href="/trips" size="lg" className="mt-6">
        Go to my trips
      </ButtonLink>

      <Button
        variant="outline"
        size="sm"
        onClick={() => void onSignOut()}
        className="mt-10"
      >
        Sign out on this device
      </Button>

      {/*
        SAYS WHAT SIGNING OUT NOW DOES, BECAUSE IT CHANGED (yuvoy-app#60).

        This used to read "It leaves the bookings saved here alone, and they
        stay under Trips", which was true and is now the opposite of true: sign
        out clears every booking this phone has saved. That is deliberate, a
        status token both opens a booking and can cancel it, but it is also the
        kind of thing somebody must be told BEFORE they tap rather than
        discover afterwards, and the way back is a sentence long.
      */}
      <p className="text-forest/70 mt-4 text-xs">
        This signs out this device only, and clears the bookings saved on it.
        Nothing is cancelled: signing in again with the same number brings every
        trip back.
      </p>

      {/*
        The standing place for the policy — yuvoy-app#15. The consent banner
        carries it at the moment of asking and then never appears again; this
        is where somebody comes looking for it a week later.
      */}
      <LegalLinks className="border-cream-line mt-10 border-t pt-6 text-xs" />
    </Screen>
  );
}
