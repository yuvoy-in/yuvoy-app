import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression: "cannot configure an already enabled network".
 *
 * MSW throws if it is started twice, and both entry points fire twice for
 * different reasons:
 *   - the browser, because React StrictMode double-invokes effects in dev;
 *   - the server, because Next re-runs instrumentation across a hot reload.
 *
 * This reproduced as a runtime invariant violation on first load. The test
 * asserts the underlying start happens ONCE however many times it is asked
 * for, including when two callers race before the first resolves.
 */

const workerStart = vi.fn(async () => {});
const serverListen = vi.fn(() => {});

vi.mock("../../../mocks/browser", () => ({
  worker: { start: workerStart },
}));
vi.mock("../../../mocks/server", () => ({
  server: { listen: serverListen },
}));

async function freshModule() {
  vi.resetModules();
  const mod = await import("../../../mocks/start");
  mod.__resetMockStarts();
  return mod;
}

beforeEach(() => {
  workerStart.mockClear();
  serverListen.mockClear();
});

describe("startBrowserMocks", () => {
  it("starts the worker once across a StrictMode double mount", async () => {
    const { startBrowserMocks } = await freshModule();

    await startBrowserMocks();
    await startBrowserMocks();
    await startBrowserMocks();

    expect(workerStart).toHaveBeenCalledTimes(1);
  });

  it("collapses two callers that race before the first resolves", async () => {
    const { startBrowserMocks } = await freshModule();

    // StrictMode's two effect invocations are synchronous with each other —
    // the second fires long before the first `await worker.start()` settles.
    await Promise.all([startBrowserMocks(), startBrowserMocks()]);

    expect(workerStart).toHaveBeenCalledTimes(1);
  });

  it("survives the module being re-evaluated, as a hot reload does", async () => {
    const first = await import("../../../mocks/start");
    first.__resetMockStarts();
    await first.startBrowserMocks();

    // Re-evaluate the module: a module-scoped flag would reset here, which is
    // why the guard lives on globalThis.
    vi.resetModules();
    const second = await import("../../../mocks/start");
    await second.startBrowserMocks();

    expect(workerStart).toHaveBeenCalledTimes(1);
  });
});

describe("startServerMocks", () => {
  it("listens once across repeated instrumentation.register() calls", async () => {
    const { startServerMocks } = await freshModule();

    await startServerMocks();
    await startServerMocks();

    expect(serverListen).toHaveBeenCalledTimes(1);
  });

  it("keeps the two sides independent", async () => {
    const { startBrowserMocks, startServerMocks } = await freshModule();

    await startBrowserMocks();
    await startServerMocks();

    expect(workerStart).toHaveBeenCalledTimes(1);
    expect(serverListen).toHaveBeenCalledTimes(1);
  });
});
