"use client";

import {
  Activity,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { Screen } from "@/components/chrome/screen";
import { EmptyState, LoadingState, Skeleton } from "@/components/states";
import { Button, ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { useTravellerSession } from "@/lib/auth/use-traveller";
import { CONFIRM_AGE_WORDS } from "@/lib/auth/confirm-age";
import {
  organiserRefusalLine,
  type OrganiserRefusal,
} from "@/lib/organisers/refusal";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import { useRelease } from "@/lib/site/use-release";
import { AgeStep } from "./age-step";

/**
 * The frame every organiser screen shares (yuvoy-app#224, the phone's
 * `organiser-states.tsx`): the gate in front of each screen, the block a
 * refused read shows, and the line a refused write shows.
 *
 * Exports, used by the page screens and the event screens alike:
 *
 * - `OrganiserGate({ children })`: wraps a whole screen. Loading while the
 *   session or the `supply` release is still being read; the sign-in prompt
 *   signed out; "This is not open yet." while `supply` is closed to the
 *   person; otherwise the children. The children call nothing until the gate
 *   lets them render, so they pass `enabled: true` to the organiser hooks.
 * - `OrganiserRefusalBlock({ refusal, onRetry })`: what a screen shows in
 *   place of its content when its main read was refused. Never an empty list.
 * - `OrganiserWriteError({ refusal, onRetry })`: the line above a form's
 *   button after a refused write. Its rules are on the component.
 *
 * ## The age step is held by the gate
 *
 * A 403 `adult_confirmation_required` (on a read or a write) opens the age
 * step in the gate, not in the screen. The screen stays mounted under it
 * inside a hidden `<Activity>`, so a form keeps everything typed, and nothing
 * under it reads while it is hidden. A kept answer closes the step and calls
 * the screen's `onRetry`. An under-18 answer closes the account and signs out:
 * the gate keeps the step on screen with its closed sentence, rather than
 * falling to the sign-in prompt, and the screen under it goes.
 */

const BACK = { href: "/account", label: "your account" };

interface GateHold {
  /** Opens the age step over the screen; `onDone` runs after a kept answer. */
  askAge: (onDone: () => void) => void;
}

const GateContext = createContext<GateHold | null>(null);

function Heading() {
  return (
    <h1 className="font-display tracking-display leading-display text-3xl text-balance">
      {W.title}
    </h1>
  );
}

function Loading() {
  return (
    <Screen back={BACK}>
      <Heading />
      <LoadingState label={W.loading}>
        <div className="mt-6 space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </LoadingState>
    </Screen>
  );
}

/** The way in, back to the page the person was on. */
function useSignInHref(): string {
  const path = usePathname() || "/organiser";
  return `/account?next=${encodeURIComponent(path)}`;
}

/** Signed out, or a sign-in that ended (`expired`): what it is for, and the way in. */
function SignInPrompt({ expired = false }: { expired?: boolean }) {
  const href = useSignInHref();
  return (
    <Panel
      tone="outline"
      role={expired ? "alert" : undefined}
      className="mt-6 px-4 py-3"
      data-testid="organiser-signed-out"
    >
      <p className="text-sm font-bold text-pretty">{W.signIn}</p>
      <ButtonLink href={href} size="sm" className="mt-3">
        {W.signInButton}
      </ButtonLink>
    </Panel>
  );
}

export function OrganiserGate({ children }: { children: ReactNode }) {
  const { signedIn } = useTravellerSession();
  const release = useRelease("supply");
  const [age, setAge] = useState<{ onDone: () => void } | null>(null);

  const askAge = useCallback((onDone: () => void) => setAge({ onDone }), []);
  const hold = useMemo<GateHold>(() => ({ askAge }), [askAge]);

  const ready = signedIn === true && !release.pending && release.open;

  if (!age && !ready) {
    // The session first: a disabled read reports pending, so both at once would hold signed out on loading.
    if (signedIn === undefined) return <Loading />;
    if (release.pending) return <Loading />;
    // Signed out at `early` or `staff` is closed only until the cohort is known: the way in first.
    const byCohort = release.stage === "early" || release.stage === "staff";
    if (!signedIn && (release.open || byCohort)) {
      return (
        <Screen back={BACK}>
          <Heading />
          <SignInPrompt />
        </Screen>
      );
    }
    return (
      <Screen back={BACK}>
        <Heading />
        {/* Back already leads to Account, so there is nothing more to offer. */}
        <EmptyState title={W.notOpen} />
      </Screen>
    );
  }

  const finish = () => {
    const done = age?.onDone;
    setAge(null);
    done?.();
  };

  return (
    <GateContext.Provider value={hold}>
      {age ? (
        <Screen back={BACK}>
          <div className="min-w-0" data-testid="organiser-age">
            <AgeStep onDone={finish} />
          </div>
        </Screen>
      ) : null}
      {ready ? (
        <Activity mode={age ? "hidden" : "visible"}>{children}</Activity>
      ) : null}
    </GateContext.Provider>
  );
}

const NOT_ASKED = Symbol("not asked");

/**
 * Opens the age step in the gate once per `ask` value, and shows the API's
 * sentence with a way to open it again. Outside a gate (a test, a stray use)
 * it draws the step itself.
 */
function AgeAsk({
  message,
  onDone,
  ask,
}: {
  message: string;
  onDone: () => void;
  ask: unknown;
}) {
  const gate = useContext(GateContext);
  const latest = useRef(onDone);
  /*
    What it last asked for. A ref, not the effect alone: the hidden
    `<Activity>` takes the effects down while the step is open and runs them
    again when the screen comes back, which must not open the step twice.
  */
  const asked = useRef<unknown>(NOT_ASKED);
  useEffect(() => {
    latest.current = onDone;
  });
  useEffect(() => {
    if (!gate || asked.current === ask) return;
    asked.current = ask;
    gate.askAge(() => latest.current());
  }, [gate, ask]);

  if (!gate) return <AgeStep onDone={onDone} />;
  return (
    <div role="alert" className="mt-4">
      <p className="text-forest/80 text-sm text-pretty">{message}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={() => gate.askAge(() => latest.current())}
      >
        {CONFIRM_AGE_WORDS.title}
      </Button>
    </div>
  );
}

/** Opened once for each block on screen: a read refused again keeps its button. */
const READ_ASK = "read";

/**
 * A refused READ, in place of what the screen would show. Never an empty
 * list, never a stale one passed off as current.
 *
 * - `signedOut`: the sign-in has ended, with the way back in.
 * - `age`: the age step (held by the gate), then `onRetry` reads again.
 * - `paused`: the API's sentence, a pause and not a fault, with Try again.
 * - `notFound`, `notMember`, `notOwner`: the API's sentence alone.
 * - anything else: the general error with Try again.
 */
export function OrganiserRefusalBlock({
  refusal,
  onRetry,
}: {
  refusal: OrganiserRefusal;
  onRetry: () => void;
}) {
  switch (refusal.kind) {
    case "signedOut":
      return <SignInPrompt expired />;
    case "age":
      return (
        <AgeAsk message={refusal.message} onDone={onRetry} ask={READ_ASK} />
      );
    case "paused":
      return (
        <Panel
          tone="outline"
          role="status"
          className="mt-6 px-4 py-3"
          data-testid="organiser-paused"
        >
          <p className="text-forest/80 text-pretty">{refusal.message}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={onRetry}
          >
            {W.tryAgain}
          </Button>
        </Panel>
      );
    case "notFound":
    case "notMember":
    case "notOwner":
      return (
        <Panel
          tone="outline"
          role="alert"
          className="mt-6 px-4 py-3"
          data-testid="organiser-refused"
        >
          <p className="text-forest/80 text-pretty">
            {organiserRefusalLine(refusal)}
          </p>
        </Panel>
      );
    default:
      return (
        <Panel
          tone="outline"
          role="alert"
          className="mt-6 px-4 py-3"
          data-testid="organiser-error"
        >
          <p className="text-forest/80 text-pretty">
            {organiserRefusalLine(refusal)}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={onRetry}
          >
            {W.tryAgain}
          </Button>
        </Panel>
      );
  }
}

/**
 * A refused WRITE, as one line above the form's button. The form keeps the
 * last refusal in state (`refusal`, null while there is none) and passes the
 * same write again as `onRetry`.
 *
 * - `fields`: nothing for one field, whose sentence the form draws under it
 *   from `refusal.fields`; the API's line for the whole when several.
 * - `signedOut`: the sign-in has ended, with the way back in.
 * - `age`: the age step (held by the gate, the form kept as typed), then
 *   `onRetry` sends the same write once more. A refusal that comes back as a
 *   new value opens the step again.
 * - `emailRequired`: the API's sentence only, no button.
 * - `paused`: the API's sentence with Try again, which sends it again.
 * - `network`: "That did not go through", never sent again by itself, since
 *   the write may have gone through.
 * - anything else: the API's sentence (`organiserRefusalLine`).
 */
export function OrganiserWriteError({
  refusal,
  onRetry,
}: {
  refusal: OrganiserRefusal | null;
  onRetry: () => void;
}) {
  if (!refusal) return null;
  switch (refusal.kind) {
    case "fields":
      return Object.keys(refusal.fields).length > 1 ? (
        <Line text={refusal.message} />
      ) : null;
    case "signedOut":
      return <SignInPrompt expired />;
    case "age":
      return (
        <AgeAsk message={refusal.message} onDone={onRetry} ask={refusal} />
      );
    case "paused":
      return (
        <div role="alert" className="mt-4">
          <p className="text-terra-deep text-sm text-pretty">
            {refusal.message}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={onRetry}
          >
            {W.tryAgain}
          </Button>
        </div>
      );
    default:
      return <Line text={organiserRefusalLine(refusal)} />;
  }
}

function Line({ text }: { text: string }) {
  return (
    <p
      role="alert"
      className="text-terra-deep mt-4 text-sm text-pretty"
      data-testid="organiser-write-error"
    >
      {text}
    </p>
  );
}
