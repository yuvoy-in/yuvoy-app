import { describe, it, expect } from "vitest";
import { allowedProxyPath } from "./proxied-paths";

/**
 * Crews in the proxy's list (yuvoy-app#227), kept apart from
 * `proxied-paths.test.ts` so that file stays under 500 lines.
 */
describe("what the proxy forwards of crews", () => {
  it("forwards the four crew calls, and nothing more of crews", () => {
    // yuvoy-app#227. Session only; a crew's page reads the list.
    const crew = "7b4d2e9f-3c5a-4d2b-8f1e-2e3d4c5b6a71";
    expect(allowedProxyPath("GET", "/me/crews")).toBe("/me/crews");
    expect(allowedProxyPath("POST", "/me/crews")).toBe("/me/crews");
    expect(allowedProxyPath("PATCH", `/me/crews/${crew}`)).toBe(
      "/me/crews/{crewId}",
    );
    expect(allowedProxyPath("DELETE", `/me/crews/${crew}`)).toBe(
      "/me/crews/{crewId}",
    );

    const refused: [string, string][] = [
      ["PUT", "/me/crews"],
      ["PATCH", "/me/crews"],
      ["DELETE", "/me/crews"],
      ["GET", `/me/crews/${crew}`],
      ["POST", `/me/crews/${crew}`],
      ["PUT", `/me/crews/${crew}`],
      ["PATCH", `/me/crews/${crew}/members`],
      ["GET", `/me/crews/${crew}/members`],
    ];
    for (const [method, path] of refused) {
      expect(allowedProxyPath(method, path), `${method} ${path}`).toBeNull();
    }
  });
});
