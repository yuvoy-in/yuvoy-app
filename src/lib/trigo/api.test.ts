import { describe, it, expect, afterEach, vi } from "vitest";
import { NetworkError, YuvoyError } from "@/lib/api/errors";
import { StalledError } from "@/lib/api/deadline";
import {
  classifyAgeError,
  classifyTrigoError,
  mergeBySeq,
  type TrigoMessage,
} from "./api";

afterEach(() => {
  vi.restoreAllMocks();
});

function msg(seq: number, text = `message ${seq}`): TrigoMessage {
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    seq,
    role: seq % 2 === 1 ? "traveller" : "trigo",
    text,
    createdAt: "2026-11-02T04:30:00Z",
    cards: [],
    handoffOffer: false,
    removed: false,
  };
}

function apiError(
  status: number,
  code: string,
  message = "A sentence from the API.",
  details?: Record<string, unknown>,
) {
  return new YuvoyError({ status, code, message, details });
}

describe("mergeBySeq", () => {
  it("keeps each seq once, the later copy winning", () => {
    const merged = mergeBySeq([msg(1), msg(2, "old")], [msg(2, "new"), msg(3)]);
    expect(merged.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(merged[1].text).toBe("new");
  });

  it("keeps a full read's fresh copy of a message already held", () => {
    const held = { ...msg(2), text: "a card, proposed" };
    const fresh = { ...msg(2), text: "a card, used" };
    const merged = mergeBySeq([msg(1), held, msg(3)], [fresh, msg(3)]);
    expect(merged.map((m) => m.text)).toEqual([
      "message 1",
      "a card, used",
      "message 3",
    ]);
  });

  it("orders by seq, whatever order the two lists came in", () => {
    const merged = mergeBySeq([msg(5), msg(3)], [msg(4), msg(1)]);
    expect(merged.map((m) => m.seq)).toEqual([1, 3, 4, 5]);
  });

  it("handles empty lists", () => {
    expect(mergeBySeq([], [])).toEqual([]);
    expect(mergeBySeq([msg(1)], []).map((m) => m.seq)).toEqual([1]);
    expect(mergeBySeq([], [msg(2)]).map((m) => m.seq)).toEqual([2]);
  });
});

describe("classifyTrigoError", () => {
  it("reads each refusal by status and code", () => {
    expect(classifyTrigoError(apiError(401, "unauthorized"))).toEqual({
      kind: "signed_out",
    });
    expect(
      classifyTrigoError(
        apiError(404, "not_found", "Trigo isn't open to your account yet."),
      ),
    ).toEqual({
      kind: "not_released",
      message: "Trigo isn't open to your account yet.",
    });
    expect(
      classifyTrigoError(apiError(403, "adult_confirmation_required")),
    ).toEqual({ kind: "age" });
    expect(
      classifyTrigoError(
        apiError(409, "consent_required", "x", { noticeVersion: "2026-11-r5" }),
      ),
    ).toEqual({ kind: "consent", noticeVersion: "2026-11-r5" });
    expect(classifyTrigoError(apiError(409, "consent_required"))).toEqual({
      kind: "consent",
      noticeVersion: null,
    });
    expect(classifyTrigoError(apiError(409, "turn_in_progress"))).toEqual({
      kind: "in_progress",
    });
    expect(
      classifyTrigoError(apiError(409, "idempotency_in_progress")),
    ).toEqual({ kind: "idempotency_in_progress" });
    expect(
      classifyTrigoError(
        apiError(429, "daily_limit_reached", "Used up.", {
          resetsAt: "2026-11-02T18:30:00Z",
        }),
      ),
    ).toEqual({
      kind: "limit",
      resetsAt: "2026-11-02T18:30:00Z",
      message: "Used up.",
    });
    expect(
      classifyTrigoError(apiError(429, "rate_limited", "Slow down.")),
    ).toEqual({ kind: "rate_limited", message: "Slow down." });
    expect(
      classifyTrigoError(apiError(503, "unavailable", "Trigo is busy.")),
    ).toEqual({ kind: "busy", message: "Trigo is busy." });
  });

  it("reads anything else as a failure", () => {
    expect(classifyTrigoError(apiError(409, "idempotency_key_reuse"))).toEqual({
      kind: "failure",
    });
    expect(classifyTrigoError(apiError(500, "internal"))).toEqual({
      kind: "failure",
    });
    expect(classifyTrigoError(new Error("boom"))).toEqual({ kind: "failure" });
    expect(classifyTrigoError(undefined)).toEqual({ kind: "failure" });
  });

  it("never reads the message: the same code with other words is the same kind", () => {
    expect(
      classifyTrigoError(
        apiError(409, "turn_in_progress", "Trigo is busy. Try again later."),
      ),
    ).toEqual({ kind: "in_progress" });
    expect(
      classifyTrigoError(
        apiError(
          409,
          "conflict",
          "Trigo is still answering your last message.",
        ),
      ),
    ).toEqual({ kind: "failure" });
  });

  it("reads a request that never arrived as offline, and a stalled one as a failure", () => {
    expect(classifyTrigoError(new NetworkError())).toEqual({ kind: "offline" });
    expect(
      classifyTrigoError(new NetworkError(undefined, new StalledError(30_000))),
    ).toEqual({ kind: "failure" });
  });

  it("reads anything as offline while the browser says it is", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(classifyTrigoError(apiError(503, "unavailable"))).toEqual({
      kind: "offline",
    });
  });
});

describe("classifyAgeError", () => {
  it("reads each refusal of PUT /me/age by status and code", () => {
    expect(
      classifyAgeError(
        apiError(400, "invalid_input", "x", { birthdayPassed: "required" }),
      ),
    ).toEqual({ kind: "need_birthday" });
    expect(
      classifyAgeError(apiError(403, "under_age_sign_up", "Closed.")),
    ).toEqual({ kind: "under_age", message: "Closed." });
    expect(classifyAgeError(apiError(409, "age_locked", "Locked."))).toEqual({
      kind: "locked",
      message: "Locked.",
    });
    expect(classifyAgeError(apiError(401, "unauthorized"))).toEqual({
      kind: "signed_out",
    });
  });

  it("reads anything else as a failure", () => {
    expect(
      classifyAgeError(apiError(400, "invalid_input", "x", { birthYear: "x" })),
    ).toEqual({ kind: "failure" });
    expect(classifyAgeError(new NetworkError())).toEqual({ kind: "failure" });
  });
});
