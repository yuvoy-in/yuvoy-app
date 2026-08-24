import { describe, it, expect } from "vitest";
import { scrubUrl, scrubDeep } from "./scrub";

/**
 * The token is unrecoverable — not by us, not by the traveller, not by
 * support. Leaking it to an analytics vendor hands somebody else's booking to
 * whoever reads that dashboard.
 */
describe("scrubUrl", () => {
  it("redacts the token from a booking URL", () => {
    expect(scrubUrl("https://yuvoy.in/booking#t=secrettoken123")).toBe(
      "https://yuvoy.in/booking#t=[redacted]",
    );
  });

  it("redacts the whole fragment, not just the token parameter", () => {
    // A partially-scrubbed fragment invites a second secret beside the first.
    expect(scrubUrl("/booking#t=abc&ref=YV-123")).toBe("/booking#t=[redacted]");
  });

  it("leaves an innocent fragment alone", () => {
    expect(scrubUrl("https://yuvoy.in/explore#destinations")).toBe(
      "https://yuvoy.in/explore#destinations",
    );
  });

  it("leaves a URL with no fragment alone", () => {
    expect(scrubUrl("https://yuvoy.in/e/try-dive?from=feed")).toBe(
      "https://yuvoy.in/e/try-dive?from=feed",
    );
  });

  it("handles empty and non-string input without throwing", () => {
    expect(scrubUrl("")).toBe("");
    // @ts-expect-error — deliberately wrong type; loggers pass anything.
    expect(scrubUrl(undefined)).toBeUndefined();
  });
});

describe("scrubDeep", () => {
  it("scrubs a Sentry-shaped event", () => {
    const event = {
      request: { url: "https://yuvoy.in/booking#t=leaky" },
      breadcrumbs: [
        { data: { from: "/e/x", to: "/booking#t=leaky" } },
        { data: { to: "/trips" } },
      ],
      transaction: "/booking#t=leaky",
    };

    const clean = scrubDeep(event);

    expect(JSON.stringify(clean)).not.toContain("leaky");
    expect(clean.breadcrumbs[1].data.to).toBe("/trips");
  });

  it("does not hang on deeply nested input", () => {
    let nested: Record<string, unknown> = { url: "/booking#t=x" };
    for (let i = 0; i < 50; i++) nested = { nested };
    expect(() => scrubDeep(nested)).not.toThrow();
  });
});
