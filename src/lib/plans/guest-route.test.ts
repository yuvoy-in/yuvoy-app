import { describe, it, expect } from "vitest";
import type { UpstreamResult } from "@/lib/auth/upstream";
import { takeGuestKey } from "./guest-route";

/**
 * `takeGuestKey` (yuvoy-mobile#373): a first reply's key comes out of the
 * API's answer before anything else reads the answer, so what the page is
 * sent, and the action result it makes, never had a key in it.
 */

const KEY = `ypk_${"K".repeat(40)}b-_`;

function answer(status: number, body: unknown): UpstreamResult {
  const text = body === undefined ? "" : JSON.stringify(body);
  return {
    status,
    body,
    text,
    requestId: "01JPLN00001",
    idempotentReplay: false,
    apiDate: null,
  };
}

describe("takeGuestKey", () => {
  it("takes the key out of the body and the text, and hands it back", () => {
    const { result, guestKey } = takeGuestKey(
      answer(201, { id: "p", seriesId: "s", guestKey: KEY }),
    );
    expect(guestKey).toBe(KEY);
    expect(result.body).toEqual({ id: "p", seriesId: "s" });
    expect(result.text).not.toContain("ypk_");
    expect(result.text).not.toContain("guestKey");
    expect(result.status).toBe(201);
    expect(result.requestId).toBe("01JPLN00001");
  });

  it("still takes out a key of the wrong shape, and hands back none", () => {
    const { result, guestKey } = takeGuestKey(answer(201, { id: "p", guestKey: "x" }));
    expect(guestKey).toBeNull();
    expect(result.text).not.toContain("guestKey");
  });

  it("leaves an answer with no key exactly as it was", () => {
    for (const sent of [
      answer(200, { id: "p" }),
      answer(204, undefined),
      answer(409, { error: { code: "conflict", message: "x" } }),
      answer(200, [1, 2]),
    ]) {
      const { result, guestKey } = takeGuestKey(sent);
      expect(result).toBe(sent);
      expect(guestKey).toBeNull();
    }
  });
});
