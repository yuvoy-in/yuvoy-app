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
  // Same build-time flag as the browser side. See msw-provider.tsx.
  if (process.env.NEXT_PUBLIC_API_MOCKING !== "enabled") return;

  /*
    EXCLUDE edge, rather than REQUIRE nodejs. The difference matters twice.

    Next compiles instrumentation for the edge runtime too, and msw/node
    imports `async_hooks`, which edge does not have — so without an edge guard
    the build fails outright. That is why the original check existed.

    But `NEXT_RUNTIME` is UNSET during `next build`'s static generation, so
    requiring "nodejs" silently skipped MSW there: every server-side fetch
    failed, the feed's prefetched first page came back null, "Loading
    experiences" was baked into the HTML, and LCP sat at 5.1s against an FCP
    of 0.8s. It read like a caching problem and was an environment-variable
    problem.

    Excluding edge satisfies both: the build and the running server proceed,
    and edge never sees msw/node.
  */
  if (process.env.NEXT_RUNTIME === "edge") return;

  const { startServerMocks } = await import("./mocks/start-server");
  await startServerMocks();
}
