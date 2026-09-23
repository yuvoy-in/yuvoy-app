"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import { Button, ButtonLink } from "@/components/ui/button";
import { Screen } from "@/components/chrome/screen";
import { SignInSteps, useSignInFlow } from "@/components/auth/sign-in-form";
import { LegalLinks } from "@/components/site/legal-links";
import { safeNextPath } from "@/lib/site/next-path";
import { Skeleton, LoadingState } from "@/components/states";
import { useMyAccount, type TravellerAccount } from "@/lib/auth/use-my-account";
import { civilInZone, monthName } from "@/lib/format/date";
import { HelpSection } from "@/components/support/help-section";
import { EditProfileSheet } from "./edit-profile-sheet";
import { FirstSignIn } from "./first-sign-in";
import { InviteCodeForm } from "@/components/auth/invite-gate";
import { Panel } from "@/components/ui/panel";
import { INVITE_ONLY, standingOfAccount } from "@/lib/site/access";

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
  const { signedIn, signOut } = useTravellerSession();
  const router = useRouter();
  const flow = useSignInFlow();

  function afterSignIn() {
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

  if (signedIn === undefined) {
    return (
      <Screen>
        <LoadingState label="Checking this device">
          <Skeleton className="h-32 w-full" />
        </LoadingState>
        {/*
          Here too, because this is the branch that PRERENDERS: `/account` is
          a static route and this shell is what the HTML contains. A policy
          link that only exists after hydration is one a crawler, a reader with
          JavaScript off, and anybody reading the source cannot find.
        */}
        <LegalLinks className="mt-10 text-xs" />
      </Screen>
    );
  }

  if (signedIn) return <SignedIn onSignOut={signOut} />;

  return (
    <Screen>
      <h1 className="font-display tracking-display text-3xl leading-tight">
        {flow.sent ? "Check your WhatsApp" : "Sign in"}
      </h1>
      <p className="text-forest/70 mt-3 text-sm">
        {flow.sent
          ? `We sent a six-digit code to ${flow.phone}. It is good for a few minutes.`
          : INVITE_ONLY
            ? /*
                NOT "booking never needs one" (yuvoy-api#195).

                That sentence is the most reassuring true thing this product
                could say, and with the gate on it is simply untrue: booking
                needs a signed-in number that has redeemed a code. Saying it
                here would send somebody to checkout to find out otherwise,
                on the screen that exists to tell them how signing in works.

                What survives is the rest of it, which is still true and is
                still the reason to sign in at all.
              */
              "Yuvoy is by invitation for now, so booking needs your number and a code. Sign in and every trip on that number is in one place, including ones booked on another phone. No password and no sign-up."
            : "Booking never needs one. Sign in with your number and every trip on it is in one place, including ones booked on another phone. No password and no sign-up."}
      </p>

      <SignInSteps
        flow={flow}
        submitLabel="Show me my trips"
        onSignedIn={afterSignIn}
      />

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
        On BOTH branches of this screen (yuvoy-app#15). It was on the signed-in
        one only, and almost nobody is signed in: this product has no account
        to make, so the signed-out form is what a traveller meets here.
      */}
      <LegalLinks className="border-paper-line mt-10 border-t pt-6 text-xs" />
    </Screen>
  );
}

/**
 * Signed in: who you are, and the four things an account can do.
 *
 * yuvoy-app#38 item 9. This screen used to be a sentence and a sign-out
 * button, because everything it might have shown lived somewhere else. It now
 * reads `GET /me`, which is the one endpoint that knows the traveller rather
 * than the booking.
 *
 * ## The first-sign-in screen is mounted HERE and nowhere else
 *
 * That placement is the whole of the issue's "never shown during checkout, the
 * Ask pop-up or an invite, and if sign-in happens anywhere else, show it the
 * next time Account opens". It is not a rule enforced by a flag; the screen is
 * simply not rendered anywhere a booking could be in progress.
 *
 * ## The header says nothing it cannot prove
 *
 * `memberSince` is null for a number with no profile, and the line is dropped
 * rather than rendered as "Member since". Same for a name: the header offers a
 * way to add one instead of inventing a greeting.
 */
function SignedIn({ onSignOut }: { onSignOut: () => Promise<void> }) {
  const account = useMyAccount(true);
  const [editing, setEditing] = useState(false);
  /*
    A code redeemed on this screen, a moment ago.

    Held HERE because redeeming writes `admitted: true` straight into the
    cached account, so the condition that put the entry on screen stops being
    true the instant it succeeds. Without this latch the panel would vanish
    mid-sentence, taking "you are in" and the way onward with it: the same
    dead end the revamp audit found in saving.
  */
  const [redeemed, setRedeemed] = useState(false);

  if (account.isPending) {
    return (
      <Screen>
        <LoadingState label="Loading your account">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="mt-4 h-24 w-full" />
        </LoadingState>
      </Screen>
    );
  }

  /*
    A failed read is not a failed session. The account is a summary, and every
    row below except Edit profile works without it, so the screen renders with
    a line rather than becoming an error page that also hides Sign out.
  */
  const me = account.data;

  if (me?.onboardingRequired) {
    return <FirstSignIn />;
  }

  return (
    <Screen>
      <h1 className="font-display tracking-display text-3xl leading-tight">
        {me?.name ?? "You are signed in"}
      </h1>

      {me ? (
        <div className="mt-3">
          <p className="text-forest/80 text-sm">{me.phone}</p>
          {me.memberSince ? (
            <p className="text-forest/70 mt-1 text-sm">
              Member since {memberSince(me.memberSince)}
            </p>
          ) : null}
          <p className="text-forest/70 mt-1 text-sm">{counts(me)}</p>
          {!me.name ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              className="mt-3"
            >
              Add your name
            </Button>
          ) : null}
        </div>
      ) : (
        <p role="alert" className="text-forest/70 mt-3 text-sm">
          We could not load your profile just now. Everything below still works.
        </p>
      )}

      {/*
        THE WAY IN, FOR A NUMBER THAT IS NOT IN YET (yuvoy-api#195).

        Above Trips on purpose: with the gate on, this traveller cannot browse,
        search, save or book, and a trip they already hold is the one thing
        they CAN still reach. So the thing that unblocks everything else comes
        first.

        Behind the switch, like the rest of the app's posture. `admitted` is
        on `GET /me` on production today, so with the switch off every number
        that has not redeemed a code would otherwise be shown an invite panel
        on an app where nothing is by invitation. A traveller refused by the
        API's own gate while this switch is off is met at checkout instead,
        which is where the refusal actually happens.
      */}
      {INVITE_ONLY &&
      me &&
      (standingOfAccount(me) === "not-admitted" || redeemed) ? (
        <InviteEntry admitted={redeemed} onAdmitted={() => setRedeemed(true)} />
      ) : null}

      <ButtonLink href="/trips" size="lg" block className="mt-6">
        Go to my trips
      </ButtonLink>

      {/*
        The wishlist's only permanent entrance.

        Saving has written to the device since it shipped and had nowhere to be
        read back; this is that screen. Deliberately NOT a fifth tab: the
        bottom bar answers "where do I go most often" and a wishlist is where
        somebody goes once they already have saves. See `saved-screen`.
      */}
      <ButtonLink href="/saved" variant="outline" block className="mt-3">
        Saved experiences
      </ButtonLink>

      {me ? (
        <Button
          variant="outline"
          block
          onClick={() => setEditing(true)}
          className="mt-3"
        >
          Edit profile
        </Button>
      ) : null}

      {/*
        The same section as the booking page's, with no reference attached:
        Account has a session and no one booking in mind.
      */}
      <HelpSection
        support={me?.support}
        whatsappMessage="Hi, I need help with Yuvoy."
      />

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
      <LegalLinks className="border-paper-line mt-10 border-t pt-6 text-xs" />

      {editing && me ? (
        <EditProfileSheet account={me} onClose={() => setEditing(false)} />
      ) : null}
    </Screen>
  );
}

/**
 * "Enter your invite code", on the one screen a traveller who is not in can
 * always reach (yuvoy-api#195).
 *
 * The gate itself asks for a code wherever somebody is stopped by it. This is
 * the standing place for it: somebody who was given a code and has not used
 * it yet has nowhere else to type it, because every screen that would ask is
 * behind the gate and shows the landing instead.
 *
 * The SAME form as the gate's, not a second one, so there is one set of
 * sentences for a code that is unknown, used, expired or throttled.
 *
 * No `autoFocus`. This renders with the page rather than after a tap, and a
 * field that takes the focus on load moves a screen reader away from the
 * heading and opens the keyboard over the rest of the screen.
 */
function InviteEntry({
  admitted,
  onAdmitted,
}: {
  admitted: boolean;
  onAdmitted: () => void;
}) {
  return (
    <Panel className="mt-6">
      <p className="text-sm font-bold">Enter your invite code</p>
      <p className="text-forest/70 mt-1.5 text-sm">
        Yuvoy is by invitation for now. Enter the code you were given, once, and
        this number is in on any phone you sign in on.
      </p>
      <InviteCodeForm onAdmitted={onAdmitted} />
      {/*
        A way onward rather than a screen that congratulates you and stops.
        The form says what happened; this is where to go with it.
      */}
      {admitted ? (
        <ButtonLink href="/" size="sm" className="mt-4">
          Start looking
        </ButtonLink>
      ) : null}
    </Panel>
  );
}

/**
 * "Member since Sep 2026".
 *
 * Built from civil fields rather than formatted, for the reason in
 * `lib/format/date`: `Intl` takes its month names from the runtime's CLDR, and
 * this screen is server rendered (yuvoy-app#67).
 */
function memberSince(iso: string): string | null {
  const civil = civilInZone(iso, "Asia/Kolkata");
  return civil ? `${monthName(civil)} ${civil.year}` : null;
}

/** "3 trips · 1 review", with the singular where it belongs. */
function counts(me: TravellerAccount): string {
  const trips = me.trips?.total ?? 0;
  const reviews = me.reviews?.count ?? 0;
  const plural = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? "" : "s"}`;
  return `${plural(trips, "trip")} · ${plural(reviews, "review")}`;
}
