"use client";

import { useEffect } from "react";
import { Screen } from "@/components/chrome/screen";
import { Button, ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import type { CheckInOutcome } from "@/lib/organisers/check-in";
import { DOOR_WORDS as D } from "@/lib/organisers/door-words";
import type { OrganiserRefusal } from "@/lib/organisers/refusal";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import { OrganiserWriteError } from "./organiser-gate";
import { BACK_TO_HUB, OrganiserHeading } from "./organiser-parts";

/**
 * Pieces of the door (yuvoy-app#226): the way in from the organiser pages,
 * the page for someone who is not a member, the calm line a check-in leaves,
 * and what a refusal that is not about the code shows. A refusal about the
 * code (`refused`) is the field's own line, drawn by `door-screen.tsx`.
 */

/**
 * "Check people in", for a member (owner or helper) of a `verified`
 * organiser. The callers decide when it shows; the door page checks the same
 * itself, for a person who opens `/door#CODE` straight from a Going card.
 */
export function DoorLink({
  variant = "primary",
  className,
}: {
  variant?: "primary" | "outline";
  className?: string;
}) {
  return (
    <ButtonLink
      href="/door"
      variant={variant}
      block
      className={className}
      data-testid="organiser-door-link"
    >
      {D.entry}
    </ButtonLink>
  );
}

/**
 * Takes the `#` part off the address, keeping the path, the query (the mock
 * scenario rides there) and the history state, so a reload sends nothing.
 * `replaceState` fires no `hashchange`.
 */
export function clearAddressHash(): void {
  if (!window.location.hash) return;
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, "", pathname + search);
}

/**
 * The door for a person who is not a member of any `verified` organiser (none
 * at all, or only ones still in checking): what it is for, and the way to the
 * organiser pages. No field, so nothing is sent: a code sent from here would
 * only be a miss, counted against them. A code in the address is taken off.
 */
export function DoorNotMember() {
  useEffect(() => {
    clearAddressHash();
  }, []);
  return (
    <Screen back={BACK_TO_HUB}>
      <OrganiserHeading>{D.title}</OrganiserHeading>
      <Panel
        tone="outline"
        className="mt-6 px-4 py-4"
        data-testid="door-not-member"
      >
        <p className="text-pretty">{D.notMember}</p>
        <ButtonLink href="/organiser" block className="mt-4">
          {W.title}
        </ButtonLink>
      </Panel>
    </Screen>
  );
}

/** A 200: the big line and the event under it. An already used code is calm too. */
export interface DoorDone {
  title: string;
  sub: string;
  already: boolean;
}

export function DoorDoneLine({ done }: { done: DoorDone }) {
  return (
    <Panel
      tone="raised"
      role="status"
      className="mt-6 px-4 py-4"
      data-testid="door-done"
      data-already={done.already ? "" : undefined}
    >
      <p className="font-display tracking-display leading-display text-3xl text-balance break-words">
        {done.title}
      </p>
      {done.sub ? (
        <p className="text-forest/80 mt-2 text-pretty break-words">
          {done.sub}
        </p>
      ) : null}
    </Panel>
  );
}

/**
 * What the page holds after a refusal. The age refusal carries the gate's
 * own shape, made once per 403, so the gate opens its step once for it and
 * again only for a new 403.
 */
export type DoorProblem =
  | Exclude<CheckInOutcome, { kind: "age" }>
  | { kind: "age"; refusal: Extract<OrganiserRefusal, { kind: "age" }> };

const SIGN_IN_HREF = `/account?next=${encodeURIComponent("/door")}`;

/**
 * Everything but `refused`, under the field:
 *
 * - `age`: the gate's age step over the page (the code kept), then `onAgain`
 *   sends the same code the same way once more.
 * - `signIn`: the sign-in has ended, with the way back to this page.
 * - `paused`: the API's sentence, a pause and not a fault, with Try again.
 * - `offline`, `broken`: the sentence with Try again. Nothing is queued.
 */
export function DoorProblemBlock({
  problem,
  onAgain,
}: {
  problem: DoorProblem;
  onAgain: () => void;
}) {
  switch (problem.kind) {
    case "refused":
      return null;
    case "age":
      return (
        <OrganiserWriteError refusal={problem.refusal} onRetry={onAgain} />
      );
    case "signIn":
      return (
        <Panel
          tone="outline"
          role="alert"
          className="mt-6 px-4 py-3"
          data-testid="door-signed-out"
        >
          <p className="text-sm font-bold text-pretty">{D.signIn}</p>
          <ButtonLink href={SIGN_IN_HREF} size="sm" className="mt-3">
            {W.signInButton}
          </ButtonLink>
        </Panel>
      );
    case "paused":
      return (
        <Panel
          tone="outline"
          role="status"
          className="mt-6 px-4 py-3"
          data-testid="door-paused"
        >
          <p className="text-forest/80 text-pretty">{problem.message}</p>
          <AgainButton onAgain={onAgain} />
        </Panel>
      );
    case "offline":
    case "broken":
      return (
        <Panel
          tone="alert"
          role="alert"
          className="mt-6 px-4 py-3"
          data-testid={`door-${problem.kind}`}
        >
          <p className="text-forest/80 text-pretty">{problem.message}</p>
          <AgainButton onAgain={onAgain} />
        </Panel>
      );
  }
}

function AgainButton({ onAgain }: { onAgain: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="mt-3"
      onClick={onAgain}
    >
      {D.tryAgain}
    </Button>
  );
}
