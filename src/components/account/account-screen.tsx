"use client";

import { useState } from "react";
import Link from "@/components/ui/link";
import { useRouter } from "next/navigation";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import { ButtonLink } from "@/components/ui/button";
import { Screen } from "@/components/chrome/screen";
import {
  SignInSteps,
  signInHeading,
  signInSentence,
  useSignInFlow,
} from "@/components/auth/sign-in-form";
import { LegalLinks } from "@/components/site/legal-links";
import { UsageSetting } from "./usage-setting";
import { safeNextPath } from "@/lib/site/next-path";
import { INVITE_ONLY } from "@/lib/site/access";
import { AgeClosed } from "./confirm-age";
import { AccountWaiting, SignedIn } from "./account-signed-in";

/*
  NOT "booking never needs one" while invitations are on (yuvoy-api#195).

  That sentence is the most reassuring true thing this product could say, and
  with the gate on it is simply untrue: booking needs a signed-in number that
  has redeemed a code. Saying it here would send somebody to checkout to find
  out otherwise, on the screen that exists to tell them how signing in works.

  What survives is the rest of it, which is still true and is still the reason
  to sign in at all.
*/
const INVITE_INTRO =
  "Yuvoy is by invitation for now, so booking needs your number and a code. Sign in and every trip on that number is in one place, including ones booked on another phone. No password and no sign-up.";
const OPEN_INTRO =
  "Booking never needs one. Sign in with your number and every trip on it is in one place, including ones booked on another phone. No password and no sign-up.";

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
 * ## The heading changed, and the reassurance moved rather than went
 *
 * It read "There is no account to make", which said the most reassuring true
 * thing about this product in the largest type on the screen. The owner asked
 * for "Sign in" (yuvoy-app#38 item 9), and that is their call: a heading that
 * argues with the reader before it tells them where they are is clever at the
 * cost of being plain.
 *
 * The claim itself is not lost. The first line of the body still opens
 * "Booking never needs one", which is the sentence that matters and is now
 * where somebody reads it rather than where they parse it. Nothing about this
 * appears in checkout either way, which is the part that actually protects
 * against the drop-off.
 */
export function AccountScreen() {
  const { signedIn, signOut, refresh } = useTravellerSession();
  const router = useRouter();
  const flow = useSignInFlow();
  /*
    An under-18 answer to Confirm your age (yuvoy-app#229): the account is
    closed and signed out. Held above the signed-in check, so the sign-out
    does not replace the sentence with the sign-in form.
  */
  const [closed, setClosed] = useState<string | null>(null);

  /*
    Why the sign-in form is showing, when the API ended the session from a
    signed-in row (yuvoy-app#221: "Sign in to download your data."). The row
    that was refused is gone by then, so its sentence is said here.
  */
  const [endedNote, setEndedNote] = useState<string | null>(null);

  function afterSignIn() {
    setEndedNote(null);
    /*
      Back where the Login button was pressed (yuvoy-app#56 item 5).

      Read off `window.location` in the handler rather than with
      `useSearchParams`. The hook would bail this whole page out of static
      rendering unless it sat inside a Suspense boundary, and a boundary
      around the screen empties the prerendered HTML: `/account` is where the
      privacy and terms links live, `e2e/audit-pages.spec.ts` asserts them in the
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

    /*
      THE ROUTER CACHE IS HOLDING THE GATE (yuvoy-api#195).

      With the invite gate on, the page `?next=` names was decided on the
      SERVER for a visitor who was signed out, and the client router may have
      that decision cached from a prefetch (`staleTimes.dynamic`). Replacing
      into it would paint the gate at somebody who has just signed in, and
      `GatedPage` would then notice and ask for it again: a gate for a frame,
      then the page.

      `refresh` invalidates that cache before the navigation, so the server is
      asked once, with the cookie, and the traveller lands on the page they
      wanted. With the switch off there is no gate to cache and this compiles
      out, so nothing changes for anybody.
    */
    if (INVITE_ONLY) router.refresh();
    if (next) router.replace(next);
  }

  if (closed) {
    return (
      <Screen>
        <AgeClosed message={closed} />
      </Screen>
    );
  }

  if (signedIn === undefined) {
    return <AccountWaiting label="Checking this device" />;
  }

  if (signedIn) {
    return (
      <SignedIn
        onSignOut={signOut}
        onUnderAge={(message) => {
          setClosed(message);
          void signOut();
        }}
        onSessionEnded={async (message) => {
          setEndedNote(message);
          await refresh();
        }}
      />
    );
  }

  const heading = signInHeading(flow, "Sign in");
  const sentence = signInSentence(
    flow,
    INVITE_ONLY ? INVITE_INTRO : OPEN_INTRO,
  );

  return (
    <Screen>
      {heading ? (
        <h1 className="font-display tracking-display leading-display text-3xl text-balance">
          {heading}
        </h1>
      ) : null}
      {sentence ? (
        <p className="text-forest/70 text-body mt-3 text-pretty">{sentence}</p>
      ) : null}

      {endedNote && !flow.sent ? (
        <p role="alert" className="text-terra-deep mt-3 text-sm">
          {endedNote}
        </p>
      ) : null}

      <SignInSteps
        flow={flow}
        submitLabel="Show me my trips"
        onSignedIn={afterSignIn}
      />

      {/*
        Saved, signed out (cited in the redesign's before page, 3 Oct 2026).
        Saving works without an account and keeps to this phone, and the only
        way back to those saves was through a signed-in Account.
      */}
      <ButtonLink href="/saved" variant="outline" block className="mt-8">
        Saved on this phone
      </ButtonLink>

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
        The analytics answer, to change at any time, as the question promises
        (yuvoy-app#181). On both branches, for the reason the links below are.
      */}
      <UsageSetting className="mt-10" />

      {/*
        On BOTH branches of this screen (yuvoy-app#15). It was on the signed-in
        one only, and almost nobody is signed in: this product has no account
        to make, so the signed-out form is what a traveller meets here.
      */}
      <LegalLinks className="border-paper-line mt-10 border-t pt-6 text-xs" />
    </Screen>
  );
}
