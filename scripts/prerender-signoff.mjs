/**
 * The rules `check-prerender.mjs` holds a build to, kept apart from the file
 * reading so they can be tested without a build
 * (src/app/prerender-signoff.test.ts).
 *
 * `manifest` is Next's `.next/prerender-manifest.json`:
 *
 *   - `routes` holds every page the build prerendered, keyed by path. A page
 *     of a dynamic route names that route as `srcRoute` (`/e/try-dive` comes
 *     from `/e/[slug]`), and `initialRevalidateSeconds` is `false` for a page
 *     that never revalidates.
 *   - `dynamicRoutes` holds every dynamic route Next caches (ISR). Its
 *     `fallback` is `false` when a param the build did not see answers 404
 *     (`dynamicParams = false`), and `null` when it renders on demand.
 *
 * `signOff` is the three lists in check-prerender.mjs: `allowed` and
 * `mustBeDynamic` by path, `liveData` by dynamic route.
 */
export function prerenderProblems(
  manifest,
  { allowed, mustBeDynamic, liveData },
) {
  const routes = manifest.routes ?? {};
  const dynamicRoutes = manifest.dynamicRoutes ?? {};
  const problems = [];

  for (const [route, entry] of Object.entries(routes)) {
    if (route in allowed) continue;
    if (route in mustBeDynamic) {
      problems.push(
        `"${route}" was prerendered and must not be: ${mustBeDynamic[route]}\n` +
          `      Add \`export const dynamic = "force-dynamic"\` to its page.`,
      );
      continue;
    }

    const pattern = entry.srcRoute;
    const pageOf = pattern && pattern !== route ? pattern : null;

    if (pageOf && pageOf in liveData) {
      const every = entry.initialRevalidateSeconds;
      const most = liveData[pageOf].maxRevalidateSeconds;
      if (typeof every !== "number") {
        problems.push(
          `"${route}", a page of ${pageOf}, never revalidates. It would serve\n` +
            `      the data it was built with until the next deploy.\n` +
            `      Its page needs \`export const revalidate\`.`,
        );
      } else if (every > most) {
        problems.push(
          `"${route}", a page of ${pageOf}, revalidates every ${every}s and\n` +
            `      the sign-off allows ${most}s. Lower the page's revalidate, or\n` +
            `      raise maxRevalidateSeconds in LIVE_DATA_ROUTES with the reason.`,
        );
      }
      continue;
    }

    problems.push(
      `"${route}" is newly prerendered and nobody signed off on freezing it.\n` +
        `      If its HTML is the same whenever it is built, add it to ALLOWED\n` +
        `      in check-prerender.mjs with the reason. If it reads the clock,\n` +
        `      live data or anything per-request, opt it out instead.` +
        (pageOf
          ? `\n      It is a page of ${pageOf}. If that route's list of pages is\n` +
            `      live data, sign the route off in LIVE_DATA_ROUTES instead.`
          : ""),
    );
  }

  for (const route of Object.keys(allowed)) {
    if (!(route in routes)) {
      problems.push(
        `"${route}" is no longer prerendered. That is a performance regression\n` +
          `      unless it was deliberate. Remove it from ALLOWED if it was.`,
      );
    }
  }

  // Checked whether the build produced no pages of the route or fifty: a
  // build that reached no catalog has none, and the route must still cache.
  for (const pattern of Object.keys(liveData)) {
    const cached = dynamicRoutes[pattern];
    if (!cached) {
      problems.push(
        `"${pattern}" is no longer cached: every one of its pages is a server\n` +
          `      render per request. That is a performance regression unless it\n` +
          `      was deliberate. Remove it from LIVE_DATA_ROUTES if it was.`,
      );
    } else if (cached.fallback === false) {
      problems.push(
        `"${pattern}" answers 404 for every page the build did not see, so a\n` +
          `      listing published after a deploy stays unreachable until the\n` +
          `      next one. Its page needs \`export const dynamicParams = true\`.`,
      );
    }
  }

  return problems;
}
