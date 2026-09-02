import { describe, it, expect, vi, afterEach } from "vitest";
import {
  VerificationTokenError,
  readToken,
  verificationMeta,
} from "./verification";

/**
 * A verification token that is wrong fails invisibly: the owner presses Verify
 * in Search Console, is told no, and nothing anywhere says why. So the rule is
 * absent-is-silent, present-and-malformed-is-loud, and these pin both.
 */
const GOOGLE = "abcDEF123456789_-abcDEF123456789_-abcDEF12";
const BING = "0123456789ABCDEF0123456789ABCDEF";

afterEach(() => vi.unstubAllEnvs());

describe("reading a token", () => {
  it("accepts a plain token, and trims what a paste brings with it", () => {
    expect(readToken("X", GOOGLE)).toBe(GOOGLE);
    expect(readToken("X", `  ${GOOGLE}  `)).toBe(GOOGLE);
    expect(readToken("X", `"${GOOGLE}"`)).toBe(GOOGLE);
    expect(readToken("X", `'${GOOGLE}'`)).toBe(GOOGLE);
  });

  it("treats absent and empty the same, and says nothing", () => {
    // `??` does not catch an empty string, and a dashboard variable created
    // with no value is the easiest mistake there is to make.
    expect(readToken("X", undefined)).toBeUndefined();
    expect(readToken("X", "")).toBeUndefined();
    expect(readToken("X", "   ")).toBeUndefined();
  });

  it("names the mistake when the whole meta tag was pasted", () => {
    expect(() =>
      readToken(
        "GOOGLE_SITE_VERIFICATION",
        `<meta name="google-site-verification" content="${GOOGLE}" />`,
      ),
    ).toThrow(/only the value of the content attribute/);
  });

  it("names the mistake when the DNS TXT form was pasted", () => {
    // The other half of the same confusion: Google shows both, and the DNS one
    // is the one on screen when somebody chooses the DNS method and then
    // cannot get it into their registrar.
    expect(() =>
      readToken(
        "GOOGLE_SITE_VERIFICATION",
        `google-site-verification=${GOOGLE}`,
      ),
    ).toThrow(/belongs in DNS/);
  });

  it("refuses two values in one variable", () => {
    expect(() => readToken("X", `${GOOGLE} ${BING}`)).toThrow(
      VerificationTokenError,
    );
  });

  it("refuses characters no token uses, without pinning a length", () => {
    /*
      A character-set check rather than a length check: neither provider
      documents its length as stable, and pinning one would fail the day a
      provider adds a character. The alphabet catches the paste mistakes,
      which are the failures that actually happen.
    */
    expect(() => readToken("X", "abc$def")).toThrow(VerificationTokenError);
    expect(readToken("X", "a")).toBe("a");
    expect(readToken("X", "a".repeat(200))).toBe("a".repeat(200));
  });

  it("describes the shape rather than echoing the value", () => {
    // A build log may redact the value. Shape survives redaction.
    try {
      readToken("X", "abc$def");
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("length 7");
      expect((err as Error).message).toContain("$");
    }
  });
});

describe("the metadata block", () => {
  it("is undefined when nothing is configured", () => {
    /*
      Not `{}`. Next renders nothing for either, but an empty object reads in
      the source like something is set up — and most deployments here (previews,
      local, the operator portal) verify nothing at all.
    */
    expect(verificationMeta({})).toBeUndefined();
  });

  it("emits Google's field and Bing's odd meta name", () => {
    expect(
      verificationMeta({
        GOOGLE_SITE_VERIFICATION: GOOGLE,
        BING_SITE_VERIFICATION: BING,
      }),
    ).toEqual({ google: GOOGLE, other: { "msvalidate.01": BING } });
  });

  it("emits one without requiring the other", () => {
    expect(verificationMeta({ GOOGLE_SITE_VERIFICATION: GOOGLE })).toEqual({
      google: GOOGLE,
    });
    expect(verificationMeta({ BING_SITE_VERIFICATION: BING })).toEqual({
      other: { "msvalidate.01": BING },
    });
  });
});

describe("verification and indexing are independent", () => {
  it("still verifies while the site is noindex", async () => {
    /*
      The load-bearing one. You verify a property BEFORE it is indexable —
      that is how the owner sees crawl and coverage problems ahead of launch
      rather than after it. Coupling this to INDEXABLE is the sort of tidying
      somebody does in good faith, and it would silently un-verify the property
      the moment the flag was off.
    */
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_ALLOW_INDEXING", "false");
    vi.stubEnv("GOOGLE_SITE_VERIFICATION", GOOGLE);

    const { INDEXABLE } = await import("./indexing");
    const { verificationMeta: live } = await import("./verification");

    expect(INDEXABLE).toBe(false);
    expect(live()).toEqual({ google: GOOGLE });
  });
});
