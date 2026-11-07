import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { proxyPathOf, PROXIED_PATHS } from "./proxied-paths";

/**
 * The proxy's list checked against the contract, and the path it builds
 * (yuvoy-app#57), kept apart from `proxied-paths.test.ts` so that file stays
 * under 500 lines.
 */
describe("the list itself", () => {
  it("names only paths the pinned contract has", () => {
    /*
      A proxied path the API does not have is a 404 the traveller cannot act
      on, and it is how a deleted endpoint keeps a door open here. Checked
      against the contract rather than against a memory of it.
    */
    const contract = readFileSync(
      join(process.cwd(), "contracts/openapi.yaml"),
      "utf8",
    );
    const paths = new Set(
      [...contract.matchAll(/^ {2}(\/[a-z][^:]*):/gim)].map((m) => m[1]),
    );
    expect(paths.size).toBeGreaterThan(20);
    for (const { pattern } of PROXIED_PATHS) {
      expect(paths.has(pattern), `${pattern} is not in the contract`).toBe(
        true,
      );
    }
  });

  it("lists nothing the contract says needs no credential", () => {
    /*
      Derived from the contract's own `security:`, not from a list of path
      prefixes. The first draft of this test WAS a prefix list, and it refused
      `/support/requests` the moment that was legitimately added: a rule that
      has to be edited every time it is satisfied is not a rule.

      What it protects: the proxy attaches the traveller's session to whatever
      it forwards, so an endpoint that needs no credential would become a free,
      credentialed relay into the API reachable by anyone who can load a page.
      `GET /invites/{token}` and `GET /me/interest-options` are both real,
      useful, and unauthenticated, which is exactly why neither may be here.
    */
    const contract = readFileSync(
      join(process.cwd(), "contracts/openapi.yaml"),
      "utf8",
    );

    /** The `security:` line for one method under one path, if it has one. */
    const securityFor = (pattern: string, method: string) => {
      const start = contract.indexOf(`\n  ${pattern}:\n`);
      if (start < 0) return null;
      const rest = contract.slice(start + 1);
      const end = rest.slice(1).search(/\n {2}\/[a-z]/i);
      const block = end < 0 ? rest : rest.slice(0, end + 1);

      const verb = `\n    ${method.toLowerCase()}:\n`;
      const at = block.indexOf(verb);
      if (at < 0) return null;
      const afterVerb = block.slice(at + 1);
      const nextVerb = afterVerb
        .slice(1)
        .search(/\n {4}(get|post|patch|put|delete):\n/);
      const operation =
        nextVerb < 0 ? afterVerb : afterVerb.slice(0, nextVerb + 1);

      return /^ {6}security:\s*\[(.+)\]/m.exec(operation)?.[1] ?? null;
    };

    for (const { method, pattern } of PROXIED_PATHS) {
      const security = securityFor(pattern, method);
      expect(
        security,
        `${method} ${pattern} has no security: in the contract`,
      ).not.toBeNull();
      /*
        And it must actually name a scheme. `security: []` is the OpenAPI
        spelling of "no credential required", which would be the worst case
        here: a path that looks guarded and is not.
      */
      expect(
        security!.trim().length,
        `${method} ${pattern} declares an EMPTY security list`,
      ).toBeGreaterThan(0);
    }
  });
});

/**
 * The path the proxy builds from Next's segments (production readiness,
 * 6 Oct 2026). Next decodes the URL once, so a double-encoded dot segment
 * reached the upstream URL parser as a single-encoded one, which it resolves.
 */
describe("the path the proxy forwards to", () => {
  it("would have climbed a level on a single-encoded dot segment", () => {
    // The defect, as the upstream call's URL parser saw it.
    expect(new URL("https://api.yuvoy.in/v1/me/saved/%2e%2e").pathname).toBe(
      "/v1/me/",
    );
  });

  it("keeps a double-encoded dot segment a name rather than a step up", () => {
    // What Next hands the route for /api/v1/me/saved/%252e%252e.
    const path = proxyPathOf(["me", "saved", "%2e%2e"]);
    expect(path).toBe("/me/saved/%252e%252e");
    expect(new URL(`https://api.yuvoy.in/v1${path}`).pathname).toBe(
      "/v1/me/saved/%252e%252e",
    );
  });

  it("refuses a segment that is a dot segment on its own", () => {
    expect(proxyPathOf(["me", "."])).toBeNull();
    expect(proxyPathOf(["me", ".."])).toBeNull();
  });

  it("leaves every path the app actually sends exactly as it was", () => {
    expect(
      proxyPathOf(["me", "saved", "4e359184-5f5d-4694-976e-48e2051abf7b"]),
    ).toBe("/me/saved/4e359184-5f5d-4694-976e-48e2051abf7b");
    expect(proxyPathOf(["me", "bookings"])).toBe("/me/bookings");
    expect(proxyPathOf(["invites", "inv_7Hq-x_2", "accept"])).toBe(
      "/invites/inv_7Hq-x_2/accept",
    );
  });
});
