import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * The site origin, which comes from a dashboard rather than from the repo.
 *
 * The first production deploy died here: `new URL(env)` threw at module
 * evaluation and `next build` failed collecting page data with
 * `TypeError: Invalid URL` and an input Next redacts as `[SENSITIVE]`. The
 * local build was green the whole time, because the variable is unset locally
 * and the code fell back to a literal. Nothing about the value is checkable
 * from here, so the code has to be checkable instead.
 */

async function load(value?: string) {
  vi.resetModules();
  if (value === undefined) vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
  else vi.stubEnv("NEXT_PUBLIC_SITE_URL", value);
  return import("./metadata");
}

afterEach(() => vi.unstubAllEnvs());

describe("SITE_URL", () => {
  it("falls back when the variable is unset OR empty", async () => {
    // `??` does not catch "" — and an env var created in a dashboard with no
    // value is the easiest mistake there is to make.
    expect((await load(undefined)).SITE_URL).toBe("https://app.yuvoy.in");
    expect((await load("   ")).SITE_URL).toBe("https://app.yuvoy.in");
  });

  it("assumes https for a bare domain", async () => {
    // What somebody types when the dashboard field is labelled "domain".
    expect((await load("app.yuvoy.in")).SITE_URL).toBe("https://app.yuvoy.in");
  });

  it("normalises to an origin, so no canonical ever doubles a slash", async () => {
    for (const raw of [
      "https://app.yuvoy.in/",
      "https://app.yuvoy.in",
      "  https://app.yuvoy.in/  ",
    ]) {
      expect((await load(raw)).SITE_URL).toBe("https://app.yuvoy.in");
    }
  });

  it("strips the quotes and brackets a paste brings with it", async () => {
    for (const raw of [
      '"https://app.yuvoy.in"',
      "'https://app.yuvoy.in'",
      "<https://app.yuvoy.in>",
      "`app.yuvoy.in`",
    ]) {
      expect((await load(raw)).SITE_URL).toBe("https://app.yuvoy.in");
    }
  });

  it("fails by name rather than as `Invalid URL` six frames deep", async () => {
    await expect(load("http://")).rejects.toThrow(/NEXT_PUBLIC_SITE_URL/);
  });

  it("describes a bad value by shape, since deploy logs mask it", async () => {
    // Vercel scrubs env values out of build output by literal substitution,
    // so echoing the value back prints "[SENSITIVE]" and says nothing.
    await expect(load("https://a b c, d")).rejects.toThrow(
      /length \d+, scheme yes, whitespace inside yes/,
    );
  });

  it("builds absolute, non-doubled URLs for a nested route", async () => {
    const { pageMetadata } = await load("https://app.yuvoy.in/");
    const meta = pageMetadata({
      title: "Diving in Havelock",
      description: "x".repeat(60),
      path: "/guides/diving-in-havelock",
    });
    expect(meta.openGraph?.url).toBe(
      "https://app.yuvoy.in/guides/diving-in-havelock",
    );
    expect(meta.alternates?.canonical).toBe("/guides/diving-in-havelock");
  });
});
