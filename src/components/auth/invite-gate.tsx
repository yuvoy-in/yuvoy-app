"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { YuvoyError, NetworkError } from "@/lib/api/errors";
import {
  describeError,
  LoadingState,
  Skeleton,
  type DescribedError,
} from "@/components/states";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Panel } from "@/components/ui/panel";
import { maskPhone } from "@/components/auth/contact-fields";
import { SignInSteps, useSignInFlow } from "./sign-in-form";
import {
  useRedeemInviteCode,
  type RedeemAnswer,
} from "@/lib/auth/use-invite-code";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import { useMyAccount } from "@/lib/auth/use-my-account";
import { useHasMounted } from "@/lib/react/use-has-mounted";
import {
  INVITE_CODE_EXAMPLE,
  formatInviteCode,
  inviteCodeProblem,
  inviteCodeProblemSentence,
  isInviteCode,
} from "@/lib/auth/invite-code";
import { cn } from "@/lib/cn";

/**
 * The invite gate: one component, wherever somebody is asked for an
 * invitation (yuvoy-api#195).
 *
 * The owner's posture is "public pages only": the feed, search, saving and
 * booking need a number that is admitted, and everything a link leads to stays
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
 *     behind is lost to a round trip. A number that is already admitted goes
 *     straight through; it never sees a code screen.
 *   - `code`: the code screen, for a signed-in number that is not admitted.
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
   * Admission belongs to the number, so somebody signed in with the wrong one
   * needs to see which. The browser's own read replaces it once hydrated.
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
        className="font-display tracking-display mt-4 text-3xl leading-tight sm:text-4xl"
      >
        {gateTitle(view, variant)}
      </h1>
    ) : (
      <p id={headingId} className="text-sm font-bold">
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
    Signed in, and the answer to "is this number in" is on its way: the page
    or the sheet moves on when it lands. Until then this says so, rather than
    putting the number field back as though nothing had happened.
  */
  const [checking, setChecking] = useState(false);

  if (checking) return <Checking variant={variant} />;

  const why = WHY[purpose];
  const body =
    variant === "page"
      ? "text-forest/70 mt-3 text-sm"
      : "text-forest/70 mt-1.5 text-sm";

  return (
    <>
      {variant === "page" ? (
        <p className={body}>
          Find something worth doing in the Andaman Islands, and book a seat on
          it. Real departures, filmed by the operators who run them.
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

      <p className={cn(body, variant === "page" && "mt-6")}>
        {flow.sent
          ? `We sent a six-digit code to ${flow.phone} on WhatsApp. It is good for a few minutes.`
          : "Have a code? Sign in with your number, then enter it."}
      </p>

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
          The island guides are open to everyone.{" "}
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
    first client render says exactly what the HTML did.
  */
  const number = (mounted ? account.data?.phone : undefined) ?? phone ?? null;
  const why = WHY[purpose];
  const body =
    variant === "page"
      ? "text-forest/70 mt-3 text-sm"
      : "text-forest/70 mt-1.5 text-sm";

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
          and this number is in on any phone.
        </p>
      )}

      {number ? (
        <p className="text-forest/70 mt-3 text-sm">
          Signed in as{" "}
          <span className="text-forest font-bold">{maskPhone(number)}</span>.{" "}
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

/**
 * One field, checked before it is sent, and every refusal in its own words.
 *
 * Exported for the Account screen's "Enter your invite code", which opens the
 * same form rather than a second one.
 */
export function InviteCodeForm({
  autoFocus,
  onSessionEnded,
  onAdmitted,
}: {
  autoFocus?: boolean;
  /** The API answered 401: the session is over, and signing in again is next. */
  onSessionEnded?: () => void;
  onAdmitted?: (answer: RedeemAnswer) => void;
}) {
  const redeem = useRedeemInviteCode();
  const { refresh: recheckSession } = useTravellerSession();
  const [value, setValue] = useState("");
  /** Why what was typed cannot be a code: said at once, and never sent. */
  const [problem, setProblem] = useState<string | null>(null);
  /**
   * A synchronous guard against the fast double-tap, as checkout has: the
   * pending flag is React state and is not true until a re-render, and a
   * second POST is a second throttled attempt.
   */
  const submitting = useRef(false);

  async function submit() {
    if (submitting.current) return;
    const local = inviteCodeProblem(value);
    if (local) {
      setProblem(inviteCodeProblemSentence(local));
      return;
    }
    setProblem(null);
    setValue(formatInviteCode(value));
    submitting.current = true;
    try {
      const answer = await redeem.mutateAsync(value);
      onAdmitted?.(answer);
    } catch (error) {
      /*
        Swallowed here and nowhere else: `mutateAsync` rejects AND stores the
        failure on `redeem.error`, which is what renders it below.

        A 401 is the one worth acting on. The proxy has already dropped the
        cookie, so the cached "signed in" is stale; asking again turns this
        screen back into sign-in, with a line saying why.
      */
      if (error instanceof YuvoyError && error.status === 401) {
        onSessionEnded?.();
        await recheckSession();
      }
    } finally {
      submitting.current = false;
    }
  }

  const failure = redeemFailure(redeem.error);

  if (redeem.isSuccess) {
    return (
      <p role="status" className="text-forest mt-6 text-sm font-bold">
        {redeem.data?.alreadyAdmitted
          ? "This number was already in, so your code was not used."
          : "Code accepted. You are in."}
      </p>
    );
  }

  return (
    <form
      className="mt-6 space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Field
        label="Invite code"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setProblem(null);
          if (redeem.isError) redeem.reset();
        }}
        onBlur={() => {
          // Shown the way codes are written, once it is one.
          if (isInviteCode(value)) setValue(formatInviteCode(value));
        }}
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        maxLength={32}
        className="font-mono"
        hint={`8 letters and numbers, like ${INVITE_CODE_EXAMPLE}. Capitals, spaces and the hyphen do not matter.`}
        error={problem ?? failure?.onField}
        autoFocus={autoFocus}
        required
      />

      <Button
        type="submit"
        size="lg"
        block
        disabled={redeem.isPending || value.trim().length === 0}
      >
        {redeem.isPending ? "Checking your code…" : "Use this code"}
      </Button>

      {failure?.panel ? (
        <Panel tone="alert" role="alert">
          <p className="text-sm font-bold">{failure.panel.title}</p>
          <p className="text-forest/70 mt-1.5 text-sm">{failure.panel.body}</p>
          {failure.panel.requestId ? (
            <p className="text-forest/70 mt-3 font-mono text-[10px]">
              {failure.panel.requestId}
            </p>
          ) : null}
        </Panel>
      ) : null}
    </form>
  );
}

/**
 * A refused redeem, in words, and where the words go.
 *
 * The three refusals of the code itself (unknown, used, expired) and a code
 * the API calls malformed belong ON the field: they are about what was typed,
 * and that is where the eye and a screen reader already are. Everything else
 * (too many tries, no signal, us) is about the attempt, not the code, and is
 * said in a panel beneath, with what was typed left exactly as it was.
 *
 * A 401 has no sentence here: the screen becomes sign-in and says why there.
 */
export function redeemFailure(error: unknown): {
  onField?: string;
  panel?: Pick<DescribedError, "title" | "body" | "requestId">;
} | null {
  if (!error) return null;

  if (error instanceof NetworkError) {
    return {
      panel: {
        title: "No connection",
        body: "We could not reach Yuvoy. This is usually the island signal rather than you. Your code is still here, so try again when you have signal.",
      },
    };
  }

  if (!(error instanceof YuvoyError)) {
    return {
      panel: {
        title: "Something went wrong",
        body: "That did not work. Your code is still here, so try again in a moment.",
      },
    };
  }

  if (error.status === 401) return null;

  if (error.status === 429 || error.code === "rate_limited") {
    return {
      panel: {
        title: "Too many tries for now",
        body: "To keep codes safe, each number can try only a few an hour. Wait a while, up to an hour, then try again. Nothing is wrong with your account.",
        requestId: error.requestId,
      },
    };
  }

  switch (error.code) {
    case "invite_code_unknown":
    case "invite_code_used":
    case "invite_code_expired": {
      const said = describeError(error);
      return { onField: `${said.title}. ${said.body}` };
    }
    case "invalid_input":
      return {
        onField:
          "That cannot be a code. Check it against the one you were given.",
      };
    default:
      return {
        panel: {
          title: "Something went wrong",
          body: "That did not work. It is us, not you. Your code is still here, so try again in a moment.",
          requestId: error.requestId,
        },
      };
  }
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
    ? "This number was already in, so your code was not used. You can pass it on to somebody else."
    : null;

  if (variant === "panel") {
    return (
      <div role="status" className="text-forest/70 mt-1.5 text-sm">
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
        <p role="status" className="text-forest/70 text-sm">
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
