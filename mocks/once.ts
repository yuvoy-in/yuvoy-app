/**
 * A start-once guard, shared by both sides and importing NOTHING.
 *
 * Zero imports is the point. This file is reachable from the browser bundle
 * and from the Next server, so anything it pulled in would be pulled into both
 * — which is exactly the bug that split this module in two.
 *
 * The slot holds the PROMISE rather than a boolean: two callers racing before
 * the first start resolves must await the same start, and a flag set after the
 * await would let both through.
 *
 * On `globalThis` rather than module scope because Next re-evaluates modules
 * across a Turbopack hot reload, which would reset a module-scoped flag.
 */

type Slot = { promise?: Promise<void> };

export function startOnce(
  key: symbol,
  start: () => Promise<void>,
): Promise<void> {
  const g = globalThis as Record<symbol, unknown>;
  if (!g[key]) g[key] = {} satisfies Slot;
  const slot = g[key] as Slot;
  slot.promise ??= start();
  return slot.promise;
}

export function resetOnce(key: symbol): void {
  const g = globalThis as Record<symbol, unknown>;
  const slot = g[key] as Slot | undefined;
  if (slot) slot.promise = undefined;
}

export const BROWSER_KEY = Symbol.for("yuvoy.msw.browser");
export const SERVER_KEY = Symbol.for("yuvoy.msw.server");
