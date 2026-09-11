import { describe, it, expect } from "vitest";
import { cspDirectives, enforcedCsp, reportOnlyCsp } from "./csp";

const PROD = {
  apiUrl: "https://api.yuvoy.in/v1",
  posthogHost: "https://eu.i.posthog.com",
  dev: false,
};

function directive(policy: string, name: string): string | undefined {
  return policy.split("; ").find((d) => d === name || d.startsWith(`${name} `));
}

/**
 * The source expressions of a directive, as tokens.
 *
 * Asserted as tokens rather than substrings because the two wildcards that
 * would gut this policy — a bare `https:` scheme source and a bare `*` — are
 * both substrings of perfectly good host sources like
 * `https://*.cloudflarestream.com`. A substring assertion here passes when
 * the policy is wrong and fails when it is right.
 */
function sources(policy: string, name: string): string[] {
  return (directive(policy, name) ?? "").split(" ").slice(1);
}

/**
 * yuvoy-app#23. The load-bearing claim in this policy is `connect-src`: it is
 * what leaves a script that has read a booking token nowhere to send it.
 * These pin the shape of that claim, and the ways around it.
 */
describe("Content-Security-Policy", () => {
  it("names the API origin, and only the origin", () => {
    // A path in a source expression is not an error the browser reports — it
    // simply does not match, and every API call fails at once.
    expect(directive(reportOnlyCsp(PROD), "connect-src")).toContain(
      "https://api.yuvoy.in",
    );
    expect(directive(reportOnlyCsp(PROD), "connect-src")).not.toContain("/v1");
  });

  it("leaves an injected script nowhere to post a token", () => {
    const connect = sources(reportOnlyCsp(PROD), "connect-src");
    expect(connect).not.toContain("*");
    expect(connect).not.toContain("https:");
    expect(connect).not.toContain("http:");
    expect(connect).not.toContain("https://*");
    expect(connect.some((s) => s.startsWith("'unsafe"))).toBe(false);
  });

  it("closes the channels that are not connect-src", () => {
    // A script can exfiltrate through an image URL, a form post or a rewritten
    // <base> just as easily as through fetch.
    const policy = reportOnlyCsp(PROD);
    expect(sources(policy, "img-src")).not.toContain("https:");
    expect(sources(policy, "img-src")).not.toContain("*");
    expect(directive(policy, "form-action")).toBe("form-action 'self'");
    expect(directive(policy, "base-uri")).toBe("base-uri 'none'");
    expect(directive(policy, "default-src")).toBe("default-src 'none'");
  });

  it("can still play a clip", () => {
    // Cloudflare Stream lands in three directives for three reasons — poster,
    // hls.js's XHR for the manifest, and Safari's native HLS on the element.
    // Missing any one is a feed of black rectangles.
    const policy = reportOnlyCsp(PROD);
    for (const d of ["img-src", "media-src", "connect-src"]) {
      expect(directive(policy, d)).toContain("cloudflarestream.com");
    }
    // MSE hands the video element a blob URL, and hls.js spawns its worker
    // from one.
    expect(directive(policy, "media-src")).toContain("blob:");
    expect(directive(policy, "worker-src")).toContain("blob:");
  });

  it("can show an operator's own pictures", () => {
    /*
      yuvoy-app#30. Logos and the photographs on an operator's page are
      Cloudflare Images, one host for every business. The policy enforced on
      9 Sep 2026 named only Stream, so the first logo an operator uploaded
      would have been blocked on every card — invisible to the e2e suite,
      whose fixtures draw every picture as a `data:` URI.
    */
    expect(sources(reportOnlyCsp(PROD), "img-src")).toContain(
      "https://imagedelivery.net",
    );
  });

  it("never ships eval to a traveller", () => {
    expect(directive(reportOnlyCsp(PROD), "script-src")).not.toContain(
      "unsafe-eval",
    );
    // Development is a different matter: Next's HMR needs it and nobody is
    // being sold anything.
    expect(
      directive(reportOnlyCsp({ ...PROD, dev: true }), "script-src"),
    ).toContain("unsafe-eval");
    // And dev's websocket must never reach production either.
    expect(sources(reportOnlyCsp(PROD), "connect-src")).not.toContain("ws:");
  });

  it("enforces the whole policy, and reports the same one", () => {
    /*
      Enforced on 9 Sep 2026 against the e2e suite rather than a waiting
      period. The two headers now carry the SAME policy — report-only is kept
      because it is what turns a production block into a console line naming
      the directive, which an enforced-only header does not give you.

      If they ever diverge it means somebody narrowed one and not the other,
      and that is the bug this pins.
    */
    expect(enforcedCsp(PROD)).toBe(reportOnlyCsp(PROD));
    expect(enforcedCsp(PROD)).toContain("connect-src");
    expect(enforcedCsp(PROD)).toContain("default-src 'none'");
  });

  it("drops a host it cannot parse rather than emitting a broken source", () => {
    // An unset or malformed env var must not become a literal `undefined` in
    // the policy, which browsers read as a hostname.
    const policy = reportOnlyCsp({ apiUrl: "not a url", posthogHost: "" });
    expect(policy).not.toContain("undefined");
    expect(policy).not.toContain("not a url");
    expect(directive(policy, "connect-src")).toContain("'self'");
  });

  it("keeps every directive to one declaration", () => {
    // A repeated directive is not merged — the first wins and the second is
    // silently ignored, which is how a policy ends up looser than it reads.
    const names = cspDirectives(PROD).map((d) => d.split(" ")[0]);
    expect(new Set(names).size).toBe(names.length);
  });
});
