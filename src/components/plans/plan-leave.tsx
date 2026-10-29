"use client";

import { useState } from "react";
import type { PlanActions, PlanView } from "@/lib/plans/types";
import { planWords, refusalLine } from "@/lib/plans/words";
import { Button } from "@/components/ui/button";
import { Sheet, SheetPresence } from "@/components/ui/sheet";

/**
 * Leaving a plan, or for a guest removing their reply (yuvoy-app#193,
 * yuvoy-mobile#373).
 *
 * Asked twice, because it cannot be undone from here: the reply, the claims
 * and the paid marks go, and the items are freed for others. The sheet says
 * exactly that before anything is sent.
 *
 * Never offered to the planner, who cancels the plan instead (a planner tool,
 * not built yet); the API refuses the planner with `409 planner_leaves` in
 * any case, and that refusal is drawn too, so a planner who reaches this some
 * other way is told what to do.
 */
export function PlanLeave({
  plan,
  actions,
  mode,
  onGone,
}: {
  plan: PlanView;
  actions: PlanActions;
  mode: "member" | "guest";
  onGone: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const label = mode === "guest" ? planWords.removeReply : planWords.leavePlan;

  async function leave() {
    if (leaving) return;
    setLeaving(true);
    setRefused(null);
    try {
      const result = await actions.leave();
      if (result.kind === "gone" || result.kind === "ok") {
        setAsking(false);
        onGone();
      } else if (result.kind === "refused") {
        setRefused(refusalLine(result, plan.planner.name));
      }
    } finally {
      setLeaving(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        className="mt-6"
        onClick={() => {
          setRefused(null);
          setAsking(true);
        }}
      >
        {label}
      </Button>
      <SheetPresence open={asking}>
        <Sheet
          open={asking}
          onClose={() => setAsking(false)}
          title={label}
          footer={
            <div className="flex flex-col gap-2">
              <Button
                block
                size="lg"
                pending={leaving}
                pendingLabel={planWords.sending}
                onClick={() => void leave()}
              >
                {label}
              </Button>
              <Button
                block
                size="lg"
                variant="outline"
                onClick={() => setAsking(false)}
              >
                {planWords.keepReply}
              </Button>
            </div>
          }
        >
          <p className="text-body text-pretty">{planWords.leaveWarning}</p>
          {refused ? (
            <p role="alert" className="text-terra-deep mt-3 text-sm">
              {refused}
            </p>
          ) : null}
        </Sheet>
      </SheetPresence>
    </>
  );
}
