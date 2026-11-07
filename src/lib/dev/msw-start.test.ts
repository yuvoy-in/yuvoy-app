import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Two regressions live here, both of which reached the owner's browser.
 *
 * 1. "cannot configure an already enabled network" — MSW throws if started
 *    twice, and both entry points fire twice for different reasons: React
 *    StrictMode double-invokes effects, and Next re-runs instrumentation
 *    across a hot reload.
 *
 * 2. "Can't resolve 'async_hooks'" — when both starts lived in ONE module, the
 *    bundler traced msw/node into the client graph even though the import was
 *    dynamic. The build passed and `pnpm dev` did not. The two starts are now
 *    separate files that share only a guard importing nothing.
 */

const workerStart = vi.fn(async () => {});
const serverListen = vi.fn(() => {});

vi.mock("../../../mocks/browser", () => ({ worker: { start: workerStart } }));
vi.mock("../../../mocks/server", () => ({ server: { listen: serverListen } }));

async function fresh() {
  vi.resetModules();
  const { resetOnce, BROWSER_KEY, SERVER_KEY } =
    await import("../../../mocks/once");
  resetOnce(BROWSER_KEY);
  resetOnce(SERVER_KEY);
  return {
    ...(await import("../../../mocks/start-browser")),
    ...(await import("../../../mocks/start-server")),
  };
}

beforeEach(() => {
  workerStart.mockClear();
  serverListen.mockClear();
});

describe("startBrowserMocks", () => {
  it("starts the worker once across a StrictMode double mount", async () => {
    const { startBrowserMocks } = await fresh();
    await startBrowserMocks();
    await startBrowserMocks();
    await startBrowserMocks();
    expect(workerStart).toHaveBeenCalledTimes(1);
  });

  it("collapses two callers that race before the first resolves", async () => {
    const { startBrowserMocks } = await fresh();
    // StrictMode's two effect invocations are synchronous with each other —
    // the second fires long before the first start settles.
    await Promise.all([startBrowserMocks(), startBrowserMocks()]);
    expect(workerStart).toHaveBeenCalledTimes(1);
  });

  it("survives the module being re-evaluated, as a hot reload does", async () => {
    const first = await fresh();
    await first.startBrowserMocks();

    // A module-scoped flag would reset here, which is why the guard is on
    // globalThis.
    vi.resetModules();
    const second = await import("../../../mocks/start-browser");
    await second.startBrowserMocks();

    expect(workerStart).toHaveBeenCalledTimes(1);
  });
});

describe("startServerMocks", () => {
  it("listens once across repeated instrumentation.register() calls", async () => {
    const { startServerMocks } = await fresh();
    await startServerMocks();
    await startServerMocks();
    expect(serverListen).toHaveBeenCalledTimes(1);
  });

  it("keeps the two sides independent", async () => {
    const { startBrowserMocks, startServerMocks } = await fresh();
    await startBrowserMocks();
    await startServerMocks();
    expect(workerStart).toHaveBeenCalledTimes(1);
    expect(serverListen).toHaveBeenCalledTimes(1);
  });
});

describe("environment separation", () => {
  /**
   * Scan CODE, not prose — these files explain the rule in their own comments,
   * and a scanner that reads them flags the file for documenting itself. The
   * palette test learned the same lesson.
   */
  async function code(path: string): Promise<string> {
    const { readFileSync } = await import("node:fs");
    return readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  it("the browser start never reaches the Node side", async () => {
    // The source-level guarantee behind the async_hooks failure: mention the
    // server module here and the bundler pulls msw/node into the client graph,
    // where async_hooks does not exist.
    const src = await code("mocks/start-browser.ts");
    expect(src).not.toMatch(/["'`][^"'`]*\/server["'`]/);
    expect(src).not.toMatch(/msw\/node/);
  });

  it("the server start never reaches the browser side", async () => {
    const src = await code("mocks/start-server.ts");
    expect(src).not.toMatch(/["'`][^"'`]*\/browser["'`]/);
    expect(src).not.toMatch(/msw\/browser/);
  });

  it("the shared guard imports nothing at all", async () => {
    // Reachable from both bundles, so anything it imports is pulled into both.
    const src = await code("mocks/once.ts");
    expect(src).not.toMatch(/^\s*import /m);
  });
});

describe("a mock worker that never finished installing (yuvoy-app#256)", () => {
  /*
    jsdom has no service workers, so each test hands the page a container
    of its own: who controls the page, and which registrations exist.
  */
  function registration(state: "installing" | "active", path: string) {
    const worker = { scriptURL: `http://localhost:3000${path}` };
    return {
      installing: state === "installing" ? worker : null,
      waiting: null,
      active: state === "active" ? worker : null,
      unregister: vi.fn(async () => true),
    };
  }

  function serve(controller: object | null, registrations: object[]) {
    const getRegistrations = vi.fn(async () => registrations);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { controller, getRegistrations },
    });
    return getRegistrations;
  }

  afterEach(() => {
    Reflect.deleteProperty(navigator, "serviceWorker");
  });

  it("unregisters it before the worker starts, when nothing is active", async () => {
    const stalled = registration("installing", "/mockServiceWorker.js");
    serve(null, [stalled]);
    const { startBrowserMocks } = await fresh();
    await startBrowserMocks();
    expect(stalled.unregister).toHaveBeenCalledTimes(1);
    expect(workerStart).toHaveBeenCalledTimes(1);
    expect(stalled.unregister.mock.invocationCallOrder[0]).toBeLessThan(
      workerStart.mock.invocationCallOrder[0],
    );
  });

  it("leaves an active worker to MSW's own reload, as after a hard reload", async () => {
    const active = registration("active", "/mockServiceWorker.js");
    serve(null, [active]);
    const { startBrowserMocks } = await fresh();
    await startBrowserMocks();
    expect(active.unregister).not.toHaveBeenCalled();
    expect(workerStart).toHaveBeenCalledTimes(1);
  });

  it("looks at nothing while a worker controls the page", async () => {
    const stalled = registration("installing", "/mockServiceWorker.js");
    const getRegistrations = serve({}, [stalled]);
    const { startBrowserMocks } = await fresh();
    await startBrowserMocks();
    expect(getRegistrations).not.toHaveBeenCalled();
    expect(stalled.unregister).not.toHaveBeenCalled();
  });

  it("leaves a worker that is not the mock one alone", async () => {
    const app = registration("installing", "/sw.js");
    serve(null, [app]);
    const { startBrowserMocks } = await fresh();
    await startBrowserMocks();
    expect(app.unregister).not.toHaveBeenCalled();
    expect(workerStart).toHaveBeenCalledTimes(1);
  });
});
