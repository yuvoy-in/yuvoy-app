import { describe, it, expect } from "vitest";
import { hostOf, safeExternalUrl } from "./link-out";

/**
 * See details opens somebody else's page, so the address is checked twice:
 * once by the API and once here (yuvoy-app#179). These pin the second check
 * and the host a person reads under the button, which has to match the
 * phone app's for the same card.
 */

describe("which addresses a card may open", () => {
  it("opens http and https addresses exactly as stored", () => {
    const stored = "https://Example.in/Events/42?ref=Venue#tickets";
    expect(safeExternalUrl(stored)).toBe(stored);
    expect(safeExternalUrl("http://example.in")).toBe("http://example.in");
  });

  it("refuses a script address", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("JAVASCRIPT:alert(1)")).toBeNull();
    expect(safeExternalUrl(" javascript:alert(1)")).toBeNull();
  });

  it("refuses a data address", () => {
    expect(
      safeExternalUrl("data:text/html,<script>alert(1)</script>"),
    ).toBeNull();
  });

  it("refuses a relative address, and one with no scheme", () => {
    expect(safeExternalUrl("/f/abc")).toBeNull();
    expect(safeExternalUrl("events/42")).toBeNull();
    expect(safeExternalUrl("//example.in/events")).toBeNull();
    expect(safeExternalUrl("example.in")).toBeNull();
  });

  it("refuses other schemes, whitespace, and nothing at all", () => {
    expect(safeExternalUrl("ftp://example.in/file")).toBeNull();
    expect(safeExternalUrl("mailto:hello@example.in")).toBeNull();
    expect(safeExternalUrl("https://example.in/a b")).toBeNull();
    expect(safeExternalUrl("https://")).toBeNull();
    expect(safeExternalUrl("")).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
    expect(safeExternalUrl(undefined)).toBeNull();
  });
});

describe("the host a person reads", () => {
  it("drops www. and the port, and lower-cases it", () => {
    expect(hostOf("https://www.Example.in:8443/events")).toBe("example.in");
    expect(hostOf("http://WWW.bookmyshow.com/")).toBe("bookmyshow.com");
    expect(hostOf("https://tickets.example.in:443")).toBe("tickets.example.in");
  });

  it("keeps a subdomain that is not www", () => {
    expect(hostOf("https://events.example.in/x")).toBe("events.example.in");
  });

  it("reads the host an address actually opens, not a user name in front of it", () => {
    expect(hostOf("https://example.in@evil.test/x")).toBe("evil.test");
  });

  it("drops a trailing dot", () => {
    expect(hostOf("https://example.in./x")).toBe("example.in");
  });

  it("is null for anything that is not an http or https address", () => {
    expect(hostOf("javascript:alert(1)")).toBeNull();
    expect(hostOf("/relative")).toBeNull();
    expect(hostOf(null)).toBeNull();
  });
});
