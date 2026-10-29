import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  __forgetArrival,
  arrivalTaken,
  keepForSignIn,
  restoreFragment,
  signInHref,
  takeArrival,
} from "./guest-return";

/**
 * Linking a reply across sign-in (yuvoy-mobile#373, case 15): the token
 * waits in this tab's storage, never in a query, and comes back after the
 * `#` only into an address that has none.
 */

const TOKEN = `yp_${"T".repeat(40)}a-_`;
const OTHER = `yp_${"O".repeat(40)}c-_`;
const START = window.location.href;

beforeEach(() => {
  sessionStorage.clear();
  __forgetArrival();
});
afterEach(() => {
  window.history.replaceState(null, "", START);
});

describe("the way to sign-in", () => {
  it("names /p and the page's own query in next, and never the token", () => {
    expect(signInHref("")).toBe("/account?next=%2Fp");
    const href = signInHref("?__scenario=plan-guest-returning");
    expect(href).toBe("/account?next=%2Fp%3F__scenario%3Dplan-guest-returning");
    expect(href).not.toContain("yp_");
  });

  it("keeps the token in this tab's storage", () => {
    expect(keepForSignIn(TOKEN)).toBe(true);
    expect(sessionStorage.getItem("yuvoy.plan-link.return")).toContain(TOKEN);
  });
});

describe("the way back", () => {
  it("hands the token over once, and forgets it in storage", () => {
    keepForSignIn(TOKEN);
    expect(takeArrival()).toEqual({ token: TOKEN, link: true });
    expect(sessionStorage.getItem("yuvoy.plan-link.return")).toBeNull();
    // The same answer for the rest of this page load.
    expect(takeArrival()).toEqual({ token: TOKEN, link: true });
  });

  it("can be looked at without taking it, so a keep is never emptied before the tab leaves", () => {
    keepForSignIn(TOKEN);
    expect(arrivalTaken()).toBeNull();
    expect(sessionStorage.getItem("yuvoy.plan-link.return")).toContain(TOKEN);
    takeArrival();
    expect(arrivalTaken()).toEqual({ token: TOKEN, link: true });
  });

  it("is read again after a new keep in the same page load", () => {
    // A first visit with no fragment took nothing; sign-in then comes back
    // by a client navigation, without a new page load.
    expect(takeArrival()).toBeNull();
    keepForSignIn(TOKEN);
    expect(takeArrival()).toEqual({ token: TOKEN, link: true });
  });

  it("is nothing when nothing was kept, or something that is not a token", () => {
    expect(takeArrival()).toBeNull();
    __forgetArrival();
    sessionStorage.setItem(
      "yuvoy.plan-link.return",
      JSON.stringify({ token: "yp_x" }),
    );
    expect(takeArrival()).toBeNull();
    __forgetArrival();
    sessionStorage.setItem("yuvoy.plan-link.return", "not json");
    expect(takeArrival()).toBeNull();
  });

  it("puts the token back after the # of an address with no fragment", () => {
    window.history.replaceState(null, "", "/p?__scenario=plan-guest-returning");
    restoreFragment(TOKEN);
    expect(window.location.hash).toBe(`#${TOKEN}`);
    expect(window.location.search).toBe("?__scenario=plan-guest-returning");
  });

  it("never replaces a fragment that is already there", () => {
    window.history.replaceState(null, "", `/p#${OTHER}`);
    restoreFragment(TOKEN);
    expect(window.location.hash).toBe(`#${OTHER}`);
  });
});
