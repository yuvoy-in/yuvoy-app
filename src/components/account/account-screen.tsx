"use client";

import { useState } from "react";
import Link from "@/components/ui/link";
import { useRouter } from "next/navigation";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import { Button, ButtonLink } from "@/components/ui/button";
import { Screen } from "@/components/chrome/screen";
import {
  SignInSteps,
  signInHeading,
  signInSentence,
  useSignInFlow,
} from "@/components/auth/sign-in-form";
import { LegalLinks } from "@/components/site/legal-links";
import { UsageSetting } from "./usage-setting";
import { DownloadMyData } from "./download-my-data";
import { safeNextPath } from "@/lib/site/next-path";
import { Skeleton, LoadingState } from "@/components/states";
import { useMyAccount } from "@/lib/auth/use-my-account";
import { HelpSection } from "@/components/support/help-section";
import { SheetPresence } from "@/components/ui/sheet";
import { EditProfileSheet } from "./edit-profile-sheet";
import { FirstSignIn } from "./first-sign-in";
import { INVITE_ONLY, standingOfAccount } from "@/lib/site/access";
import { YourLinks } from "@/components/creator/your-links";
import { OrganiserAccountLink } from "@/components/organisers/organiser-parts";
import { MeCounts, MeSection } from "@/components/me/me-section";
import { MeSettings } from "@/components/me/me-settings";
import { PeopleRow } from "@/components/people/people-row";
import { InviteEntry, counts, memberSince } from "./account-parts";
import { AgeClosed, CONFIRM_AGE_WORDS, ConfirmAgePanel } from "./confirm-age";
import { WaysIn } from "./ways-in";

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

/**
 * The screen before it knows which screen it is: the device's session first,
 * then, signed in, the account. One shape for both waits, the shape both
 * answers share: a heading's line, the lines under it, a block, and the
 * policy links where both answers put them.
 *
 * The two waits used to be two different skeletons, and only the first had
 * the links, so a signed-in visit went from one shape, to another without
 * the links, to the screen with them (stability audit, 6 Oct 2026).
 *
 * The links are here for a second reason: the first wait is the branch that
 * PRERENDERS. `/account` is a static route and this is what its HTML
 * contains, and a policy link that only exists after hydration is one a
 * crawler, a reader with JavaScript off, and anybody reading the source
 * cannot find.
 */
function AccountWaiting({ label }: { label: string }) {
  const line = (width: string) => (
    <div className="flex h-[1lh] items-center">
      <Skeleton className={`h-3 max-w-full ${width}`} />
    </div>
  );
  return (
    <Screen>
      <LoadingState label={label}>
        {/* The heading's own line box, whichever heading it becomes. */}
        <div className="font-display leading-display flex h-[1lh] items-center text-3xl text-balance">
          <Skeleton className="h-7 w-2/3" />
        </div>
        <div className="text-body mt-3 text-pretty">
          {line("w-full")}
          {line("w-4/5")}
        </div>
        <Skeleton className="mt-6 h-24 w-full" />
      </LoadingState>
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
function SignedIn({
  onSignOut,
  onUnderAge,
  onSessionEnded,
}: {
  onSignOut: () => Promise<void>;
  onUnderAge: (message: string) => void;
  onSessionEnded: (message: string) => Promise<void>;
}) {
  const account = useMyAccount(true);
  const [editing, setEditing] = useState(false);
  // Confirmed a moment ago: `/me` now says so and the panel has gone.
  const [ageDone, setAgeDone] = useState(false);
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
    return <AccountWaiting label="Loading your account" />;
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
      <h1 className="font-display tracking-display leading-display text-3xl text-balance">
        {me?.name ?? "You are signed in"}
      </h1>

      {me ? (
        <div className="mt-3">
          {/*
            How this account signs in (yuvoy-app#229): the number, else the
            proven address, else Google. A Google-only account never reads as
            having no way in. None of them, and the line is left out.
          */}
          {me.phone || me.provenEmail ? (
            <p className="text-forest/80 text-sm">
              Signed in as <span>{me.phone || me.provenEmail}</span>
            </p>
          ) : me.googleSignIn ? (
            <p className="text-forest/80 text-sm">Signed in with Google</p>
          ) : null}
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
      {/* Me (yuvoy-mobile#444): each part draws nothing while `me` is closed. */}
      <MeCounts />

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

      {me?.ageConfirmed === false ? (
        <ConfirmAgePanel
          onDone={() => setAgeDone(true)}
          onUnderAge={onUnderAge}
        />
      ) : ageDone ? (
        <p role="status" className="text-forest/80 mt-6 text-sm">
          {CONFIRM_AGE_WORDS.done}
        </p>
      ) : null}

      {me ? <WaysIn me={me} /> : null}

      <MeSection className="mt-8" />
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

      {/*
        The guides, the other place a traveller goes INTO from here
        (yuvoy-app#116 item 3). They were in the desktop rail only, which a
        phone never draws, so on a phone there was no way in at all. Search
        has the other door, for somebody signed out.
      */}
      <ButtonLink href="/guides" variant="outline" block className="mt-3">
        Guides
      </ButtonLink>
      <OrganiserAccountLink />

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

      {/* Share links and their counts (yuvoy-app#207). */}
      <YourLinks toolsOn={me?.creatorToolsOn === true} />
      <PeopleRow people={me?.people} />

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
        The traveller's own data, as one file (yuvoy-app#221). With the
        privacy rows rather than the account rows: it is the DPDP Act's
        document, read for the caller.
      */}
      <DownloadMyData onSessionEnded={onSessionEnded} className="mt-10" />

      {/*
        The standing place for the policy — yuvoy-app#15. The consent banner
        carries it at the moment of asking and then never appears again; this
        is where somebody comes looking for it a week later. The answer itself
        sits above it, to change at any time (yuvoy-app#181).
      */}
      <MeSettings className="mt-10" />
      <UsageSetting className="mt-10" />
      <LegalLinks className="border-paper-line mt-10 border-t pt-6 text-xs" />

      {me ? (
        <SheetPresence open={editing}>
          <EditProfileSheet account={me} onClose={() => setEditing(false)} />
        </SheetPresence>
      ) : null}
    </Screen>
  );
}
