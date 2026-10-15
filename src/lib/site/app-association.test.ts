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
 * The Apple Team ID and the EAS release signing SHA-256 are real values now,
 * so a placeholder fails the shape checks below.
 */

const ROOT = process.cwd();
const WELL_KNOWN = join(ROOT, "public", ".well-known");
const AASA = "/.well-known/apple-app-site-association";
const ASSETLINKS = "/.well-known/assetlinks.json";

const BUNDLE_ID = "in.yuvoy.app";
const TEAM_ID = "K8PFJNX7U8";
const RELEASE_SHA256 =
  "ED:E5:17:35:87:84:66:3A:F5:6F:30:02:01:AD:B4:98:92:10:5F:49:54:4A:5C:14:81:00:E1:7A:9D:79:7D:8B";

/**
 * What opens in the app, each a route this app serves on the web. The same
 * list as the app's Android intent filters (B12 AUDIT.md, "Path families
 * declared"), so iOS and Android claim the same links: change both or neither.
 * No root and no catch-all, and no /go/*: a QR scan stays in the browser so
 * the web keeps counting it.
 */
const LINKED = [
  "/booking",
  "/e/*",
  "/r/*",
  "/o/*",
  "/i/*",
  "/trip/*",
  "/trips",
  "/trips/*",
];

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

  it("carries the Yuvoy Apple Team ID", () => {
    expect(aasa.applinks.details[0].appIDs).toEqual([`${TEAM_ID}.${BUNDLE_ID}`]);
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

  it("carries the EAS release signing SHA-256 and nothing malformed", () => {
    const prints: string[] = links[0].target.sha256_cert_fingerprints;
    expect(prints).toContain(RELEASE_SHA256);
    for (const print of prints) {
      expect(print).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
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
