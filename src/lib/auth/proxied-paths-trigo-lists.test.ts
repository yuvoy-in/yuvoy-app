import { describe, it, expect } from "vitest";
import { allowedProxyPath } from "./proxied-paths";

/**
 * Date alerts and trip drafts in the proxy's list (yuvoy-app#220), kept
 * apart from `proxied-paths.test.ts` so that file stays under 500 lines.
 */
describe("what the proxy forwards of date alerts and trip drafts", () => {
  it("forwards the four session-only calls, and nothing more of them", () => {
    const id = "5c2a7e1d-9b4f-4a3e-8d6c-1f2e3d4c5b6a";
    expect(allowedProxyPath("GET", "/me/date-alerts")).toBe("/me/date-alerts");
    expect(allowedProxyPath("DELETE", `/me/date-alerts/${id}`)).toBe(
      "/me/date-alerts/{id}",
    );
    expect(allowedProxyPath("GET", "/me/trip-drafts")).toBe("/me/trip-drafts");
    expect(allowedProxyPath("DELETE", `/me/trip-drafts/${id}`)).toBe(
      "/me/trip-drafts/{id}",
    );

    const refused: [string, string][] = [
      ["POST", "/me/date-alerts"],
      ["DELETE", "/me/date-alerts"],
      ["GET", `/me/date-alerts/${id}`],
      ["PATCH", `/me/date-alerts/${id}`],
      ["POST", "/me/trip-drafts"],
      ["DELETE", "/me/trip-drafts"],
      ["GET", `/me/trip-drafts/${id}`],
      ["PUT", `/me/trip-drafts/${id}`],
      ["DELETE", `/me/trip-drafts/${id}/days`],
    ];
    for (const [method, path] of refused) {
      expect(allowedProxyPath(method, path), `${method} ${path}`).toBeNull();
    }
  });
});
