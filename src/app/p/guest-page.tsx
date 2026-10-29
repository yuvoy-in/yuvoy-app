"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { guestTokenFromHash } from "@/lib/plans/guest-token";
import { callGuestRoute } from "@/lib/plans/guest-calls";
import type { components } from "@/lib/api/schema.gen";

type PlanView = components["schemas"]["PlanView"];

/**
 * PLACEHOLDER for the guest page (yuvoy-mobile#373). It proves the server
 * side end to end and nothing more: it reads the token, checks its shape,
 * asks `/p/api/view`, and shows the plan's title and who invited the reader,
 * or the line for a link that is not working, for paused plans, or for no
 * answer. The real page, with replies, the bring list, costs and the
 * footer, is built on the shared plan view and replaces this file.
 *
 * Its words are the issue's drafts and wait on copy approval like the rest;
 * when the page is built they move to the shared plan words.
 *
 * Two rules it already keeps, because the real page must:
 *
 *   - **It never writes `location.hash`.** The fragment IS the token, and an
 *     anchor or a `replaceState` that touched it would lose the plan.
 *   - **A token of the wrong shape, or none, costs no request.** The "not
 *     working" line is shown straight away (the issue's case 2).
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

const NOT_WORKING =
  "This plan link is not working. It may have expired, or the person who made the plan may have made a new one. Ask whoever sent it to you for a fresh link.";

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
  const [answer, setAnswer] = useState<{ token: string; shown: Shown } | null>(
    null,
  );

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    callGuestRoute("view", { token }, controller.signal).then(
      ({ status, body }) => setAnswer({ token, shown: shownFor(status, body) }),
      () => {
        if (!controller.signal.aborted) {
          setAnswer({ token, shown: { kind: "failed" } });
        }
      },
    );
    return () => controller.abort();
  }, [token]);

  if (token === undefined) return null;

  const shown: Shown | null =
    token === null
      ? { kind: "not-working" }
      : answer?.token === token
        ? answer.shown
        : null;

  return (
    <div className="stage flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      {shown === null ? (
        <p role="status" className="text-paper/70 text-body text-pretty">
          Loading the plan
        </p>
      ) : shown.kind === "plan" ? (
        <>
          <p className="eyebrow text-terra-soft">
            {`${shown.plan.planner.name} invited you`}
          </p>
          <h1 className="font-display tracking-display text-paper leading-display mt-4 text-3xl text-balance">
            {shown.plan.title}
          </h1>
        </>
      ) : (
        <>
          <h1 className="font-display tracking-display text-paper leading-display text-3xl text-balance">
            A plan on Yuvoy
          </h1>
          <p
            role="alert"
            className="text-paper/70 text-body mt-3 max-w-sm text-pretty"
          >
            {shown.kind === "not-working"
              ? NOT_WORKING
              : shown.kind === "paused"
                ? "Plans are paused for a moment. Try again later."
                : "We could not load this plan. Check your connection and open the link again."}
          </p>
        </>
      )}
    </div>
  );
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function readToken(): string | null {
  return guestTokenFromHash(window.location.hash);
}
