import { describe, it, expect, beforeEach } from "vitest";
import {
  installReporter,
  captureError,
  captureEvent,
  type Reporter,
} from "./report";

const captured: { errors: unknown[][]; events: unknown[][] } = {
  errors: [],
  events: [],
};

const spy: Reporter = {
  captureError: (...args) => captured.errors.push(args),
  captureEvent: (...args) => captured.events.push(args),
};

beforeEach(() => {
  captured.errors = [];
  captured.events = [];
  installReporter(spy);
  window.location.hash = "#t=supersecrettoken";
});

/**
 * The token is unrecoverable and IS the access to somebody's booking. Leaking
 * it to an analytics vendor hands that booking to whoever reads the dashboard.
 */
describe("reporting never leaks the status token", () => {
  it("scrubs the fragment from the captured URL on an error", () => {
    captureError(new Error("boom"), { scope: "checkout", requestId: "01J" });

    const serialised = JSON.stringify(captured.errors);
    expect(serialised).not.toContain("supersecrettoken");
    expect(serialised).toContain("[redacted]");
    // The genuinely useful field survives.
    expect(serialised).toContain("01J");
  });

  it("scrubs the fragment on an event", () => {
    captureEvent("checkout_started", { slotId: "slot_1" });

    const serialised = JSON.stringify(captured.events);
    expect(serialised).not.toContain("supersecrettoken");
    expect(serialised).toContain("slot_1");
  });

  it("scrubs a token copied into a context field", () => {
    // Defence in depth: somebody passes the link itself as context.
    captureError(new Error("boom"), {
      scope: "booking",
      link: "https://yuvoy.in/booking#t=supersecrettoken",
    });

    expect(JSON.stringify(captured.errors)).not.toContain("supersecrettoken");
  });

  it("does nothing, and does not throw, before a reporter is installed", () => {
    installReporter({ captureError: () => {}, captureEvent: () => {} });
    expect(() => captureError(new Error("x"))).not.toThrow();
  });

  it("never lets a reporter's own failure reach the caller", () => {
    installReporter({
      captureError: () => {
        throw new Error("reporter is down");
      },
      captureEvent: () => {
        throw new Error("reporter is down");
      },
    });

    // These are called from checkout. A monitoring SDK that throws — bad DSN,
    // blocked request, quota exceeded — must not take down the one flow that
    // moves money in order to report that nothing was wrong with it.
    expect(() => captureError(new Error("x"))).not.toThrow();
    expect(() => captureEvent("checkout_started")).not.toThrow();
  });
});
