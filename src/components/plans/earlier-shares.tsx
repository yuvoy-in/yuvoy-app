"use client";

import { useState } from "react";
import {
  earlierPayee,
  earlierWeeks,
  paidForWeek,
} from "@/lib/plans/earlier-shares";
import { planMoment, rupees } from "@/lib/plans/format";
import type { GuestActions } from "@/lib/plans/guest-actions";
import { guestWords } from "@/lib/plans/guest-words";
import type { PlanView } from "@/lib/plans/types";
import { planWords, refusalLine } from "@/lib/plans/words";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { UpiPayPanel } from "./upi-pay-panel";

/**
 * A member's unsettled shares on earlier weeks of a weekly plan, to mark
 * paid from here (yuvoy-mobile#373 case 11). Drawn whatever this week's
 * plan is doing: a started or closed plan still has last week's money owed.
 *
 * ## Paying one
 *
 * `UpiPayPanel` with the share's OWN payee, never this week's `plan.payee`:
 * the panel's check (`checkedPayLink`) then holds the link to that week's
 * UPI ID and that share's amount (see `lib/plans/earlier-shares.ts`). The
 * contract sends no payee with an earlier share today, so the panel says
 * who to ask and draws no button; a payee the API adds later is checked
 * like any other.
 *
 * ## Marking one paid
 *
 * One button per share, a paid-only reply of that week's complete set
 * (`paidForWeek`), and nothing of this week's. The answer is this week's
 * plan with the share marked; a refusal says why under the share.
 */
export function EarlierShares({
  plan,
  actions,
}: {
  plan: PlanView;
  actions: GuestActions;
}) {
  const [sending, setSending] = useState<string | null>(null);
  const [problem, setProblem] = useState<{ costId: string; line: string } | null>(
    null,
  );
  const weeks = earlierWeeks(plan.earlierShares);
  if (weeks.length === 0) return null;

  async function markPaid(costId: string) {
    if (sending) return;
    const paid = paidForWeek(plan.earlierShares, costId);
    if (paid.length === 0) return;
    setSending(costId);
    setProblem(null);
    try {
      const result = await actions.payEarlier(paid);
      if (result.kind === "refused") {
        setProblem({ costId, line: refusalLine(result, plan.planner.name) });
      } else if (result.kind === "gone") {
        setProblem({ costId, line: planWords.closed });
      }
    } finally {
      setSending(null);
    }
  }

  return (
    <section aria-labelledby="plan-earlier-weeks">
      <h2
        id="plan-earlier-weeks"
        className="font-display tracking-display leading-display text-2xl text-balance"
      >
        {guestWords.earlierWeeks}
      </h2>
      <ul className="mt-4 space-y-4">
        {weeks.flatMap((week) =>
          week.shares.map((share) => {
            const payee = earlierPayee(share);
            const when = planMoment(share.startsAt, plan.timeZone) ?? "";
            return (
              <li key={share.costId}>
                <Panel tone="outline">
                  <p className="text-pretty">
                    {guestWords.earlierShare(
                      when,
                      share.label,
                      rupees(share.amountMinor),
                      share.paidBy,
                    )}
                  </p>
                  {share.paidMarked ? (
                    <p className="mt-2 text-sm">{guestWords.markedPaid}</p>
                  ) : (
                    <>
                      <UpiPayPanel
                        share={share.amountMinor}
                        payLink={share.payLink}
                        payee={payee}
                        payer={share.paidBy}
                      />
                      <Button
                        variant="outline"
                        className="mt-4"
                        pending={sending === share.costId}
                        pendingLabel={planWords.sending}
                        onClick={() => void markPaid(share.costId)}
                      >
                        {guestWords.markPaid}
                      </Button>
                    </>
                  )}
                  {problem?.costId === share.costId ? (
                    <p role="alert" className="text-terra-deep mt-2 text-sm text-pretty">
                      {problem.line}
                    </p>
                  ) : null}
                </Panel>
              </li>
            );
          }),
        )}
      </ul>
    </section>
  );
}
