import { describe, it, expect, vi, afterEach } from "vitest";
import { originOf, preconnectApi } from "./preconnect";

const hints = () =>
  [...document.head.querySelectorAll('link[rel="preconnect"]')].map((l) => ({
    href: l.getAttribute("href"),
    crossOrigin: l.getAttribute("crossorigin"),
  }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("originOf", () => {
  it("keeps only the scheme, host and port", () => {
    expect(originOf("https://api.yuvoy.in/v1/reels?limit=12")).toBe(
      "https://api.yuvoy.in",
    );
  });

  it("answers null for nothing, and for anything that does not parse", () => {
    expect(originOf(undefined)).toBeNull();
    expect(originOf("")).toBeNull();
    expect(originOf("not a url")).toBeNull();
  });
});

describe("preconnectApi", () => {
  it("warms the API in the pool its CORS reads use", () => {
    vi.stubEnv("NEXT_PUBLIC_API_MOCKING", "");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.yuvoy.in/v1");
    preconnectApi();
    // Without `crossorigin` the hint warms a connection the fetch never uses.
    // React writes "anonymous" as the empty value, which means the same.
    expect(hints()).toContainEqual({
      href: "https://api.yuvoy.in",
      crossOrigin: "",
    });
  });

  it("warms nothing in a mocked build, where no request leaves the page", () => {
    vi.stubEnv("NEXT_PUBLIC_API_MOCKING", "enabled");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://mocked.example.test/v1");
    preconnectApi();
    expect(hints().map((h) => h.href)).not.toContain(
      "https://mocked.example.test",
    );
  });
});
