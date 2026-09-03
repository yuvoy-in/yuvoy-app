# Search ownership and indexing — the runbook

**Owner:** Vishwanth (`@VishwanthBarma`). Search Console alerts go to the
address on the verified property; escalation is to the same person.

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

## The cutover checklist (launch day, D-102 — option A)

**Decided 3 September 2026 (yuvoy-app#12):** at launch this app takes
`yuvoy.in`; the marketing site moves to `www.yuvoy.in`; every URL the
marketing site publishes is answered on the root domain by **one temporary
redirect** to `www`. The rules are `src/lib/site/marketing-redirects.ts`,
gated on the host, so they fire only once `yuvoy.in` is this app — nothing
changes on `app.yuvoy.in` or on a preview, and nothing has to be flipped in
code on the day.

**In this order.** Each step assumes the one before it, and a wrong order
fails silently rather than loudly.

### 0. Days before: prove the rules against a production build

```
pnpm build && pnpm exec next start -p 3111 &
curl -sI -H "Host: yuvoy.in" http://localhost:3111/about | grep -i "^HTTP\|^location"
#   HTTP/1.1 307 · location: https://www.yuvoy.in/about
curl -sI -H "Host: yuvoy.in" http://localhost:3111/how-it-works | grep -i "^location"
#   location: https://www.yuvoy.in/#how          (one hop, not two)
curl -sI -H "Host: yuvoy.in" http://localhost:3111/go/ferry | grep -i "^location"
#   location: https://www.yuvoy.in/go/ferry      (a campaign word)
curl -sI -H "Host: yuvoy.in" http://localhost:3111/go/HAVELOCK-DIVE-01 | grep -i "^location"
#   location: /e/…?src=qr&code=HAVELOCK-DIVE-01  (a real code still scans)
curl -sI http://localhost:3111/about | grep -i "^HTTP"
#   HTTP/1.1 404                                 (no Host: yuvoy.in → no rule)
```

The unit test beside the table pins the rest: host gating, 307, the marketing
host never being this app's, exact paths before wildcards, and no redirect in
front of one of this app's own routes.

### 1. The marketing site moves first — Vercel, `yuvoy-web` project

- [ ] **Domains:** make `www.yuvoy.in` the primary domain. Today it forwards to
      `yuvoy.in`; that forward goes.
- [ ] **Environment:** `NEXT_PUBLIC_SITE_URL=https://www.yuvoy.in` on
      production, **not Sensitive**. The code fallback there is
      `https://yuvoy.in`, which after step 2 is _this app_ — a forgotten
      variable makes every marketing page declare the app's home as its
      canonical. `pnpm cutover:check` fails on exactly that.
- [ ] **Redeploy** (Actions → Production deployment) and confirm:
      `curl -sI https://www.yuvoy.in/about` → `200`, and the page's
      `<link rel="canonical">` is `https://www.yuvoy.in/about`.

### 2. The root domain moves — Vercel

- [ ] Remove `yuvoy.in` from the `yuvoy-web` project; add it to the
      `yuvoy-app` project. GoDaddy does not change — both projects are on
      Vercel, and the DNS records already point there.
- [ ] `yuvoy-app` environment: `NEXT_PUBLIC_ALLOW_INDEXING=true` and
      `NEXT_PUBLIC_SITE_URL=https://yuvoy.in`, neither Sensitive. Redeploy.
      Both `robots.txt` and the meta tag flip together — they are derived
      from one flag on purpose.
- [ ] `PRODUCTION_URL` repo variable → `https://yuvoy.in`, so the audit tests
      the real origin.

### 3. Prove it, before anybody is told

- [ ] `pnpm cutover:check --from https://www.yuvoy.in --to https://yuvoy.in`
      — every URL answers `200` or **one** redirect landing on `200`/`410`, and
      every landing page's canonical is on the host that served it. Anything
      else: stop here and fix it. **Rollback is cheap:** move `yuvoy.in` back
      to the `yuvoy-web` project. The redirects are 307, so no browser has
      cached anything.
- [ ] Production audit (Actions → Production audit → `https://yuvoy.in`)
      green.
- [ ] Open the operator portal's **Apply to run experiences** link once. It
      already points at `www.yuvoy.in/operators`.

### 4. Search

- [ ] The DNS domain property covers both hosts. Re-submit both sitemaps:
      `https://yuvoy.in/sitemap.xml` and `https://www.yuvoy.in/sitemap.xml`.
- [ ] No Change of Address in Search Console. That tool is for moving a
      whole site to a new domain; this is a set of pages moving to a
      subdomain, and the redirects are the right signal.
- [ ] If verification used the URL-prefix method rather than DNS, add a
      property for `https://yuvoy.in` and one for `https://www.yuvoy.in`.

### Later

- [ ] After a season with the shape unchanged, promote the redirects to
      `permanent: true` (308). The reasoning is in the table's header comment.
- [ ] Migrating a marketing page into this app — the original plan of record,
      still available, now without a deadline — is: build the page, delete its
      redirect, point `www`'s copy at it. The unit test refuses a redirect
      whose source is one of this app's own routes, so the order enforces
      itself.
- [ ] `yuvoy-api#78`: scan codes must never be minted as one of the five
      campaign words (`ferry`, `kiosk`, `hotel`, `instagram`, `direct`),
      which the root domain now forwards to marketing.
