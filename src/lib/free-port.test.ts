import { createServer, type Server } from "node:net";
import { describe, expect, it } from "vitest";
import { firstFreeLoopbackPort } from "../../mocks/free-port";

/**
 * The e2e run takes a free port (yuvoy-app#210). Fixed at 3100, a stray server
 * left there by an earlier run refused every test at start ("already used").
 */

/**
 * Holds a port: at 127.0.0.1, or with a null host on every address, as a stray
 * `next start` does.
 */
function hold(
  port: number,
  host: string | null = "127.0.0.1",
): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(port, host ?? undefined, () => resolve(server));
  });
}

function release(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

/** A port well away from anything the suite or the machine uses. */
function aFreePort() {
  return firstFreeLoopbackPort(41_000, 41_999);
}

describe("the first free loopback port", () => {
  it("passes over a port something else holds, and takes it once let go", async () => {
    const taken = aFreePort();
    const holder = await hold(taken);
    try {
      expect(firstFreeLoopbackPort(taken, taken + 20)).toBeGreaterThan(taken);
      expect(() => firstFreeLoopbackPort(taken, taken)).toThrow(
        `No port from ${taken} to ${taken} is free`,
      );
    } finally {
      await release(holder);
    }
    expect(firstFreeLoopbackPort(taken, taken)).toBe(taken);
  });

  it("passes over a port held on every address, as a stray server is", async () => {
    const taken = aFreePort();
    const holder = await hold(taken, null);
    try {
      expect(firstFreeLoopbackPort(taken, taken + 20)).toBeGreaterThan(taken);
    } finally {
      await release(holder);
    }
  });

  it("refuses a range that is not one", () => {
    expect(() => firstFreeLoopbackPort(3198, 3100)).toThrow(RangeError);
    expect(() => firstFreeLoopbackPort(65_530, 65_600)).toThrow(RangeError);
    expect(() => firstFreeLoopbackPort(Number.NaN, 3100)).toThrow(RangeError);
  });
});
