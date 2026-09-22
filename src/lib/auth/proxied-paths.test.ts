import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { allowedProxyPath, PROXIED_PATHS } from "./proxied-paths";

/**
 * The allowlist in front of the credentialed proxy (yuvoy-app#57).
 *
 * `/api/v1/[...path]` attaches the traveller's session to whatever it
 * forwards. Without a list it is an open, credentialed relay: anything at
 * `/v1/<x>` becomes reachable at `/api/v1/<x>`, signed as whoever holds the
 * cookie, from any page that can make a fetch. So the list is the security
 * boundary, and these are the tests that say so.
 */

describe("what the proxy will forward", () => {
  it("allows the calls that have a caller today", () => {
    expect(allowedProxyPath("GET", "/me")).toBe("/me");
    expect(allowedProxyPath("GET", "/me/bookings")).toBe("/me/bookings");
  });

  it("refuses a method the path was not listed under", () => {
    /*
      Listing a path must not list every verb on it. `DELETE /me` is an
      account deletion in most APIs; it is not something a `GET` entry may
      quietly authorise.
    */
    expect(allowedProxyPath("DELETE", "/me")).toBeNull();
    expect(allowedProxyPath("POST", "/me/bookings")).toBeNull();
  });

  it("forwards signed-in checkout, which a GUEST still reaches directly", () => {
    /*
      The one entry that is not session-only (yuvoy-app#32). Booking with no
      account is this product's whole shape, so `useCreateReservation` chooses
      per call and only the signed-in one comes through here.
    */
    expect(allowedProxyPath("POST", "/reservations")).toBe("/reservations");
  });

  it("forwards the account's saves, and only the verbs the contract has", () => {
    /*
      yuvoy-api#192. Session-only, so these cannot be called any other way.
      Each verb is listed on its own: listing `GET /me/saved` must not quietly
      let a DELETE of the whole collection through, and the id placeholder
      must not let one save's DELETE reach a sibling path.
    */
    expect(allowedProxyPath("GET", "/me/saved")).toBe("/me/saved");
    expect(allowedProxyPath("GET", "/me/saved/ids")).toBe("/me/saved/ids");
    expect(allowedProxyPath("POST", "/me/saved")).toBe("/me/saved");
    expect(allowedProxyPath("POST", "/me/saved/adopt")).toBe("/me/saved/adopt");
    expect(allowedProxyPath("DELETE", "/me/saved/exp_kayak")).toBe(
      "/me/saved/{experienceId}",
    );
    expect(allowedProxyPath("DELETE", "/me/saved")).toBeNull();
    expect(allowedProxyPath("PATCH", "/me/saved")).toBeNull();
    expect(allowedProxyPath("DELETE", "/me/saved/a/b")).toBeNull();
    expect(allowedProxyPath("GET", "/me/saved/exp_kayak")).toBeNull();
  });

  it("forwards reading back help requests, and nothing past one reference", () => {
    /*
      yuvoy-api#196. The list is session-only in the contract, so the proxy is
      the only way to call it; one request by reference takes either
      credential and this is the session's half. Listing them must not let a
      write through, and the reference placeholder must stay one segment.
    */
    expect(allowedProxyPath("GET", "/support/requests")).toBe(
      "/support/requests",
    );
    expect(allowedProxyPath("GET", "/support/requests/SR-3F9A12C0")).toBe(
      "/support/requests/{reference}",
    );
    expect(
      allowedProxyPath("DELETE", "/support/requests/SR-3F9A12C0"),
    ).toBeNull();
    expect(
      allowedProxyPath("PATCH", "/support/requests/SR-3F9A12C0"),
    ).toBeNull();
    expect(
      allowedProxyPath("POST", "/support/requests/SR-3F9A12C0"),
    ).toBeNull();
    expect(allowedProxyPath("GET", "/support/requests/SR-1/notes")).toBeNull();
    expect(allowedProxyPath("GET", "/support/requests/../me")).toBeNull();
  });

  it("refuses anything not listed, including real contract paths", () => {
    // Real endpoints. Being real is not the same as being proxied.
    expect(allowedProxyPath("GET", "/experiences/try-dive")).toBeNull();
    expect(allowedProxyPath("DELETE", "/me/session")).toBeNull();
    expect(allowedProxyPath("GET", "/reservations")).toBeNull();
  });

  it("refuses the sign-in endpoints, which mint the credential", () => {
    /*
      `verify` is what produces the session. If it could be reached through the
      proxy the answer would come back to the browser with a `sessionToken` in
      it, which is the exact thing this change removes. It has its own route.
    */
    expect(allowedProxyPath("POST", "/me/sign-in/verify")).toBeNull();
    expect(allowedProxyPath("POST", "/me/sign-in/request")).toBeNull();
  });

  it("refuses every shape of traversal", () => {
    /*
      The proxy joins URL segments back into a path. `["..", "admin"]` joins to
      `/../admin`, which a URL constructor would happily resolve upwards
      against the API base. It never reaches one: the rebuilt path is matched
      first and matches nothing.
    */
    for (const path of [
      "/../admin/v1/operators",
      "/me/../../admin",
      "/me/..",
      "//evil.example.com/me",
      "/me//bookings",
      "\\me\\bookings",
      "/me/bookings/../../admin",
    ]) {
      expect(allowedProxyPath("GET", path), path).toBeNull();
    }
  });

  it("refuses a path with no leading slash", () => {
    expect(allowedProxyPath("GET", "me/bookings")).toBeNull();
    expect(allowedProxyPath("GET", "")).toBeNull();
  });

  it("does not let a listed prefix authorise what is under it", () => {
    /*
      `/me` being allowed must not make `/me/anything` allowed. A pattern
      compiled without anchors would do exactly that, and `/me/sign-in/verify`
      sits directly underneath.
    */
    expect(allowedProxyPath("GET", "/me/secrets")).toBeNull();
    expect(allowedProxyPath("GET", "/mez")).toBeNull();
    expect(allowedProxyPath("GET", "/me/bookings/extra")).toBeNull();
  });

  it("matches an id placeholder to one segment and no more", () => {
    /*
      No `{id}` entry has a caller yet, so this proves the compiler rather than
      a route: an id must never be able to contain a slash and walk the path.
    */
    const compiled = allowedProxyPath.bind(null);
    expect(compiled("GET", "/me")).not.toBeNull();
    // A placeholder that matched greedily would let this through if listed.
    expect(compiled("GET", "/me/invited-trips/a/b")).toBeNull();
  });
});

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
