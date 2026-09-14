import { describe, it, expect } from "vitest";
import { safeNextPath, nextParamFor } from "./next-path";

/**
 * The open-redirect guard behind `?next=` (yuvoy-app#56).
 *
 * A traveller who signs in on app.yuvoy.in, with our form, and is then handed
 * to somebody else's page in the same tab has been phished by us. The
 * redirect is the only link in that chain this app controls, so the refusals
 * below are the feature and the happy path is the small part.
 */
describe("what may be followed after signing in", () => {
  it("follows a plain path on this origin", () => {
    expect(safeNextPath("/trips")).toBe("/trips");
    expect(safeNextPath("/e/try-dive-nemo-reef")).toBe("/e/try-dive-nemo-reef");
    expect(safeNextPath("/")).toBe("/");
  });

  it("keeps the query and the fragment, which is the point of carrying it", () => {
    /*
      Search is entirely in the query, so dropping it would land somebody back
      on an unfiltered grid and call that "where you were".
    */
    expect(safeNextPath("/search?q=diving&place=andaman%2Fhavelock")).toBe(
      "/search?q=diving&place=andaman%2Fhavelock",
    );
    expect(safeNextPath("/booking#t=abc")).toBe("/booking#t=abc");
  });

  it("hands back the caller's own string, unchanged", () => {
    /*
      Not normalised and not re-encoded. What is checked has to be exactly
      what is navigated to; a guard that rewrites its input has to be proven
      twice.
    */
    const messy = "/search?q=a%20b&on=2026-09-20";
    expect(safeNextPath(messy)).toBe(messy);
  });
});

describe("what must never be followed", () => {
  it("refuses an absolute URL", () => {
    for (const bad of [
      "https://evil.example/login",
      "http://evil.example",
      "HTTPS://evil.example",
      "https://app.yuvoy.in/trips",
    ]) {
      expect(safeNextPath(bad), bad).toBeNull();
    }
  });

  it("refuses a protocol-relative URL, which starts with a slash", () => {
    /*
      The bypass a "must start with /" check waves through. The browser reads
      `//evil.example` as an absolute URL to another host.
    */
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("//evil.example/login")).toBeNull();
    expect(safeNextPath("///evil.example")).toBeNull();
  });

  it("refuses the backslash spellings of the same trick", () => {
    // WHATWG treats `\` as `/` in the authority position.
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath("/\\/evil.example")).toBeNull();
    expect(safeNextPath("\\\\evil.example")).toBeNull();
  });

  it("refuses a percent-encoded protocol-relative URL", () => {
    /*
      `%2f%2fevil.example` decodes to `//evil.example`. A caller reading the
      raw query string hands this in undecoded, so both forms are checked.
    */
    expect(safeNextPath("%2f%2fevil.example")).toBeNull();
    expect(safeNextPath("/%2f%2fevil.example")).toBeNull();
    expect(safeNextPath("%2F%5Cevil.example")).toBeNull();
  });

  it("refuses a scheme that is not a navigation at all", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>",
      "mailto:someone@example.com",
    ]) {
      expect(safeNextPath(bad), bad).toBeNull();
    }
  });

  it("refuses control characters a browser would strip before parsing", () => {
    /*
      `/\n/evil.example` becomes `//evil.example` once the browser drops the
      newline. Refused outright rather than sanitised: sanitising invites the
      next encoding.
    */
    expect(safeNextPath("/\n/evil.example")).toBeNull();
    expect(safeNextPath("/\t/evil.example")).toBeNull();
    expect(safeNextPath("/\r\n//evil.example")).toBeNull();
    expect(safeNextPath("java\nscript:alert(1)")).toBeNull();
  });

  it("refuses a malformed escape rather than guessing at it", () => {
    // `decodeURIComponent` throws here, and a throw is a refusal.
    expect(safeNextPath("/trips%")).toBeNull();
    expect(safeNextPath("/%zz")).toBeNull();
  });

  it("refuses a relative path, empty input and non-strings", () => {
    expect(safeNextPath("trips")).toBeNull();
    expect(safeNextPath("../admin")).toBeNull();
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath("   ")).toBeNull();
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });
});

describe("the value the Login link carries", () => {
  it("joins the path and the query, and drops an empty one", () => {
    expect(nextParamFor("/search", "?q=diving")).toBe("/search?q=diving");
    expect(nextParamFor("/trips", "")).toBe("/trips");
    expect(nextParamFor("/trips", "?")).toBe("/trips");
  });

  it("produces something the guard will accept", () => {
    /*
      The two halves have to agree, or the button quietly stops returning
      anybody anywhere and nothing fails.
    */
    for (const [path, search] of [
      ["/", ""],
      ["/trips", ""],
      ["/search", "?q=a%20b&on=2026-09-20"],
      ["/e/try-dive-nemo-reef", ""],
    ] as const) {
      const value = nextParamFor(path, search);
      expect(safeNextPath(value), value).toBe(value);
    }
  });
});
