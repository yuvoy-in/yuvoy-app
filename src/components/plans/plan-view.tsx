"use client";

import { useState, type ReactNode } from "react";
import type { PlanActions, PlanView } from "@/lib/plans/types";
import { planWords, stateLine } from "@/lib/plans/words";
import { Panel } from "@/components/ui/panel";
import { PlanHeading } from "./plan-heading";
import { PlanLeave } from "./plan-leave";
import { PlanPeople } from "./plan-people";
import { PlanReport } from "./plan-report-sheet";
import { PlanReplyForm } from "./plan-reply-form";

export type {
  PlanActionResult,
  PlanActions,
  PlanReplyBody,
  PlanReportBody,
  PlanView,
} from "@/lib/plans/types";

/**
 * One plan, as a person on it reads and answers it: the signed-in page at
 * `/plans/{id}` (yuvoy-app#193, `mode: "member"`) and the guest page at
 * `/p/#<token>` (yuvoy-mobile#373, `mode: "guest"`).
 *
 * ## The view knows nothing about how it reaches the API
 *
 * Every action comes in through `actions`, so the two pages differ only in
 * what they hand it: the signed-in page its own proxy with the session, the
 * guest page its route handlers with the guest key. The view reads the
 * answer the same way for both (`PlanActionResult`).
 *
 * ## What the guest page adds
 *
 * `formExtras` is drawn inside the reply form, above the button: the guest's
 * first name on a first reply. Whatever it holds, the guest page's own
 * `actions.reply` adds to the body, so this view never learns about it.
 * `footer` is drawn under everything: who sees the reply, how long it is
 * kept, the reminder offer, the safety line.
 *
 * ## Not built here
 *
 * The planner's tools (change, pick, costs, the link, cancel) are a later
 * part. A planner reading their own plan sees it as a member does, without
 * Leave, which the API would refuse them anyway.
 *
 * The plan on screen is the one the last answer carried: a reply's answer is
 * the plan, so nothing is read again after one.
 */
export function PlanViewScreen({
  plan: first,
  actions,
  mode,
  signedIn,
  formExtras,
  extraFields,
  footer,
}: {
  plan: PlanView;
  actions: PlanActions;
  mode: "member" | "guest";
  signedIn: boolean;
  /** The guest page's fields inside the reply form (Part C). */
  formExtras?: ReactNode;
  /** The `invalid_input` fields `formExtras` draws its own line for. */
  extraFields?: readonly string[];
  /** The guest page's lines under the plan (Part C). */
  footer?: ReactNode;
}) {
  const [plan, setPlan] = useState(first);
  const [gone, setGone] = useState<"left" | "unavailable" | null>(null);

  if (gone) {
    const line =
      gone === "left"
        ? mode === "guest"
          ? planWords.replyRemoved
          : planWords.left
        : planWords.closed;
    return (
      <div role="status" className="py-16 text-center">
        <p className="font-display tracking-display leading-display text-2xl text-balance">
          {line}
        </p>
      </div>
    );
  }

  const ending = stateLine(plan);
  const canLeave = plan.role !== "planner" && plan.me !== undefined;

  return (
    <article>
      <PlanHeading plan={plan} />

      {ending ? (
        <Panel tone="outline" className="mt-6">
          <p>{ending}</p>
        </Panel>
      ) : null}

      <PlanReplyForm
        plan={plan}
        actions={actions}
        signedIn={signedIn}
        formExtras={formExtras}
        extraFields={extraFields}
        onPlan={setPlan}
        onGone={() => setGone("unavailable")}
      />

      <PlanPeople plan={plan} />

      <div className="mt-8 flex flex-col items-start">
        {canLeave ? (
          <PlanLeave
            plan={plan}
            actions={actions}
            mode={mode}
            onGone={() => setGone("left")}
          />
        ) : null}
        {actions.report ? (
          <PlanReport
            plan={plan}
            report={actions.report}
            label={
              mode === "guest" ? planWords.reportPlan : planWords.reportProblem
            }
            onGone={() => setGone("unavailable")}
          />
        ) : null}
      </div>

      {footer}
    </article>
  );
}
