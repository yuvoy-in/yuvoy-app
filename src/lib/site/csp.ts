/**
 * Content-Security-Policy for the traveller app — yuvoy-app#23.
 *
 * ## Why this app and not another
 *
 * The booking status token IS the credential. Checkout is unauthenticated on
 * purpose, so whoever holds that token can open the booking, read the
 * traveller's name and reference, share it, and cancel it. It lives in the URL
 * fragment and in IndexedDB, and every defence around it — IndexedDB rather
 * than localStorage, `scrubUrl` before any reporter sees it, PostHog's
 * `sanitize_properties` — assumes no attacker script is running in the page.
 *
 * `connect-src` is that assumption made enforceable. With it, a script that
 * reads every stored token has nowhere to post them.
 *
 * ## The exfiltration channels, which are not only connect-src
 *
 * A tight `connect-src` alone is not enough, because a script can also send
 * data out through an image request, a form post, or a rewritten `<base>`.
 * So `img-src`, `media-src`, `font-src` and `form-action` are enumerated
 * rather than left to a permissive `default-src`, and `default-src` is
 * `'none'` so a directive nobody thought of fails closed.
 *
 * ## Why there is no nonce, which is the part to read before changing this
 *
 * The documented Next shape for `script-src` is a per-request nonce minted in
 * `middleware.ts`. It cannot be used here: a page only learns its nonce by
 * reading `headers()`, and that opts the route out of static rendering. This
 * app prerenders `/account`, `/trips`, `/trips/recover`, `/offline` and every
 * guide, and `scripts/check-prerender.mjs` asserts exactly which routes are
 * baked and which must not be — a nonce would turn that list inside out for a
 * directive that is not the one carrying the weight here.
 *
 * So `script-src` keeps `'unsafe-inline'`, for Next's own streamed RSC
 * payload (`self.__next_f.push(...)`), and the honest statement of what this
 * policy is worth is: it does not stop a script from RUNNING, it stops one
 * from PHONING HOME. That is the difference between a bug and a breach, and
 * it is the whole of what yuvoy-app#23 asked for. Note that `'unsafe-inline'`
 * in `script-src` weakens nothing else in this policy.
 *
 * ## Rollout — now enforced
 *
 * Shipped report-only on 9 Sep 2026 and enforced the same day, on the owner's
 * call, against evidence rather than a waiting period.
 *
 * The evidence is `pnpm verify` run with this policy ENFORCED: 87 end-to-end
 * tests drive the real production build in a real browser, and a directive
 * that blocks anything they touch fails the suite rather than a traveller.
 * That covers every route, the service worker, the feed, checkout and the
 * offline shell.
 *
 * **What it does not cover, stated plainly.** The e2e suite runs against MSW
 * mocks, so no request actually leaves for `api.yuvoy.in`, `eu.i.posthog.com`
 * or Cloudflare Stream. Those three are in the policy from reading every
 * call site rather than from watching one succeed, which is why each is a
 * host or a subdomain wildcard rather than an exact URL, and why the
 * report-only header stays alongside: it now carries the SAME policy, so a
 * production violation is still reported even though the enforced copy would
 * already have blocked it. When the two agree, report-only costs one header
 * and buys the console line that says which directive did it.
 */

/** An origin, or nothing when the URL is unusable. Never a path. */
function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Cloudflare Stream, which serves three different things to three different
 * directives: poster frames (`img-src`), the HLS manifest and its segments
 * (`connect-src`, because hls.js fetches them with XHR), and the media itself
 * on Safari's native HLS path (`media-src`, where `video.src` is set directly).
 * Getting any one of the three wrong is a feed of black rectangles, which is
 * the entire product.
 */
const STREAM = ["https://*.cloudflarestream.com", "https://videodelivery.net"];

export interface CspEnv {
  apiUrl?: string;
  posthogHost?: string;
  /** Development needs HMR's websocket and eval; production must not have them. */
  dev?: boolean;
}

/** The full policy, as an ordered directive list. */
export function cspDirectives(env: CspEnv): string[] {
  const api = originOf(env.apiUrl);
  const posthog = originOf(env.posthogHost);

  const connect = [
    "'self'",
    ...STREAM,
    ...(api ? [api] : []),
    ...(posthog ? [posthog] : []),
    // Next's dev server and MSW talk over a websocket to the same host.
    ...(env.dev ? ["ws:", "wss:"] : []),
  ];

  return [
    // Fails closed: a directive nobody thought of inherits 'none'.
    `default-src 'none'`,
    // See the docblock. No nonce, on purpose, and `'unsafe-eval'` only in dev,
    // where Next's HMR needs it and no traveller is present.
    `script-src 'self' 'unsafe-inline'${env.dev ? " 'unsafe-eval'" : ""}`,
    // Next and `next/image` both set inline styles, and the design system
    // drives animation state through them. A style is not a script: this is a
    // much smaller concession than the same token in `script-src`.
    `style-src 'self' 'unsafe-inline'`,
    // `data:` for the blur placeholders `next/image` inlines.
    `img-src 'self' data: ${STREAM.join(" ")}`,
    // `blob:` because hls.js plays through Media Source Extensions, which
    // assigns a blob URL to the video element.
    `media-src 'self' blob: ${STREAM.join(" ")}`,
    // Self-hosted through `next/font/local`. No font CDN, deliberately.
    `font-src 'self'`,
    `connect-src ${connect.join(" ")}`,
    // The service worker, and hls.js's own worker, which it spawns from a blob.
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    // Nothing is framed today. When a payment provider's widget arrives it
    // will need naming here, and it should be named rather than opened up.
    `frame-src 'none'`,
    // The three that cost nothing, plus form-action — another way out for a
    // script that has read a token.
    `object-src 'none'`,
    `base-uri 'none'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ];
}

/**
 * The whole policy is enforced.
 *
 * It was a three-directive subset for one day. Kept as its own function rather
 * than collapsed into `reportOnlyCsp` so that narrowing it again is a one-line
 * change with a place to put the reason — which is what it existed for, and
 * what it would be needed for again if a report ever showed a directive too
 * tight to hold.
 */
export function enforcedCsp(env: CspEnv): string {
  return cspDirectives(env).join("; ");
}

export function reportOnlyCsp(env: CspEnv): string {
  return cspDirectives(env).join("; ");
}

/** Both headers, in the shape `next.config.ts` wants. */
export function cspHeaders(env: CspEnv): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: enforcedCsp(env) },
    {
      key: "Content-Security-Policy-Report-Only",
      value: reportOnlyCsp(env),
    },
  ];
}
