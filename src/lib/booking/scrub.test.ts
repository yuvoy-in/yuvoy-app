import { describe, it, expect } from "vitest";
import { isPlanLinkPath, scrubUrl, scrubDeep } from "./scrub";

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

  it("redacts the token an invitation or a shared trip carries in its path", () => {
    expect(scrubUrl("https://app.yuvoy.in/i/inv_tok_9f2?from=wa")).toBe(
      "https://app.yuvoy.in/i/[redacted]?from=wa",
    );
    expect(scrubUrl("/trip/shr_tok_41#top")).toBe("/trip/[redacted]#top");
    // Both at once: a shared trip opened from a booking link.
    expect(scrubUrl("/trip/shr_tok_41#t=abc")).toBe(
      "/trip/[redacted]#t=[redacted]",
    );
  });

  it("leaves the paths that carry no token alone", () => {
    for (const path of [
      "/trips",
      "/trips/invited/inv_1",
      "/e/try-dive",
      "/search?q=dive",
    ]) {
      expect(scrubUrl(path)).toBe(path);
    }
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

/**
 * A plan by link (yuvoy-mobile#373, case 17): the whole fragment of `/p/#…`
 * is the plan's front door, so on that address nothing after the `#` may
 * reach an error report, analytics or a log.
 */
describe("a plan link", () => {
  const TOKEN = `yp_${"T".repeat(40)}a-_`;
  const KEY = `ypk_${"K".repeat(40)}b-_`;

  it("drops everything after the # on /p and /p/, with or without a host or query", () => {
    expect(scrubUrl(`https://app.yuvoy.in/p/#${TOKEN}`)).toBe("https://app.yuvoy.in/p/");
    expect(scrubUrl(`https://app.yuvoy.in/p#${TOKEN}`)).toBe("https://app.yuvoy.in/p");
    expect(scrubUrl(`/p/#${TOKEN}`)).toBe("/p/");
    expect(scrubUrl(`/p?__scenario=plan-guest-first#${TOKEN}`)).toBe(
      "/p?__scenario=plan-guest-first",
    );
  });

  it("drops a fragment that is not a token too, since the shape is no promise", () => {
    expect(scrubUrl("https://app.yuvoy.in/p/#yp_mangled")).toBe("https://app.yuvoy.in/p/");
  });

  it("drops it inside a sentence and keeps the rest of the sentence", () => {
    expect(scrubUrl(`Failed to load https://app.yuvoy.in/p/#${TOKEN} after 3s`)).toBe(
      "Failed to load https://app.yuvoy.in/p/ after 3s",
    );
  });

  it("redacts a token or a guest key by its shape wherever it is", () => {
    expect(scrubUrl(`token ${TOKEN} here`)).toBe("token [redacted] here");
    expect(scrubUrl(`ypk_series=${KEY}`)).toBe("ypk_series=[redacted]");
  });

  it("leaves the paths that only start like /p alone", () => {
    for (const url of [
      "/plans/8d2f6a10-3c4b-4e5f-8a9b-0c1d2e3f4a52#people",
      "/privacy#cookies",
      "https://app.yuvoy.in/app/#top",
      "https://app.yuvoy.in/e/p/#top",
    ]) {
      expect(scrubUrl(url)).toBe(url);
    }
  });

  it("is scrubbed out of an event's every field", () => {
    const clean = scrubDeep({
      $current_url: `https://app.yuvoy.in/p/#${TOKEN}`,
      $pathname: "/p/",
      nested: { url: `/p#${TOKEN}`, list: [`see /p/#${TOKEN}`] },
    });
    expect(JSON.stringify(clean)).not.toContain("yp_");
    expect(clean.$pathname).toBe("/p/");
  });
});

describe("isPlanLinkPath", () => {
  it("is the plan link page and nothing that only starts like it", () => {
    expect(isPlanLinkPath("/p")).toBe(true);
    expect(isPlanLinkPath("/p/")).toBe(true);
    for (const path of ["/", "/plans/x", "/privacy", "/p/api/view", null, undefined]) {
      expect(isPlanLinkPath(path)).toBe(false);
    }
  });
});
