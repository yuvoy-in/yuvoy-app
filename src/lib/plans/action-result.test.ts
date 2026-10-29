import { describe, it, expect } from "vitest";
import { NetworkError, YuvoyError } from "@/lib/api/errors";
import { planActionFromAnswer, planActionFromThrown } from "./action-result";

const plan = { id: "p1", times: [], title: "Board games" };
const envelope = (code: string, message: string, details?: object) => ({
  error: { code, message, details, requestId: "req_1" },
});

describe("planActionFromAnswer", () => {
  it("hands back the plan the API answered", () => {
    expect(planActionFromAnswer(200, plan)).toEqual({ kind: "ok", plan });
  });

  it("never passes a guest key on to the view", () => {
    const result = planActionFromAnswer(201, { ...plan, guestKey: "gk_secret" });
    expect(result).toEqual({ kind: "ok", plan });
    expect(JSON.stringify(result)).not.toContain("gk_secret");
  });

  it("reads 202 as sent and 204 and 404 as gone", () => {
    expect(planActionFromAnswer(202, undefined)).toEqual({ kind: "sent" });
    expect(planActionFromAnswer(204, undefined)).toEqual({ kind: "gone" });
    expect(
      planActionFromAnswer(404, envelope("not_found", "Not found.")),
    ).toEqual({ kind: "gone" });
  });

  it("does not call a 200 with no plan in it a success", () => {
    expect(planActionFromAnswer(200, {})).toMatchObject({ kind: "refused" });
  });

  it("reads details.reason as the reason", () => {
    expect(
      planActionFromAnswer(
        409,
        envelope("plan_closed", "Replies are closed.", { reason: "started" }),
      ),
    ).toEqual({
      kind: "refused",
      code: "plan_closed",
      reason: "started",
      message: "Replies are closed.",
    });
  });

  it("reads a field refusal as the field and its sentence", () => {
    expect(
      planActionFromAnswer(
        400,
        envelope("invalid_input", "Check the form.", {
          adult: "Tick to say you are 18 or over.",
        }),
      ),
    ).toEqual({
      kind: "refused",
      code: "invalid_input",
      reason: "adult",
      message: "Tick to say you are 18 or over.",
    });
  });

  it("refuses a body that is not an envelope", () => {
    expect(planActionFromAnswer(502, "Bad Gateway")).toMatchObject({
      kind: "refused",
      code: "internal_error",
    });
  });
});

describe("planActionFromThrown", () => {
  it("reads the proxy client's YuvoyError", () => {
    const error = new YuvoyError({
      code: "conflict",
      message: "The planner cannot leave.",
      status: 409,
      details: { reason: "planner_leaves" },
    });
    expect(planActionFromThrown(error)).toEqual({
      kind: "refused",
      code: "conflict",
      reason: "planner_leaves",
      message: "The planner cannot leave.",
    });
  });

  it("reads a 404 as gone", () => {
    const error = new YuvoyError({ code: "not_found", message: "x", status: 404 });
    expect(planActionFromThrown(error)).toEqual({ kind: "gone" });
  });

  it("reads no answer as network, never as sent", () => {
    expect(planActionFromThrown(new NetworkError())).toMatchObject({
      kind: "refused",
      code: "network",
    });
    expect(planActionFromThrown(new TypeError("fetch failed"))).toMatchObject({
      kind: "refused",
      code: "network",
    });
  });
});
