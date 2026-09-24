/**
 * The service worker's version, stamped at build time.
 *
 * Inlined into the client as NEXT_PUBLIC_SW_VERSION and passed to
 * `register("/sw.js?v=…")`. A changed URL is a new worker to the browser: it
 * installs, precaches a fresh offline page, and its `activate` deletes the
 * previous version's caches (public/sw.js). An unchanged URL is none of that,
 * so the version must differ on every deploy and must never be empty.
 *
 * In order: the deployment (so a redeploy of the same commit, such as the one
 * that flips `NEXT_PUBLIC_INVITE_ONLY`, is a new worker too), the commit, the
 * Actions commit, and a timestamp, so every local production build is its own
 * version as well.
 *
 * `||`, never `??`. The Vercel CLI build in Actions deletes `.git` first (see
 * _deploy.yml) and got `VERCEL_GIT_COMMIT_SHA` as an empty string, not an
 * unset one. With `??` that empty string won, and production served
 * `register("/sw.js?v=")` (found 24 Sep 2026): the worker's URL never changed
 * again, and every precache outlived the deploy it was made for.
 */

type Env = Readonly<Record<string, string | undefined>>;

export function swVersion(
  env: Env = process.env,
  now: number = Date.now(),
): string {
  return (
    env.VERCEL_DEPLOYMENT_ID ||
    env.VERCEL_GIT_COMMIT_SHA ||
    env.GITHUB_SHA ||
    now.toString(36)
  ).slice(0, 12);
}
