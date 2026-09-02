import { describe, it, expect, beforeEach } from "vitest";
import {
  captureAttribution,
  captureFromLocation,
  readAttribution,
  storeAttribution,
} from "./attribution";

describe("captureAttribution", () => {
  it("reads a QR arrival as its source and its code", () => {
    expect(captureAttribution("?src=qr&code=JETTY-2", "/")).toEqual({
      source: "qr",
      scanCode: "JETTY-2",
      landingPath: "/",
    });
  });

  it("drops a code that /go would not have accepted, and keeps the source", () => {
    // A checkout must not fail over a marketing field: bad value, not bad request.
    expect(captureAttribution("?src=qr&code=<script>")).toEqual({
      source: "qr",
    });
  });

  it("only names a scan code on a QR arrival", () => {
    expect(captureAttribution("?src=social&code=ABC123")).toEqual({
      source: "social",
    });
  });

  it("refuses a source outside the contract's set", () => {
    expect(captureAttribution("?src=billboard")).toBeNull();
    expect(captureAttribution("?code=ABC123")).toBeNull();
    expect(captureAttribution("")).toBeNull();
  });

  it("honours the contract's length caps by dropping, never truncating", () => {
    const long = "x".repeat(121);
    expect(captureAttribution(`?src=qr&placement=${long}`)).toEqual({
      source: "qr",
    });
    expect(
      captureAttribution("?src=qr&placement=Board%20A&campaign=oct"),
    ).toEqual({ source: "qr", placement: "Board A", campaign: "oct" });
  });

  it("never claims the checkout path as the landing page", () => {
    // "We already know it for certain, and asking for a fact we hold is how
    // the two come to disagree."
    expect(
      captureAttribution("?src=qr&code=JETTY-2", "/e/try-dive/book"),
    ).toEqual({ source: "qr", scanCode: "JETTY-2" });
  });
});

describe("the visit's claim", () => {
  beforeEach(() => sessionStorage.clear());

  it("round-trips through the session", () => {
    storeAttribution({ source: "qr", scanCode: "JETTY-2" });
    expect(readAttribution()).toEqual({ source: "qr", scanCode: "JETTY-2" });
  });

  it("is absent when nothing was claimed", () => {
    expect(readAttribution()).toBeUndefined();
  });

  it("re-validates on the way out, because storage is writable by anything", () => {
    sessionStorage.setItem(
      "yuvoy.attribution",
      JSON.stringify({ source: "x" }),
    );
    expect(readAttribution()).toBeUndefined();
    sessionStorage.setItem("yuvoy.attribution", "{not json");
    expect(readAttribution()).toBeUndefined();
  });

  it("keeps the first claim of the visit", () => {
    window.history.replaceState({}, "", "/?src=qr&code=JETTY-2");
    captureFromLocation();
    window.history.replaceState({}, "", "/?src=search");
    captureFromLocation();
    expect(readAttribution()).toEqual({
      source: "qr",
      scanCode: "JETTY-2",
      landingPath: "/",
    });
    window.history.replaceState({}, "", "/");
  });
});
