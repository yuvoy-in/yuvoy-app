import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * The invite switch, and the one set of rules every screen asks
 * (yuvoy-api#195).
 *
 * The switch is read at build time, so each case loads the module fresh under
 * the environment it describes, the way `indexing.test.ts` does.
 */

async function load(flag?: string) {
  vi.resetModules();
  if (flag !== undefined) vi.stubEnv("NEXT_PUBLIC_INVITE_ONLY", flag);
  return import("./access");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("the switch", () => {
  it("is off unless it says exactly true", async () => {
    expect((await load()).INVITE_ONLY).toBe(false);
    expect((await load("false")).INVITE_ONLY).toBe(false);
    /*
      The value a Sensitive NEXT_PUBLIC_ variable reaches the build as. It
      must read as off, and the runbook says so, rather than as some third
      thing.
    */
    expect((await load("[SENSITIVE]")).INVITE_ONLY).toBe(false);
    expect((await load("1")).INVITE_ONLY).toBe(false);
    expect((await load("true")).INVITE_ONLY).toBe(true);
  });

  it("takes nothing out of the index while it is off", async () => {
    const access = await load("false");
    expect(access.GATED_FROM_INDEX).toEqual([]);
    expect(access.isGatedFromIndex("/search")).toBe(false);
  });

  it("takes search out of the index while it is on, and never the front door", async () => {
    const access = await load("true");
    expect(access.isGatedFromIndex("/search")).toBe(true);
    // The landing is written for a crawler; it stays the indexable front door.
    expect(access.isGatedFromIndex("/")).toBe(false);
    expect(access.isGatedFromIndex("/guides")).toBe(false);
  });
});

describe("reading admitted off GET /me", () => {
  it("answers true and false as sent", async () => {
    const { admittedOf, standingOfAccount } = await load("true");
    expect(admittedOf({ admitted: true })).toBe(true);
    expect(admittedOf({ admitted: false })).toBe(false);
    expect(standingOfAccount({ admitted: true })).toBe("admitted");
    expect(standingOfAccount({ admitted: false })).toBe("not-admitted");
  });

  it("reads an answer without the field as NOT ASKED, never as a no", async () => {
    /*
      An API that predates `admitted` would otherwise lock every signed-in
      traveller out of the feed the day the switch flips. A pinned contract
      says what the API WILL send, not what the deployed one does.
    */
    const { admittedOf, standingOfAccount, accessOfStanding } =
      await load("true");
    for (const body of [{}, { admitted: null }, { admitted: "yes" }, null, 3]) {
      expect(admittedOf(body)).toBeUndefined();
    }
    expect(standingOfAccount({ name: "Asha" })).toBe("unknown");
    expect(accessOfStanding("unknown")).toBe("open");
  });
});

describe("what a page shows", () => {
  it("shows its content to open and admitted, and the gate to the rest", async () => {
    const { showsContent, screenOf } = await load("true");
    expect(showsContent("open")).toBe(true);
    expect(showsContent("admitted")).toBe(true);
    expect(showsContent("signed-out")).toBe(false);
    expect(showsContent("not-admitted")).toBe(false);

    expect(screenOf("open")).toBe("content");
    expect(screenOf("admitted")).toBe("content");
    expect(screenOf("signed-out")).toBe("landing");
    expect(screenOf("not-admitted")).toBe("code");
  });

  it("maps each standing to its access", async () => {
    const { accessOfStanding } = await load("true");
    expect(accessOfStanding("signed-out")).toBe("signed-out");
    expect(accessOfStanding("not-admitted")).toBe("not-admitted");
    expect(accessOfStanding("admitted")).toBe("admitted");
  });
});
