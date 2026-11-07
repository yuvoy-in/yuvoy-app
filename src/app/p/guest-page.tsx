"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { callGuestRoute } from "@/lib/plans/guest-calls";
import { guestActions } from "@/lib/plans/guest-actions";
import {
  arrivalTaken,
  restoreFragment,
  takeArrival,
} from "@/lib/plans/guest-return";
import { guestTokenFromHash } from "@/lib/plans/guest-token";
import { guestWords } from "@/lib/plans/guest-words";
import type { PlanView } from "@/lib/plans/types";
import { planWords } from "@/lib/plans/words";
import { Button } from "@/components/ui/button";
import { GuestPlan } from "@/components/plans/guest-plan";
import { PlanReport } from "@/components/plans/plan-report-sheet";

/**
 * The guest page in the browser (yuvoy-mobile#373): reads the token from
 * the fragment, asks `/p/api/view` for the plan, and draws it, or the page
 * for a link that is not working, for plans paused, or for no answer.
 *
 * ## The fragment
 *
 * The token is everything after `#`, and this page never changes it: an
 * anchor, a `hashchange` of our own or a `replaceState` that rewrote it
 * would lose the plan. So every error line takes focus by script, and the
 * skip link moves focus by script on `/p` (`chrome/skip-link.tsx`).
 *
 * The one write is putting the token BACK, after sign-in: "Link my reply
 * to my account" keeps it in this tab's storage and sign-in returns to
 * `/p` with no token in any address (case 15). `restoreFragment` writes it
 * only into an address with no fragment at all, so it can never replace
 * one, and only the token that was kept.
 *
 * ## A token of the wrong shape, or none, costs no request
 *
 * The "not working" page is shown straight away (case 2). A well-formed
 * token the API does not know is the same page after one request, with
 * "Report this plan": a guest the planner removed gets a 404 too, and the
 * report route still takes their key (case 16, with yuvoy-api#434).
 *
 * ## Paused, and no answer
 *
 * `503 plans_unavailable` is a switch somebody at Yuvoy turned, so it says
 * so rather than "something went wrong", and both it and a read that never
 * answered offer Try again, which asks again with the same token.
 */

type Shown =
  | { kind: "plan"; plan: PlanView }
  | { kind: "not-working" }
  | { kind: "paused" }
  | { kind: "failed" };

/** What an answer from `/p/api/view` means for the page. */
function shownFor(status: number, body: unknown): Shown {
  if (status === 200 && typeof body === "object" && body !== null) {
    return { kind: "plan", plan: body as PlanView };
  }
  if (status === 404) return { kind: "not-working" };
  const code =
    typeof body === "object" && body !== null
      ? (body as { error?: { code?: unknown } }).error?.code
      : undefined;
  if (status === 503 && code === "plans_unavailable") return { kind: "paused" };
  return { kind: "failed" };
}

export function GuestPage() {
  /*
    `undefined` on the server and through hydration, where there is no
    fragment to read; the token, or null for none, once in the browser.
  */
  const token = useSyncExternalStore<string | null | undefined>(
    subscribe,
    readToken,
    () => undefined,
  );
  const [attempt, setAttempt] = useState(0);
  const [answer, setAnswer] = useState<{
    token: string;
    attempt: number;
    shown: Shown;
  } | null>(null);

  // Back from sign-in: the kept token goes back after the `#`.
  useEffect(() => {
    if (token) restoreFragment(token);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    callGuestRoute("view", { token }, controller.signal).then(
      ({ status, body }) =>
        setAnswer({ token, attempt, shown: shownFor(status, body) }),
      () => {
        if (!controller.signal.aborted) {
          setAnswer({ token, attempt, shown: { kind: "failed" } });
        }
      },
    );
    return () => controller.abort();
  }, [token, attempt]);

  if (token === undefined) return null;
  // No token, or not one: nothing to ask, and nothing to report.
  if (token === null) {
    return <GuestStop kind="not-working" token={null} onRetry={() => {}} />;
  }

  const shown =
    answer?.token === token && answer.attempt === attempt ? answer.shown : null;
  if (shown === null) {
    return (
      <p
        role="status"
        className="text-forest/70 text-body py-16 text-center text-pretty"
      >
        {guestWords.loading}
      </p>
    );
  }

  if (shown.kind === "plan") {
    // Only ever taken by `readToken`, from an address with no fragment.
    const arrival = arrivalTaken();
    return (
      <GuestPlan
        key={token}
        token={token}
        plan={shown.plan}
        linkOnArrival={
          arrival !== null && arrival.token === token && arrival.link
        }
      />
    );
  }

  return (
    <GuestStop
      key={token}
      kind={shown.kind}
      token={token}
      onRetry={() => setAttempt((n) => n + 1)}
    />
  );
}

/**
 * The page when there is no plan to draw: its line in an alert that takes
 * focus by script once drawn, and the one way on from it.
 */
function GuestStop({
  kind,
  token,
  onRetry,
}: {
  kind: "not-working" | "paused" | "failed";
  /** The token when it was well formed, so the plan can still be reported. */
  token: string | null;
  onRetry: () => void;
}) {
  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    alertRef.current?.focus();
  }, [kind]);

  /*
    Reporting needs only the token: the page never learned the plan, so
    there are no names to offer and the report is about the plan itself.
    Made once, as the plan page's actions are.
  */
  const [actions] = useState(() =>
    token
      ? guestActions({
          token,
          current: () => null,
          firstName: () => "",
          signedIn: () => false,
          onPlan: () => {},
          onNameRefused: () => {},
        })
      : null,
  );

  const heading = kind === "paused" ? planWords.paused : planWords.pageTitle;
  const line =
    kind === "not-working"
      ? planWords.linkNotWorking
      : kind === "paused"
        ? planWords.pausedNext
        : guestWords.loadFailed;

  return (
    <div className="py-16 text-center">
      <div ref={alertRef} role="alert" tabIndex={-1} className="outline-none">
        <h1 className="font-display tracking-display leading-display text-3xl text-balance">
          {heading}
        </h1>
        <p className="text-forest/70 text-body mx-auto mt-3 max-w-sm text-pretty">
          {line}
        </p>
      </div>
      {kind === "not-working" ? (
        actions ? (
          <PlanReport
            plan={NO_PEOPLE}
            report={actions.report}
            label={planWords.reportPlan}
          />
        ) : null
      ) : (
        <Button className="mt-6" onClick={onRetry}>
          {guestWords.tryAgain}
        </Button>
      )}
    </div>
  );
}

const NO_PEOPLE: Pick<PlanView, "people"> = { people: [] };

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/**
 * The token after the `#`; with nothing there, the one kept for the way
 * back from sign-in, if this tab kept one. A fragment that is there but is
 * not a token is null: it is never swapped for the kept one.
 */
function readToken(): string | null {
  const hash = window.location.hash;
  if (hash !== "" && hash !== "#") return guestTokenFromHash(hash);
  return takeArrival()?.token ?? null;
}
