/**
 * Starts MSW inside the Next server during development.
 *
 * Without this, only the browser is mocked and every server component falls
 * through to a real origin — so the experience page, which is deliberately
 * server-rendered and statically generated, could not be developed or reviewed
 * at all. Mocking one side only is how a team ends up making every screen a
 * client component to work around the tooling.
 *
 * Next re-runs this across a hot reload, so the start is idempotent. See
 * mocks/start.ts.
 *
 * Production never reaches this: the guard is on NODE_ENV and the import is
 * dynamic, so `mocks/` is not in the production graph.
 */
export async function register() {
  if (process.env.NODE_ENV !== "development") return;
  if (process.env.NEXT_PUBLIC_API_MOCKING === "disabled") return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startServerMocks } = await import("./mocks/start");
  await startServerMocks();
}
