import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import nextConfig from "../../../next.config";

/**
 * The universal link (iOS) and app link (Android) files for the traveller app
 * (B12). iOS fetches the first through Apple's CDN and gives up on a redirect
 * or a type other than JSON, and Android drops the whole host if the second
 * fails, so these pin the files, the type they go out with and that nothing
 * in next.config sends them anywhere else.
 *
 * The two ids the owner supplies start as placeholders. The shape checks
 * accept either the placeholder or a real value, so replacing them needs no
 * change here. Until then the links do nothing, by design.
 */

const ROOT = process.cwd();
const WELL_KNOWN = join(ROOT, "public", ".well-known");
const AASA = "/.well-known/apple-app-site-association";
const ASSETLINKS = "/.well-known/assetlinks.json";

const BUNDLE_ID = "in.yuvoy.app";
const TEAM_PLACEHOLDER = "REPLACE_WITH_APPLE_TEAM_ID";
const SHA_PLACEHOLDER = "REPLACE_WITH_ANDROID_SIGNING_SHA256";

/** What opens in the app. Each one is a route this app serves on the web. */
const LINKED = ["/e/*", "/booking", "/r/*", "/o/*", "/i/*", "/trip/*", "/go/*"];

const read = (name: string) =>
  JSON.parse(readFileSync(join(WELL_KNOWN, name), "utf8"));

describe("apple-app-site-association", () => {
  const aasa = read("apple-app-site-association");

  it("names the traveller app once, in the current format", () => {
    expect(aasa.applinks.details).toHaveLength(1);
    const [detail] = aasa.applinks.details;
    expect(detail.appIDs).toHaveLength(1);
    expect(detail.appIDs[0].endsWith(`.${BUNDLE_ID}`)).toBe(true);
    expect(detail.paths).toBeUndefined();
  });

  it("carries the team id placeholder or a real ten character team id", () => {
    const team = aasa.applinks.details[0].appIDs[0].split(".")[0];
    expect(team === TEAM_PLACEHOLDER || /^[A-Z0-9]{10}$/.test(team)).toBe(true);
  });

  it("links exactly the agreed paths, each one a route here", () => {
    const paths = aasa.applinks.details[0].components.map(
      (c: { "/": string }) => c["/"],
    );
    expect(paths).toEqual(LINKED);
    for (const path of paths) {
      const dir = path.replace(/\/\*$/, "");
      expect(existsSync(join(ROOT, "src", "app", dir)), path).toBe(true);
    }
  });
});

describe("assetlinks.json", () => {
  const links = read("assetlinks.json");

  it("delegates every URL on this host to the traveller app", () => {
    expect(links).toHaveLength(1);
    expect(links[0].relation).toEqual([
      "delegate_permission/common.handle_all_urls",
    ]);
    expect(links[0].target.namespace).toBe("android_app");
    expect(links[0].target.package_name).toBe(BUNDLE_ID);
  });

  it("carries the fingerprint placeholder or real SHA-256 fingerprints", () => {
    const prints: string[] = links[0].target.sha256_cert_fingerprints;
    expect(prints.length).toBeGreaterThan(0);
    for (const print of prints) {
      expect(
        print === SHA_PLACEHOLDER ||
          /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(print),
      ).toBe(true);
    }
  });
});

describe("serving", () => {
  /*
    The marketing redirects are gated on the root host, so both hosts are
    checked: the files must answer 200 on yuvoy.in too if this app takes it.
  */
  const urls = ["https://app.yuvoy.in", "https://yuvoy.in"].flatMap((origin) =>
    [AASA, ASSETLINKS].map((path) => `${origin}${path}`),
  );

  it.each(urls)("%s answers 200 as JSON with no redirect", async (url) => {
    const response = await unstable_getResponseFromNextConfig({
      url,
      nextConfig,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
  });

  it("has no proxy or middleware that could run in front of them", () => {
    /*
      There is none today. If one is added, its matcher has to leave
      /.well-known alone (no auth gate, no locale redirect), and this is the
      reminder.
    */
    for (const file of [
      "proxy.ts",
      "middleware.ts",
      "src/proxy.ts",
      "src/middleware.ts",
    ]) {
      expect(existsSync(join(ROOT, file)), file).toBe(false);
    }
  });
});
