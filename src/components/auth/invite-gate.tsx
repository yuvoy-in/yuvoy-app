"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "@/components/ui/link";
import { LoadingState, Skeleton } from "@/components/states";
import { Button } from "@/components/ui/button";
import { maskPhone } from "@/components/auth/contact-fields";
import { SignInSteps, signInSentence, useSignInFlow } from "./sign-in-form";
import type { RedeemAnswer } from "@/lib/auth/use-invite-code";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import { useMyAccount } from "@/lib/auth/use-my-account";
import { useHasMounted } from "@/lib/react/use-has-mounted";
import { cn } from "@/lib/cn";
import { InviteCodeForm } from "./invite-gate-code";

export { InviteCodeForm, redeemFailure } from "./invite-gate-code";

/**
 * The invite gate: one component, wherever somebody is asked for an
 * invitation (yuvoy-api#195).
 *
 * The owner's posture is "public pages only": the feed, search, saving and
 * booking need a traveller who is admitted, and everything a link leads to stays
 * open. So this is drawn in three places, by three containers that each decide
 * WHAT to show and hand it down as a `view`:
 *
 *   - `page`, a whole gated route, decided on the server (`InviteGatePage`);
 *   - `sheet`, over an open page, when a save is tapped (`InviteGuard`);
 *   - `panel`, inside checkout, after the API refuses with
 *     `403 invite_required`, whatever this app's switch says.
 *
 * ## The four views
 *
 *   - `checking`: not known yet. Never drawn as a refusal or as a yes.
 *   - `signed-out`: what Yuvoy is, and how in: sign in, then a code. The steps
 *     are the Account screen's own, asked for in place, so nothing on the page
 *     behind is lost to a round trip. A traveller who is already admitted goes
 *     straight through; it never sees a code screen.
 *   - `code`: the code screen, for a signed-in traveller who is not admitted.
 *   - `in`: admitted, while the page catches up.
 *
 * For people with no code, one line leads to the marketing site's waitlist.
 */

export type GatePurpose = "browse" | "search" | "save" | "book";
export type GateVariant = "page" | "sheet" | "panel";
export type GateView = "checking" | "signed-out" | "code" | "in";

/** The marketing site's existing waitlist. Another origin, so absolute. */
export const WAITLIST_URL = "https://yuvoy.in/waitlist";

/** Why this person is looking at a gate, in one line. The feed needs none. */
const WHY: Record<GatePurpose, string | null> = {
  browse: null,
  search: "Search opens once you are in.",
  save: "Saving opens once you are in.",
  book: "Booking opens once you are in.",
};

/** The heading a view carries. A sheet puts it in its own title bar. */
export function gateTitle(view: GateView, variant: GateVariant): string {
  switch (view) {
    case "checking":
      return "Checking your invitation";
    case "signed-out":
      return variant === "panel"
        ? "Booking is by invitation for now"
        : "Yuvoy is by invitation for now";
    case "code":
      return variant === "panel"
        ? "Enter your invite code to book"
        : "Enter your invite code";
    case "in":
      return "You are in";
  }
}

export function InviteGate({
  view,
  variant,
  purpose,
  phone,
  onSignedIn,
  onAdmitted,
  refreshing = false,
  onContinue,
  retryLabel,
}: {
  view: GateView;
  variant: GateVariant;
  purpose: GatePurpose;
  /**
   * The signed-in number, as the server read it, for the code screen to name.
   * Admission belongs to the account, so somebody signed in with the wrong one
   * needs to see which. The browser's own read replaces it once hydrated, and
   * names the proven email when the account has no number (yuvoy-api#351).
   */
  phone?: string | null;
  /** After the inline sign-in has made a session. */
  onSignedIn?: () => void | Promise<void>;
  /** After a code was accepted, in either of the two 200 shapes. */
  onAdmitted?: (answer: RedeemAnswer) => void;
  /** `in` only: the page is being asked for again. */
  refreshing?: boolean;
  /** `in` only: ask for the page again, when it did not arrive on its own. */
  onContinue?: () => void;
  /** `panel`, `in` only: what the checkout button that was refused says. */
  retryLabel?: string;
}) {
  const headingId = useId();
  /*
    Held HERE rather than in the view that set them, because the view changes
    underneath: a session that ended mid-redeem sends the code screen back to
    sign in, and admission swaps the code screen for `in`. Both have something
    to say on the other side of that change.
  */
  const [sessionEnded, setSessionEnded] = useState(false);
  const [answer, setAnswer] = useState<RedeemAnswer | null>(null);
  /*
    Signed in HERE, a moment ago. A page does not move focus on load, but a
    code screen that appears because somebody just signed in is the next step
    of what they are doing, so the field takes the focus the steps had.
  */
  const [signedInHere, setSignedInHere] = useState(false);

  const heading =
    variant === "sheet" ? null : variant === "page" ? (
      <h1
        id={headingId}
        className="font-display tracking-display leading-display mt-4 text-3xl text-balance sm:text-4xl"
      >
        {gateTitle(view, variant)}
      </h1>
    ) : (
      <p id={headingId} className="text-sm font-bold text-balance">
        {gateTitle(view, variant)}
      </p>
    );

  return (
    <section
      data-invite-gate={variant}
      aria-labelledby={variant === "sheet" ? undefined : headingId}
      aria-label={variant === "sheet" ? gateTitle(view, variant) : undefined}
    >
      {variant === "page" ? (
        <p className="eyebrow text-terra-deep">By invitation</p>
      ) : null}
      {heading}

      {view === "checking" ? (
        <Checking variant={variant} />
      ) : view === "signed-out" ? (
        <SignedOut
          variant={variant}
          purpose={purpose}
          sessionEnded={sessionEnded}
          onSignedIn={async () => {
            setSessionEnded(false);
            setSignedInHere(true);
            await onSignedIn?.();
          }}
        />
      ) : view === "code" ? (
        <CodeScreen
          variant={variant}
          purpose={purpose}
          phone={phone}
          focus={variant !== "page" || signedInHere}
          onSessionEnded={() => setSessionEnded(true)}
          onAdmitted={(given) => {
            setAnswer(given);
            onAdmitted?.(given);
          }}
        />
      ) : (
        <In
          variant={variant}
          alreadyAdmitted={Boolean(answer?.alreadyAdmitted)}
          refreshing={refreshing}
          onContinue={onContinue}
          retryLabel={retryLabel}
        />
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- checking */

function Checking({ variant }: { variant: GateVariant }) {
  return (
    <LoadingState label="Checking your invitation">
      <div className={cn("space-y-3", variant === "page" ? "mt-6" : "mt-3")}>
        <Skeleton className="h-4 w-4/5 rounded-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </LoadingState>
  );
}

/* ---------------------------------------------------------- signed out */

/**
 * What Yuvoy is, and how to get in.
 *
 * On a page this is the front door a crawler reads, so it opens with what
 * Yuvoy is and puts the steps behind one tap: the landing says something
 * before it asks for a number. In a sheet or at checkout the person has just
 * tried to do something, so the steps are open from the start.
 */
function SignedOut({
  variant,
  purpose,
  sessionEnded,
  onSignedIn,
}: {
  variant: GateVariant;
  purpose: GatePurpose;
  sessionEnded: boolean;
  onSignedIn: () => Promise<void>;
}) {
  const flow = useSignInFlow();
  const [signingIn, setSigningIn] = useState(variant !== "page");
  /*
    Signed in, and the answer to "is this traveller in" is on its way: the
    page or the sheet moves on when it lands. Until then this says so, rather
    than putting the sign-in form back as though nothing had happened.
  */
  const [checking, setChecking] = useState(false);

  if (checking) return <Checking variant={variant} />;

  const why = WHY[purpose];
  // The year step says why it asks; the under step says it itself.
  const intro = signInSentence(flow, "Have a code? Sign in, then enter it.");
  const body =
    variant === "page"
      ? "text-forest/70 text-body mt-3 text-pretty"
      : "text-forest/70 text-body mt-1.5 text-pretty";

  return (
    <>
      {variant === "page" ? (
        <p className={body}>
          Find something worth doing, and book a seat on it. Real departures,
          filmed by the operators who run them.
        </p>
      ) : null}
      {variant === "panel" ? (
        <p className={body}>
          Nothing was held and nothing was charged, and what you filled in is
          still here.
        </p>
      ) : null}
      {why && variant !== "panel" ? <p className={body}>{why}</p> : null}

      {sessionEnded ? (
        <p role="alert" className="text-terra-deep mt-3 text-sm">
          Your sign-in has ended. Sign in again, then enter your code.
        </p>
      ) : null}

      {intro ? (
        <p className={cn(body, variant === "page" && "mt-6")}>{intro}</p>
      ) : null}

      {signingIn ? (
        <SignInSteps
          flow={flow}
          submitLabel="Sign in"
          autoFocusPhone={variant === "page"}
          onSignedIn={async () => {
            setChecking(true);
            await onSignedIn();
          }}
        />
      ) : (
        <Button
          size="lg"
          block
          className="mt-6"
          onClick={() => setSigningIn(true)}
        >
          Sign in
        </Button>
      )}

      <WaitlistLine />

      {variant === "page" ? (
        <p className="text-forest/70 mt-3 text-sm">
          Our guides are open to everyone.{" "}
          <Link
            href="/guides"
            className="text-terra-deep underline underline-offset-4"
          >
            Read the guides
          </Link>
        </p>
      ) : null}
    </>
  );
}

/* --------------------------------------------------------------- code */

function CodeScreen({
  variant,
  purpose,
  phone,
  focus,
  onSessionEnded,
  onAdmitted,
}: {
  variant: GateVariant;
  purpose: GatePurpose;
  phone?: string | null;
  /** Whether the field takes focus as it appears. */
  focus: boolean;
  onSessionEnded: () => void;
  onAdmitted: (answer: RedeemAnswer) => void;
}) {
  const { signedIn, signOut } = useTravellerSession();
  const account = useMyAccount(signedIn);
  const mounted = useHasMounted();
  /*
    The browser's own read once hydrated, the server's until then, so the
    first client render says exactly what the HTML did. An account with no
    number is named by its proven email, which only the browser's read has.
  */
  const number = (mounted ? account.data?.phone : undefined) ?? phone ?? null;
  const email = mounted && !number ? (account.data?.provenEmail ?? null) : null;
  const who = number ? maskPhone(number) : email;
  const why = WHY[purpose];
  const body =
    variant === "page"
      ? "text-forest/70 text-body mt-3 text-pretty"
      : "text-forest/70 text-body mt-1.5 text-pretty";

  return (
    <>
      {variant === "panel" ? (
        <p className={body}>
          Nothing was held and nothing was charged, and what you filled in is
          still here.
        </p>
      ) : (
        <p className={body}>
          {why && variant === "sheet" ? `${why} ` : ""}
          Yuvoy is by invitation for now. Enter the code you were given, once,
          and you are in on any phone.
        </p>
      )}

      {who ? (
        <p className="text-forest/70 text-body mt-3 text-pretty">
          Signed in as <span className="text-forest font-bold">{who}</span>.{" "}
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-terra-deep tap-target underline underline-offset-4"
          >
            Not you?
          </button>
        </p>
      ) : null}

      <InviteCodeForm
        autoFocus={focus}
        onSessionEnded={onSessionEnded}
        onAdmitted={onAdmitted}
      />

      <WaitlistLine />
    </>
  );
}

/* ----------------------------------------------------------------- in */

function In({
  variant,
  alreadyAdmitted,
  refreshing,
  onContinue,
  retryLabel,
}: {
  variant: GateVariant;
  alreadyAdmitted: boolean;
  refreshing: boolean;
  onContinue?: () => void;
  retryLabel?: string;
}) {
  const note = alreadyAdmitted
    ? "You were already in, so your code was not used. You can pass it on to somebody else."
    : null;

  if (variant === "panel") {
    return (
      <div
        role="status"
        className="text-forest/70 text-body mt-1.5 text-pretty"
      >
        {note ? <p>{note}</p> : null}
        <p className={note ? "mt-1.5" : undefined}>
          {retryLabel
            ? `Tap ${retryLabel} again to book.`
            : "You can book now. Try again below."}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3">
      {note ? (
        <p role="status" className="text-forest/70 text-body text-pretty">
          {note}
        </p>
      ) : null}
      {refreshing || !onContinue ? (
        <LoadingState label="Opening Yuvoy">
          <div className="mt-6 space-y-3">
            <Skeleton className="h-4 w-3/4 rounded-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </LoadingState>
      ) : (
        <Button size="lg" block className="mt-6" onClick={onContinue}>
          Continue
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ waitlist */

/**
 * For somebody with no code: the marketing site's existing waitlist, rather
 * than a second one built here. That choice is the owner's to confirm, and
 * the one line to change if they choose otherwise.
 *
 * Same tab, `rel="noopener"`, like the legal links: a new tab on a phone
 * leaves somebody with two tabs and no obvious way back.
 */
function WaitlistLine(): ReactNode {
  return (
    <p className="text-forest/70 mt-6 text-sm">
      No code yet?{" "}
      <a
        href={WAITLIST_URL}
        rel="noopener"
        className="text-terra-deep underline underline-offset-4"
      >
        Join the waitlist
      </a>
    </p>
  );
}
