# Search ownership and indexing — the runbook

**Owner:** the `tech@yuvoy.in` role account owns the Search Console property
(decided 3 Sep 2026), so ownership survives a personnel change; Vishwanth
(`@VishwanthBarma`) is the named person and is added as a user. Search
Console alerts go to the address on the verified property; escalation is to
Vishwanth.

This is the operational half of `yuvoy-app#9`. The engineering half is done —
`src/lib/site/verification.ts` reads a token from the environment, validates
it, and the root layout emits it. What is left needs an account, not a commit.

---

## Read this first: which host are you verifying?

There are three, and they are not interchangeable.

| Host                 | Serves                                   | Indexable today                           |
| -------------------- | ---------------------------------------- | ----------------------------------------- |
| `yuvoy.in`           | **`yuvoy-web`** — marketing and waitlist | Yes                                       |
| `app.yuvoy.in`       | **this repo** — the traveller app        | **No.** `noindex`, `Disallow: /`          |
| `operators.yuvoy.in` | `yuvoy-operator`                         | Never. Noindex unconditionally, no switch |

D-102 moves the app onto `yuvoy.in` at launch and retires `yuvoy-web` to
redirects. So the property that matters in the long run is `yuvoy.in`, and it
is currently served by a different repository.

> **Decision, 3 Sep 2026 (owner, `yuvoy-app#12`):** the launch is on
> `app.yuvoy.in` and `operators.yuvoy.in`; the root cutover is deferred until
> after launch. Until it is revisited, `app.yuvoy.in` is the app's canonical
> host — `NEXT_PUBLIC_SITE_URL`, the canonicals and the audit's
> `PRODUCTION_URL` already say so — and the indexing switch applies to it.
> The Domain property below covers that host too, so nothing about
> verification changes whichever way the cutover goes.

**That is the whole argument for the DNS method below.**

## Choose the method — DNS, and here is why

`yuvoy-app#9` offers two paths. Take the first.

### 1. Domain property via DNS (recommended, and confirmed available)

> **Checked on 2 September 2026.** `yuvoy.in`'s nameservers are
> `ns55/ns56.domaincontrol.com` — GoDaddy — and the DNS records for
> `app.yuvoy.in` and `operators.yuvoy.in` were added there the same day. So
> registrar access exists and this path is open. It is not a theoretical
> recommendation.

One TXT record at the registrar (GoDaddy, where `yuvoy.in` already lives)
verifies **`yuvoy.in` and every subdomain, on both protocols** — so `yuvoy.in`,
`www.yuvoy.in`, `app.yuvoy.in` and `operators.yuvoy.in` are all covered by one
action, in one place, with no code in any of the three repositories.

It also survives the cutover. A URL-prefix property for `https://app.yuvoy.in`
becomes the wrong property the day the app takes the root domain, and somebody
has to notice.

**Steps**

1. Search Console → Add property → **Domain** → `yuvoy.in`.
2. Copy the TXT record it gives you.
3. GoDaddy → DNS → add a TXT record on the root (`@`) with that value.
   The other Yuvoy records already there stay untouched; TXT records coexist.
4. Wait for propagation, then press Verify. Confirm with:
   ```
   dig +short yuvoy.in TXT
   ```
5. Record the date and the method in a comment on `yuvoy-app#9`.
   **Never paste the token value into the issue.**

Nothing in this repository changes. The env vars below stay unset.

### 2. URL-prefix property via meta tag (fallback)

Only if DNS access is genuinely unavailable — which, per the note above, it is
not. Kept because "the DNS account is unavailable" is a sentence that becomes
true at inconvenient moments, and because a preview origin can only ever be
verified this way. It verifies exactly one origin.

> **`yuvoy-web` has no such hook**, deliberately. It serves `yuvoy.in`, which is
> the property that is actually indexable today — so if this fallback were ever
> the chosen path for the root domain, that repository would need the same
> module before the token had anywhere to go. It does not have it because the
> DNS path is open, and because D-102 retires that site to redirects at launch.
> If DNS ever closes, port `src/lib/site/verification.ts` there first.

1. Search Console → Add property → **URL prefix** → the exact origin, including
   scheme, e.g. `https://app.yuvoy.in`.
2. Choose the **HTML tag** method and copy **only the value of the `content`
   attribute** — not the whole `<meta …>` element, and not the
   `google-site-verification=…` DNS form. The build refuses all three and says
   which mistake was made.
3. Vercel → the project → Settings → Environment Variables:

   | Variable                   | Value                                 |
   | -------------------------- | ------------------------------------- |
   | `GOOGLE_SITE_VERIFICATION` | the content value                     |
   | `BING_SITE_VERIFICATION`   | Bing's `msvalidate.01` value, if used |

   **Do not prefix them with `NEXT_PUBLIC_`, and do not mark them Sensitive.**
   They are read on the server while metadata is generated and emitted into the
   HTML, so there is nothing to protect — and a `NEXT_PUBLIC_` variable marked
   Sensitive arrives at the build as the literal string `[SENSITIVE]`, which
   this project has already lost three production deploys to. `pnpm qa` fails a
   `NEXT_PUBLIC_` verification variable for that reason.

4. **Redeploy.** Environment values are read at build time; changing one in
   Vercel does nothing until a rebuild.
5. Confirm the tag is actually being served before pressing Verify:
   ```
   curl -s https://app.yuvoy.in/ | grep -o '<meta name="google-site-verification[^>]*>'
   ```

> The tag renders **even while the site is `noindex`**, deliberately. You verify
> a property before it is indexable — that is how you see crawl and coverage
> problems ahead of launch rather than after it. A test pins this so nobody
> tidies the two together.

## After verification

1. **Submit the sitemap.** `https://<host>/sitemap.xml`. Record the processed
   status, the discovered URL count, and any errors or warnings.
2. **Inspect a representative page each**, with URL Inspection: `/`, `/search`,
   `/guides`, one guide leaf, one experience. Record live-test and index status,
   and fix any crawl, canonical or noindex mismatch.
   - Expect `app.yuvoy.in` to report **"Excluded by ‘noindex’ tag"** today. That
     is correct, not a fault. It is what the indexing switch is for.
3. **Capture a dated baseline**: Page Indexing, Sitemaps, Core Web Vitals and
   Search Performance, where data exists. A property with no history has none;
   say so rather than recording zeros as a measurement.
4. **Bing**: verify independently, or import the Google property, or write down
   that it is deferred and who owns it. All three are acceptable; silence is not.

## The cadence

- After every content batch and every major launch.
- Monthly at minimum while the SEO programme is active.
- Whatever Search Console emails about, when it emails.

## Two things this runbook will not claim

- **Submitting a sitemap does not cause indexing.** Google is explicit that it
  is a discovery hint. Nothing here promises a ranking or an index outcome.
- **Search Console is not a substitute for the production audit.** `pnpm audit`
  in this repo (`e2e/audit.spec.ts`, run after every production deploy and
  weekly) is what catches a broken canonical or a missing OG image within
  minutes. Search Console is what catches what Google decided to do about it,
  weeks later. They answer different questions.

## `/search` leaves the index while the invite gate is on

`NEXT_PUBLIC_INVITE_ONLY=true` (yuvoy-api#195) puts the feed, `/search`,
`/search/r/`, `/saved` and checkout behind an invite code. A crawler is a
signed-out visitor, so with the gate on `/search` serves it the gate: a page
whose only content is "sign in". So while the gate is on that route says
`noindex, follow` and leaves the sitemap, and both halves derive from
`GATED_FROM_INDEX` in `src/lib/site/access.ts`, the way `robots.txt` and the
meta tag derive from `INDEXABLE`.

Three things about it are deliberate:

- **`follow`, not `nofollow`.** The gate is not a secret and the links on it
  (the guides, the front door) are worth finding. It also keeps the policy
  distinguishable from both site-wide ones: before launch the site says
  `noindex, nofollow`, after it `index, follow`, and this says neither, which
  is what lets the production audit tell "gated" from "not launched yet".
- **Not in `PRIVATE_ROUTES` and not disallowed in `robots.txt`.** A crawler
  that is refused the page never reads the `noindex` on it, so a URL it
  already knows would stay in the index with nothing behind it.
- **`/` stays indexable.** It is the front door, and what a crawler gets there
  is the invite landing: a page written for exactly that reader, saying what
  Yuvoy is and how to get in.

`e2e/audit.spec.ts` asserts against a live origin that `/search` is in the
sitemap exactly when its robots tag is the site's own, so the two cannot
drift. Turning the gate off puts the route back in both, with no code change.

## Launch checklist — `app.yuvoy.in` (decided 3 Sep 2026)

The app launches where it already runs. Nothing moves; one switch flips.

- [ ] **Vercel → `yuvoy-app` → `NEXT_PUBLIC_ALLOW_INDEXING=true`** (not
      Sensitive), then redeploy (Actions → Production deployment). Both
      `robots.txt` and the meta tag flip together — they derive from one flag.
      Do it a week or two before launch, so pages are indexed on day one.
      Confirm: `curl -s https://app.yuvoy.in/robots.txt` reads `Allow: /`,
      and `curl -s https://app.yuvoy.in/ | grep -o '<meta name="robots"[^>]*>'`
      says `index, follow`.
- [ ] **Search Console** — the Domain property covers `app.yuvoy.in`. Submit
      `https://app.yuvoy.in/sitemap.xml`; inspect `/`, `/search`, `/guides`,
      one guide, one experience.
- [ ] **Production audit** green after the redeploy. It runs on its own and
      is what checks that `robots.txt` and the meta tag agree on the live
      host.
- [ ] `NEXT_PUBLIC_SITE_URL` and the `PRODUCTION_URL` repo variable already
      say `https://app.yuvoy.in`. Leave them.

From then on two hosts of one brand are indexed: `yuvoy.in` (marketing) and
`app.yuvoy.in` (the app). That is the accepted trade-off of deferring D-102.
How the marketing site sends travellers into the app is copy and placement,
and is not decided here.

## Appendix — if the app ever takes the root domain (D-102, deferred)

Everything built for it on 3 Sep 2026 stays in the repo, dormant:

- `src/lib/site/marketing-redirects.ts` forwards every marketing URL to
  `www.yuvoy.in` with one temporary redirect, **gated on `Host: yuvoy.in`**, so
  it never fires on `app.yuvoy.in` or a preview. Its unit test still runs and
  refuses a redirect in front of one of this app's own routes.
- `pnpm cutover:check` is the gate: it reads the marketing sitemap and fails on
  a 404, a loop, a chain, or a landing page whose canonical names the wrong
  host. It is red by design while the app is not on the root domain.

The order, when the day comes: marketing to `www.yuvoy.in` first (Vercel
primary domain, `NEXT_PUBLIC_SITE_URL` there, redeploy); then move `yuvoy.in`
to the app project (`NEXT_PUBLIC_SITE_URL=https://yuvoy.in`, `PRODUCTION_URL`);
then `pnpm cutover:check --from https://www.yuvoy.in --to https://yuvoy.in`;
then re-submit both sitemaps. Rollback is moving the domain back — 307s cache
nothing. Promote the redirects to 308 only after a season unchanged, and
`yuvoy-api#78` (reserved scan codes) comes back with the move.
