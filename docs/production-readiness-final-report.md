# Production readiness: final report

6 October 2026 · the traveller app (`yuvoy-app`) and the operator portal (`yuvoy-operator`).

The app's work is [yuvoy-app#161](https://github.com/yuvoy-in/yuvoy-app/pull/161). The portal's is
[yuvoy-operator#152](https://github.com/yuvoy-in/yuvoy-operator/pull/152) and
[yuvoy-operator#153](https://github.com/yuvoy-in/yuvoy-operator/pull/153). The API changes it needs are
[yuvoy-api#282](https://github.com/yuvoy-in/yuvoy-api/issues/282). All of the frontend work is merged into `dev` and
none of it is on `main`: production waits for the owner's "ship it". The same report sits in both
repos.

## Executive summary

Neither product was slow in the browser. On a phone profile with the CPU slowed 4x, total blocking
time was 40-55ms on every page measured. The time went elsewhere:

- **Every server render crossed the world.** Both products ran their functions in Washington, the
  Vercel default, while the API and nearly every user are in India. That cost about 210ms on every
  dynamic request and about 205ms on every API read the server made. The feed's first byte was
  730ms, and a portal check-in made its reads one after another from there.
- **Pages that asked to be cached were not.** A business's page took 1.0s to its first byte,
  against 84ms for a listing, because its `revalidate` did nothing without `generateStaticParams`.
- **The network paid twice.** Every browser read to the API sent a CORS preflight first, and the
  first request to the API and to the video host each paid about 550ms of connection setup.
- **Search's largest paint was the slowest in the app,** 4.2s on a throttled phone, because its
  first tile waited for the bundle and then a round trip.
- **Nothing had a deadline.** A stalled API was a blank feed for every visitor and held a portal
  render for minutes, and server retries never reached the API: Next answered them from the failed
  attempt.
- **Security and privacy gaps.** Another site could sign a visitor into the attacker's account; an
  encoded path walked out of the proxy's allowlist; a printed scan code could be an open redirect; a
  sign-out tapped with no signal signed the previous person back in on a shared phone; and a
  setting on PostHog's side could have sent booking and invitation tokens to the vendor.

Each fix is its own commit, guarded by a test that failed on the old code, or by a build or static
check proven to fire.

**Assessment:** both products are ready for production on the owner's "ship it". The largest open
risk is operational, not code: production runs on Vercel's Hobby plan. The gain on production is
not measured yet, and can only be after the release.

## Initial baseline

### How it was measured

- **Live production** (`app.yuvoy.in`, `operators.yuvoy.in`) on 6 October 2026, before any change.
- **Page loads:** Playwright's Chromium with the Pixel 7 profile, Slow 4G (150ms latency, 1.6 Mbps
  down, 675 kbps up) and the CPU slowed 4x, the service worker blocked, three cold loads per page,
  medians. Layout shift uses web-vitals session windows, blocking time is summed from long tasks,
  and bytes are as transferred.
- **Server timing:** curl's time to first byte, the median of repeated requests. The page-load
  harness's own first-byte figure is not used: Chromium's throttling does not add its latency to the
  navigation request, so it reads 70-98ms on pages curl puts at 300-1,000ms.
- **Function invocations:** `x-vercel-id` on every request of one cold page view.
- **The portal's signed-in screens** cannot be loaded live without an operator's account, so they
  were measured in code (the reads each screen makes, and in what order) and on its public routes.

### Page loads (Slow 4G, CPU 4x slower, medians of three)

| Page                                      | FCP     | LCP     | LCP element           | CLS    | TBT  | Requests | Transferred | Script |
| ----------------------------------------- | ------- | ------- | --------------------- | ------ | ---- | -------- | ----------- | ------ |
| `/` (the feed)                            | 2,432ms | 2,432ms | the reel's title      | 0.024  | 43ms | 51       | 1,351KB     | 275KB  |
| `/e/havelock-night-kayak-bioluminescence` | 1,556ms | 1,556ms | the poster            | 0      | 42ms | 46       | 1,918KB     | 240KB  |
| `/search`                                 | 1,544ms | 4,156ms | the first tile        | 0.0002 | 55ms | 56       | 721KB       | 245KB  |
| `/guides`                                 | 1,396ms | 1,396ms | the intro             | 0.0001 | 41ms | 39       | 427KB       | 234KB  |
| `/o/blue-dunghi-divers`                   | 2,708ms | 2,708ms | the business's about  | 0.018  | 45ms | 37       | 817KB       | 217KB  |
| `/trips`                                  | 1,528ms | 2,732ms | the signed-out prompt | 0      | 40ms | 32       | 403KB       | 236KB  |

Fonts were 125KB on every page (four files), video 770KB on the feed and 1,077KB on a listing, and
images 438KB on a listing and 443KB on a business's page. No page threw, and none logged a console
error. hls.js and PostHog load only when they are needed.

### Server timing (curl, time to first byte, medians)

| Request                                           | First byte | What it shows                     |
| ------------------------------------------------- | ---------- | --------------------------------- |
| A static file (`/icon.svg`)                       | 87ms       | the edge alone                    |
| An app function that reads nothing (`/api/v1/me`) | 295ms      | a function in Washington (`iad1`) |
| `/` (the feed)                                    | 730ms      | plus one API read from Washington |
| `/search`                                         | 305ms      | a function, no server read yet    |
| `/guides/diving-in-havelock`                      | 430ms      |                                   |
| `/o/blue-dunghi-divers`                           | 1,004ms    | rendered on every request         |
| `/e/<slug>` and `/trips`                          | 84-87ms    | served from the cache             |
| The API, `GET /reels`, called directly            | 309ms      | 207ms of it inside the API        |
| The portal's `/sign-in`                           | 439ms      | a function in Washington          |
| The portal's `/today`, signed out (a redirect)    | 319ms      | a function in Washington          |

The first request to `api.yuvoy.in` and to the video host took about 716ms, against about 160ms for
the next one on the same connection.

### Function invocations per cold page view

`/` 5, `/e/<slug>` 7, `/guides` 5, and `/search` 15, of which 10-11 are prefetches of the tiles'
`/search/r/<id>`, a dynamic route.

### Builds

Both built clean with no warnings, the app in about 18s and the portal in about 17s.

## Major findings

P0 is a live production failure or a breach in progress, P1 a serious defect or exposure, P2 a real
cost or a narrower risk, P3 polish. Nothing found was P0.

| Severity | Product | Finding                                                                                                                     | Status      |
| -------- | ------- | --------------------------------------------------------------------------------------------------------------------------- | ----------- |
| P1       | Both    | Functions in Washington: about 210ms per dynamic request and 205ms per server API read                                      | Fixed       |
| P1       | Both    | No request had a deadline: a stalled API held a render for the platform's five minutes, and server retries never reached it | Fixed       |
| P1       | Both    | Under Next's patched fetch an abort could be lost after a garbage collection, so a deadline could fail to end the request   | Fixed       |
| P1       | App     | A stalled API was a blank feed for every visitor                                                                            | Fixed       |
| P1       | App     | Search's first tile, its LCP, waited for hydration and a round trip: 4.2s                                                   | Fixed       |
| P1       | App     | Login CSRF: another site could sign a visitor into the attacker's account                                                   | Fixed       |
| P1       | App     | A sign-out with no signal signed the previous person back in on the next load, trips and all                                | Fixed       |
| P1       | Portal  | Each boarding check-in and each decline rendered the whole screen twice, and the next tap queued behind the second render   | Fixed       |
| P1       | Portal  | A refresh with no signal swapped the portal for the browser's offline page                                                  | Fixed       |
| P1       | Both    | Production runs on Vercel Hobby: non-commercial terms, and an overage can pause every deployment                            | Open: owner |
| P2       | App     | Business pages rendered on every request (1.0s first byte) though they asked to be cached                                   | Fixed       |
| P2       | App     | A CORS preflight before every browser read to the API                                                                       | Fixed       |
| P2       | App     | About 550ms of connection setup on the first API and video request                                                          | Fixed       |
| P2       | App     | An encoded path (`%252e%252e`) walked out of the proxy's allowlist                                                          | Fixed       |
| P2       | App     | A scan code's target could send every printed QR code to another site                                                       | Fixed       |
| P2       | Both    | `NEXT_PUBLIC_API_MOCKING` set by mistake on production would ship fixtures, with every screen looking healthy               | Fixed       |
| P2       | Both    | Nothing pinned the region, so losing the line would cost about 400ms a page with every test still green                     | Fixed       |
| P2       | App     | PostHog's own settings could switch on capture that carries the booking and invitation tokens, past the scrubbing           | Fixed       |
| P2       | App     | Signing out forgot the invitations list but not each invitation opened                                                      | Fixed       |
| P2       | App     | A booking saved on the phone showed a spinner instead, once the phone had gone offline                                      | Fixed       |
| P2       | App     | A double tap sent a message twice, and a new message pushed an older one off the screen                                     | Fixed       |
| P2       | Portal  | An expired session on Verification read "we cannot tell you where you stand", with a reload that could never work           | Fixed       |
| P2       | Portal  | The root layout waited for the session check before starting the chrome's four reads, under every signed-in screen          | Fixed       |
| P2       | Portal  | Reads asked twice in one render (the manifest, `/me`, `/profile`)                                                           | Fixed       |
| P2       | App     | Search makes 10-11 function invocations per view by prefetching its tiles                                                   | Open        |
| P2       | App     | No error reporting from browsers in production                                                                              | Open: owner |
| P2       | Both    | Per-IP limits on the API see Vercel's addresses, not the person's                                                           | Open: API   |
| P3       | App     | The booking pass token was forwarded unbounded                                                                              | Fixed       |
| P3       | App     | A saved answer was overwritten by an older status read landing after it                                                     | Fixed       |
| P3       | App     | Help read `/me` itself, and when signed out too                                                                             | Fixed       |
| P3       | Portal  | A comment said `OWNER` cannot be assigned; it can, since D31                                                                | Fixed       |

## Changes implemented

### Performance

| Change                                                                                                                              | Product | Guard                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------ |
| Functions run in Mumbai (`bom1`), beside the API. Hobby allows one region, and this is it                                           | Both    | `region.test.ts` pins `vercel.json`                          |
| Business pages (`/o/[slug]`, `/o/[slug]/listings`) are cached on first visit                                                        | App     | `check-prerender` fails a `revalidate` Next never registered |
| Browser reads carry no `Content-Type`, so they are simple requests with no preflight; writes still declare JSON                     | App     | Unit test on the client's headers                            |
| The API connection is warmed on the feed, Search, a listing and checkout, and the player warms its video host from its first render | App     | Unit tests                                                   |
| One render per boarding check-in and per decline: the revalidating action's answer is the render, and the extra refresh is gone     | Portal  | Unit tests                                                   |
| The chrome's reads start beside the session check, so the first byte waits on the slowest read rather than on two in a row          | Portal  | `auth-gate.test.ts` pins the order of the waits              |
| Reads asked twice in one render are shared through React `cache`: the manifest, `/me` and `/profile`                                | Portal  | QA: those reads only through their cached readers            |
| Help uses the account read every screen shares, and asks nothing when signed out                                                    | App     | Component test                                               |

### Core Web Vitals

| Change                                                                                                                                                                 | Product | Guard                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| Search sends its first page with the HTML (the feed's 3s budget, through `firstReelsPage`), so its first tile, the LCP, no longer waits for hydration and a round trip | App     | e2e measures both waits through two mock scenarios; the audit asserts the server resolves Search |
| The feed renders without its first page after 3s, where it used to wait without limit, and the browser asks for it with its own loading state                          | App     | Unit test with a read that never answers                                                         |

### Data and API

| Change                                                                                                                                                                                                                                                                                                                                                                                                                               | Product | Guard                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | -------------------------------------------------------- |
| `fetchWithin`: every request has a deadline that times silence, not the whole transfer, so a slow link that is still delivering is never cut off. In the app, browser reads 12s, server reads 6s, writes 30s and never retried, and the proxy waits 8s for a read and 25s for a write, under the browser's own, so it answers first. In the portal, reads 6s and then a retry on a fresh connection, writes 25s and never sent twice | Both    | Unit tests; QA fails a bare `fetch()` outside the module |
| A deadline's abort survives Next's patched fetch: `fetchWithin` always hands fetch a URL and an init with its own signal                                                                                                                                                                                                                                                                                                             | Both    | Unit test pins what fetch is handed                      |
| Server retries reach the API: a read with a signal is not memoised by Next, so a retry is a new request                                                                                                                                                                                                                                                                                                                              | Both    | Unit tests                                               |
| The proxy, sign-in, session check, adoption and pass answer in the envelope with 502 or 504 when the API call fails, never a bare 500, and log the cause                                                                                                                                                                                                                                                                             | App     | Route tests                                              |
| One send per message: the form decides once, since the API takes no key to fold two                                                                                                                                                                                                                                                                                                                                                  | App     | Component test                                           |
| The first page of a conversation is kept as it stood, so earlier messages stay on screen, and "See earlier messages" stops at the start                                                                                                                                                                                                                                                                                              | App     | Component tests                                          |
| A save cancels a status read already on its way before writing the answer                                                                                                                                                                                                                                                                                                                                                            | App     | Component test                                           |
| Verification sends an expired session to sign in                                                                                                                                                                                                                                                                                                                                                                                     | Portal  | Page test                                                |

### Caching

| Change                                                                                                                                        | Product | Guard             |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------- |
| An empty `generateStaticParams` makes the business pages cached on first visit (`revalidate = 300`)                                           | App     | `check-prerender` |
| The screens are told when the server read a cached seed, and read a stale one again on mount rather than trusting it for another five minutes | App     | Component test    |
| Every session and proxy answer is `private, no-store`, never the platform's `public, max-age=0`                                               | App     | Unit tests        |
| Signing out or in forgets each invitation opened, not only the list                                                                           | App     | Unit test         |

### Loading, error, empty and offline

| Change                                                                                                                                                                                                  | Product | Guard                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------- |
| A booking saved on the phone shows at once when the phone is offline: the status read runs in `networkMode: "always"`, so an offline read fails instead of waiting                                      | App     | Hook test offline                                                            |
| A sign-out with no signal stays done: it writes `yv_signed_out` first, the server counts no session while it is set, and the next session check ends the session, clears both cookies and tells the API | App     | Unit, route and e2e tests (sign in, go offline, sign out, come back, reload) |
| Every refresh the portal asks for on its own checks `navigator.onLine` first (ten places), and the shared schedule drops a forced re-read with no signal. A Refresh the operator taps is still theirs   | Portal  | QA: `router.refresh()` needs the signal check outside an explicit tap        |
| Sign-out clears the cookie at once and tells the API afterwards, so a slow API cannot leave the phone signed in                                                                                         | App     | Route test                                                                   |

### Responsive

No change in this pass. The UX stability pass covered layouts from 360px to 1280px on 6 October, and
nothing new was found.

### Accessibility

No change in this pass, and none was needed by what changed: every new state reuses existing
components. axe runs in 9 of the app's 31 e2e suites and 24 of the portal's 30, inside both gates.

### Security

| Change                                                                                                                                                                           | Product | Guard                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------- |
| The session routes and the proxy require `Sec-Fetch-Site: same-origin` (or a matching `Origin` where no Fetch Metadata is sent), a body declared JSON, and refuse document loads | App     | Unit tests, a forged `text/plain` form among them       |
| Each proxied path segment is encoded again before it joins the upstream path, and a bare dot segment is refused                                                                  | App     | Unit tests with `%252e%252e`                            |
| `/go/[code]` sends a scan only to a path on this site (`safeNextPath`), else to the feed                                                                                         | App     | Route tests with absolute and protocol-relative targets |
| The booking pass token is bounded at 512 characters before it is forwarded                                                                                                       | App     | Route test                                              |
| A production build refuses `NEXT_PUBLIC_API_MOCKING=enabled`, beside the `[SENSITIVE]` guard                                                                                     | Both    | Config tests, proven to fail without the call           |
| Only the value `1` of `yv_signed_out` counts, so a cleared cookie still reported empty can never sign anybody out                                                                | App     | Unit test                                               |
| The role change's comment says what the code does: `OWNER` is assignable (D31), and the schema refuses anything outside the four roles                                           | Portal  | None needed: a comment                                  |

### Media

| Change                                                                                                | Product | Guard     |
| ----------------------------------------------------------------------------------------------------- | ------- | --------- |
| The player warms its video host from its first render, in the credentialed pool native HLS loads from | App     | Unit test |

Posters stay at the video host's 360 x 640 (see Remaining issues).

### SEO

The business pages are now served from the cache, so a crawler gets them at a cached page's speed.
Nothing else changed; `docs/SEARCH_INDEXING.md` in the app still describes its indexing.

### Observability

| Change                                                                                                                                                                                  | Product | Guard             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------- |
| PostHog: `disable_capture_url_hashes`, replay and heatmaps off in code, and `sanitize_properties` scrubs every property, so `$session_entry_url` and `$initial_current_url` are covered | App     | `posthog.test.ts` |
| `scrubUrl` also redacts the path tokens of `/i/{token}` and `/trip/{token}`                                                                                                             | App     | `scrub.test.ts`   |
| Each route that answers 502 or 504 logs the cause, and the feed and Search log a server read that fell back to the browser                                                              | App     | Route tests       |

### Testing

- Every new test was run against the old code first and failed there, and each static check was
  run against a probe that breaks its rule.
- New static checks: QA fails a bare `fetch()` outside `fetchWithin` (both), a portal
  `router.refresh()` without the signal check, and a portal read of `/me`, `/profile` or `/requests`
  outside its cached reader. `check-prerender` fails a `revalidate` Next never registered. Both
  `next.config` files refuse fixtures on production, and both repos pin the region.
- Adversarial cases are in the suites: a forged cross-site sign-in, encoded traversal, absolute and
  protocol-relative redirect targets, an oversized pass token, a cleared sign-out cookie still
  reported empty, an API that never answers, an answer that stops halfway, a slow answer still
  arriving (never cut off), and a sign-out with no signal followed by a reload.

## Measurements

Real numbers only. The baseline above is production before any change.

**After-numbers are not taken yet.** Every change that moves a production figure (the region, the
edge cache, the preconnects, Search's server read) acts only on production, and nothing here starts
a server outside the e2e gate. The same harness and the same curl runs are repeated on production
after the release, against these:

| Figure                          | Before                                   | What should move it        |
| ------------------------------- | ---------------------------------------- | -------------------------- |
| The feed's first byte           | 730ms                                    | the region                 |
| A business page's first byte    | 1,004ms                                  | the cache                  |
| Search's LCP on Slow 4G         | 4,156ms                                  | the first page in the HTML |
| A function that reads nothing   | 295ms                                    | the region                 |
| The portal's sign-in first byte | 439ms                                    | the region                 |
| Preflights per cold view        | 1 on the feed and a listing, 2 on Search | no `Content-Type` on reads |

Measured on the changed code, before the release: before the abort fix, a Node experiment aborted
at 1s ran its full 4s, and in the e2e suite a 3s server budget let a render wait 4.5s. The suite's
budget checks pass now.

## Regression testing

- **The app's gate** on `372d84b`, the tree in #161 before this report: typecheck, ESLint (with the
  `isError` ban), the long-dash check, Prettier, the QA sweep, 2,094 unit tests in 167 files, the
  contract check, a production build, the prerender check, and the full e2e suite against that
  build: 511 passed and 45 skipped, in 4.2 minutes.
- **The portal's gate** on `9e30cd7`, the tree in #153 before this report: the same steps plus the
  token check, 2,384 unit tests in 228 files run twice (on today's clock and a week ahead), and the
  full e2e suite: 832 passed and 60 skipped, in 7.7 minutes. On #152 it passed with 2,380 unit tests
  and 832 e2e.
- **The commits that add this report** add the region and sign-out cookie tests and the comment, and
  ran the same gates; their numbers are on each PR.
- **The UX stability pass is not reopened.** Its guards run inside both gates and pass: in both,
  `e2e/early-input.spec.ts`, `motion.spec.ts` and the `useChangedBeforeHydration` QA check; in the
  app, `motion-webkit.spec.ts`, `address.spec.ts` and the `isError` ban; in the portal, the
  loading-boundary checks. Nothing in this pass touched the tab bar, the transitions, the sheets or
  the fonts.
- **One existing test changed, on purpose:** the e2e Search skeleton check now measures both waits
  through two mock scenarios, since Search's first page comes from the server.
- **Not re-run:** the UX pass's torture scripts, which run outside the gates, and real devices.

## Remaining issues

| Issue                                                                                                                             | Severity  | Impact                                                                                                              | Why it is not fixed here                                                                            | Next action                                                                               |
| --------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Production is on Vercel Hobby                                                                                                     | P1        | Non-commercial terms; an overage can pause every deployment; 1M invocations and 5,000 image transformations a month | A plan and a bill                                                                                   | **Owner:** move the team to Pro                                                           |
| Search prefetches each tile's `/search/r/<id>`, a dynamic route: 10-11 of its 15 invocations per view                             | P2        | Invocations against Hobby's monthly million                                                                         | A tile opens at once because of it, and on Pro it is cheap                                          | **Frontend:** count invocations after the release; prefetch on intent only if Hobby stays |
| No error reporting from browsers in production                                                                                    | P2        | A failure on a traveller's phone is seen only if they say so                                                        | A vendor and a consent decision; the scrubbing seam is ready                                        | **Owner:** choose a vendor, or PostHog exceptions for consented travellers                |
| Per-IP limits key on Vercel's addresses: invite redemption through the app's proxy, and the portal's sign-in code from its server | P2        | Everyone signing in to the portal shares one budget, so a busy hour or one person can use it up for all             | The API decides whom it trusts                                                                      | **Hima:** yuvoy-api#282                                                                   |
| Message sends take no `Idempotency-Key`                                                                                           | P2        | A send whose answer is lost cannot be retried safely                                                                | The API's contract; the app sends once per tap and never retries a write                            | **Hima:** yuvoy-api#282                                                                   |
| Question answers and a listing's own questions are not documented as screened for contact details, as messages are                | P2        | A phone number can travel in an answer to the manifest                                                              | The API's rule                                                                                      | **Hima:** yuvoy-api#282                                                                   |
| The API sends no `Access-Control-Max-Age`, so a preflight is kept 5s                                                              | P2        | A booking status poll and each direct write re-pay a round trip once 5s have passed                                 | The API's headers                                                                                   | **Hima:** yuvoy-api#282                                                                   |
| The portal counts unread conversations by walking the thread list (pages of 200, up to ten) under every signed-in screen          | P2        | A busy business pays several reads before every first byte                                                          | Needs a count from the API                                                                          | **Hima:** yuvoy-api#282                                                                   |
| `X-Request-Id` is not exposed to the browser                                                                                      | P3        | A browser-side failure cannot be matched to the API's log                                                           | The API's headers                                                                                   | **Hima:** yuvoy-api#282                                                                   |
| Portal pages read `/me` before their own reads                                                                                    | P3        | One API read in series on most signed-in screens, about the API's own time once in Mumbai                           | Small after the region move, and not measurable before the release                                  | **Frontend:** measure on production; overlap the reads where the first byte shows it      |
| Offline check-ins sent back one by one render the boarding screen once each                                                       | P3        | N renders for N kept check-ins when the signal returns                                                              | Each is its own write under the offline-writes ruling (4 Oct), and a replay is rare                 | **Frontend:** batch the renders if replays grow                                           |
| The bookings list asks for 100 rows and hands whole rows to the browser                                                           | P3        | Payload on the bookings screen                                                                                      | Correct and authorised; a projection is a refactor with no measured need yet                        | **Frontend:** trim to what the rows draw when the screen next changes                     |
| Posters are the video host's 360 x 640, drawn full screen                                                                         | P3        | Soft on a 3x phone until the video starts                                                                           | Twice the size is about three times the bytes, and every poster is an image transformation on Hobby | **Owner:** decide with the plan                                                           |
| Four fonts (125KB) preload on every first visit                                                                                   | P3        | On Slow 4G they compete with the page's CSS                                                                         | The approved typography (v3.2)                                                                      | **Owner:** only if a slow first load matters more than the type                           |
| A manager who types `/team` still sees the roster, read-only                                                                      | P3        | The team's names and roles                                                                                          | The 3 Oct ruling hid the row (yuvoy-operator#117 item 4); the screen itself was not asked           | **Owner:** say whether the screen should refuse a manager too                             |
| CLS 0.024 on the feed and 0.018 on a business's page                                                                              | P3        | Within "good" (under 0.1)                                                                                           | The feed's foot settles as the first reel lands                                                     | None now                                                                                  |
| `/trips` LCP 2.7s waits on the session check                                                                                      | P3        | The prompt's paint                                                                                                  | The screen must know who is signed in before it draws trips                                         | None now                                                                                  |
| Uploads have no deadline                                                                                                          | By design | A stalled upload waits                                                                                              | An upload is long and shows its own progress                                                        | None                                                                                      |

## Production readiness assessment

**The traveller app: ready.** The release moves its functions beside the API, caches the business
pages, takes the preflight off every read, sends Search's first page with the HTML, and gives every
request a deadline. It closes login CSRF, encoded traversal, an open redirect and the shared-phone
sign-out, and keeps tokens out of analytics.

**The operator portal: ready.** The same region move and deadlines, one render per check-in, no
offline page in place of the portal, and the chrome's reads overlapped with the session check.

**Before or with the release:**

1. **Owner:** "ship it" for each product; `main` is untouched.
2. **Owner:** move Vercel to Pro. It is the one risk that can take both products down at once.
3. **Frontend, after the release:** the measurements above, on production, with the same harness.
4. **Hima:** yuvoy-api#282. None of it blocks the release.

**Not verified here:** real devices on island signal, the keyboard over forms, and Safari's handling
of the script-written sign-out cookie (its e2e runs in Chromium).
