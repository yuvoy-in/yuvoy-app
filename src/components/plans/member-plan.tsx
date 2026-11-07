"use client";

import { useMemo } from "react";
import { createProxyClient } from "@/lib/api/client";
import {
  planActionFromAnswer,
  planActionFromThrown,
} from "@/lib/plans/action-result";
import type { PlanActions, PlanView } from "@/lib/plans/types";
import { PlanViewScreen } from "./plan-view";

/**
 * The signed-in plan page's half in the browser (yuvoy-app#193): the plan the
 * server read, and the three things a member can do to it, through this
 * app's proxy with the session from the cookie.
 *
 * The proxy client throws a `YuvoyError` on any answer that is not ok and
 * never retries a write, so a reply that timed out is reported as not sent
 * rather than sent twice. Both kinds of throw, and the bodiless 204 and 202,
 * come out as one `PlanActionResult`.
 */
export function MemberPlan({ plan }: { plan: PlanView }) {
  const actions = useMemo<PlanActions>(() => {
    const id = plan.id;
    const params = { params: { path: { id } } };
    return {
      async reply(body) {
        try {
          const { data, response } = await createProxyClient().PUT(
            "/plans/{id}/reply",
            { ...params, body },
          );
          return planActionFromAnswer(response.status, data);
        } catch (error) {
          return planActionFromThrown(error);
        }
      },
      async leave() {
        try {
          const { response } = await createProxyClient().DELETE(
            "/plans/{id}/reply",
            params,
          );
          return planActionFromAnswer(response.status, undefined);
        } catch (error) {
          return planActionFromThrown(error);
        }
      },
      async report(body) {
        try {
          const { response } = await createProxyClient().POST(
            "/plans/{id}/reports",
            { ...params, body },
          );
          return planActionFromAnswer(response.status, undefined);
        } catch (error) {
          return planActionFromThrown(error);
        }
      },
    };
  }, [plan.id]);

  return (
    <PlanViewScreen plan={plan} actions={actions} mode="member" signedIn />
  );
}
