import { describe, it, expect } from "vitest";
import { allowedProxyPath, proxiedRule, PROXIED_PATHS } from "./proxied-paths";

/**
 * The data download in the proxy's list (yuvoy-app#221), kept apart from
 * `proxied-paths.test.ts` so that file stays under 500 lines.
 */
describe("what the proxy forwards of the data download", () => {
  it("forwards the data download as a read, and nothing else under it", () => {
    // yuvoy-app#221. The file is the traveller's own; a write here means nothing.
    expect(allowedProxyPath("GET", "/me/export")).toBe("/me/export");
    expect(allowedProxyPath("POST", "/me/export")).toBeNull();
    expect(allowedProxyPath("DELETE", "/me/export")).toBeNull();
    expect(allowedProxyPath("GET", "/me/export/x")).toBeNull();
  });

  it("holds the download to the write check, and says its own sign-in line", () => {
    // Each file is one of three a day, so a sibling page must not spend one.
    expect(proxiedRule("GET", "/me/export")).toEqual({
      method: "GET",
      pattern: "/me/export",
      counted: true,
      signedOut: "Sign in to download your data.",
    });
    // The only counted read today; another needs the same look.
    expect(
      PROXIED_PATHS.filter((p) => p.counted).map((p) => p.pattern),
    ).toEqual(["/me/export"]);
    expect(proxiedRule("GET", "/me")?.counted).toBeUndefined();
  });
});
