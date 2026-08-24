import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, afterAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { server } from "./mocks/server";
import { __resetBookingMocks } from "./mocks/booking-handlers";

/*
  Every test runs against the MSW handlers generated from the contract.
  `onUnhandledRequest: "error"` is deliberate: a request nobody mocked is a
  request whose shape nobody checked, and it would otherwise pass silently.
*/
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  // Reservations and idempotency keys are module state in the mock. Leaking
  // them between cases makes an idempotency test pass for the wrong reason.
  __resetBookingMocks();
  sessionStorage.clear();
  cleanup();
});
afterAll(() => server.close());

// jsdom implements neither, and the feed depends on both.
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  root = null;
  rootMargin = "";
  thresholds = [];
}
vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
