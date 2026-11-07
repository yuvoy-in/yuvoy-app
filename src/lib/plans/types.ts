import type { components } from "@/lib/api/schema.gen";

/**
 * The shapes both plan pages share: the signed-in page at `/plans/{id}`
 * (yuvoy-app#193) and the guest page at `/p/#<token>` (yuvoy-mobile#373).
 *
 * In a module with no `"use client"`, so a route handler or a Server
 * Component can import them without crossing a client boundary. The plan
 * components re-export them for the pages that import from there.
 */

/** One plan, as `getPlan` and `getPlanByLink` answer it. */
export type PlanView = components["schemas"]["PlanView"];

/**
 * A reply. `replyToMyPlan` and `replyByLink` take the same `PlanReply`
 * schema, so there is no common part to cut out: the guest page adds `name`
 * and `adult` on a first reply, and the signed-in page sends `adult` only for
 * a member Yuvoy holds no age for.
 */
export type PlanReplyBody = components["schemas"]["PlanReply"];

/** A report. `reportPlan` and `reportPlanByLink` take the same `PlanReport`. */
export type PlanReportBody = components["schemas"]["PlanReport"];

export type PlanAnswer = components["schemas"]["PlanAnswer"];
export type PlanTime = components["schemas"]["PlanTime"];
export type PlanIdea = components["schemas"]["PlanIdea"];
export type PlanItem = components["schemas"]["PlanItem"];
export type PlanCost = components["schemas"]["PlanCost"];
export type PlanPerson = components["schemas"]["PlanPerson"];
export type PlanPayee = components["schemas"]["PlanPayee"];

/**
 * What one action came to.
 *
 * - `ok`: the API answered the fresh plan, which replaces the one on screen.
 *   Never re-read on success: the answer IS the plan.
 * - `sent`: a report was taken (`202`, no body). Nothing about the plan
 *   changed, so there is no plan to hand back. Not in the first draft of this
 *   interface, which had only `ok`, and `ok` needs a plan a report never has.
 * - `gone`: `204` after leaving, or `404`: the plan is not there for this
 *   reader any more (left, removed, purged, or plans closed to them).
 * - `refused`: the API's error envelope, read. `code` is the API's code, or
 *   `network` when nothing answered; `reason` is `details.reason` where the
 *   API sends one (`started`, `planner_leaves`, `nonce`), else for
 *   `invalid_input` the field it named (`adult`, `personName`); `message` is
 *   the API's own sentence (for a field, the field's).
 */
export type PlanActionResult =
  | { kind: "ok"; plan: PlanView }
  | { kind: "sent" }
  | { kind: "gone" }
  | { kind: "refused"; code: string; reason?: string; message: string };

/**
 * Everything a reader can do on a plan, handed in from outside, so the one
 * plan view serves both pages: the signed-in page calls its own proxy
 * (`/api/v1/plans/{id}/...`), the guest page its route handlers
 * (`/p/api/...`). The view never knows which.
 */
export interface PlanActions {
  /** Answers, claims and paid marks: one whole reply, one request. */
  reply(body: PlanReplyBody): Promise<PlanActionResult>;
  /** Leave the plan, or remove a guest's reply. */
  leave(): Promise<PlanActionResult>;
  /** Report the plan or somebody on it. Absent: no report control is drawn. */
  report?(body: PlanReportBody): Promise<PlanActionResult>;
}
