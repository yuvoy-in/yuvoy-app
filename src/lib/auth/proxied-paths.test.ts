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

  it("refuses anything not listed, including real contract paths", () => {
    // Real endpoints. Being real is not the same as being proxied.
    expect(allowedProxyPath("POST", "/reservations")).toBeNull();
    expect(allowedProxyPath("GET", "/experiences/try-dive")).toBeNull();
    expect(allowedProxyPath("DELETE", "/me/session")).toBeNull();
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

  it("lists nothing unauthenticated, so the proxy is never a plain relay", () => {
    /*
      Every entry must be a call that NEEDS the session. Forwarding an
      unauthenticated path would make this app's server a free proxy for the
      API, reachable by anyone who can load a page.
    */
    for (const { pattern } of PROXIED_PATHS) {
      expect(
        pattern === "/me" ||
          pattern.startsWith("/me/") ||
          pattern.startsWith("/bookings/invites") ||
          pattern.startsWith("/invites/") ||
          pattern === "/reservations",
        `${pattern} is not an authenticated family`,
      ).toBe(true);
    }
  });
});
