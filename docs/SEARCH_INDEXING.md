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

## The cutover checklist (launch day, D-102)

When the app takes `yuvoy.in`. **In this order** — each step assumes the one
before it, and the failure mode of a wrong order is silent rather than loud.

### Days before, not the morning of

- [ ] **Decide where the marketing URLs live.** `yuvoy-app#12` holds the
      options and the recommendation. Twelve indexed URLs and two legal pages
      answer on `yuvoy.in` today and, checked on 3 September 2026, `/` is the
      only one of them this app answers — the rest are `404`. Nothing below is
      safe to do until every one of them has a destination.
- [ ] **Make each one answer**: a page in this repo, or **one** `308` to
      wherever `yuvoy-web` now lives. Never a chain, never a `404` — a URL a
      search engine already has does not fail loudly when it vanishes, it
      fails in a traffic graph weeks later.
- [ ] **Prove it**: `pnpm cutover:check --to <the app's origin>`. Point it at
      a preview first. It fails on any URL with no answer or a redirect that
      chains.
- [ ] **The `/go/` collision.** `yuvoy-web` serves campaign landings at
      `/go/<source>` (`instagram`, …); this repo serves QR arrivals at
      `/go/<code>` and sends any unknown code to the feed. After the move a
      printed campaign QR still lands somewhere — but with no source recorded.
      If those cards exist, each source needs a redirect ahead of the
      catch-all.
- [ ] **The operator portal's apply link** is `https://yuvoy.in/operators`
      (`yuvoy-operator`, `src/app/sign-in/page.tsx`). It must still resolve, as
      a page or as one redirect, or no operator can apply after launch.

### The move

- [ ] Vercel → move `yuvoy.in` from the `yuvoy-web` project to this one.
      `yuvoy-web` keeps a host of its own (staging, or the new marketing host).
- [ ] Set `NEXT_PUBLIC_ALLOW_INDEXING=true` and redeploy. Both `robots.txt` and
      the meta tag flip together — they are derived from one flag on purpose.
- [ ] Set `NEXT_PUBLIC_SITE_URL=https://yuvoy.in` so canonicals, OG URLs and the
      sitemap follow. **Do not mark it Sensitive** — see above.
- [ ] Point the `PRODUCTION_URL` repo variable at `https://yuvoy.in` so the
      audit tests the real origin.

### After

- [ ] `pnpm cutover:check --from <a host yuvoy-web still serves> --to https://yuvoy.in`.
      `yuvoy.in/sitemap.xml` is now _this_ app's sitemap, so the marketing
      list has to come from staging or the `yuvoy-web` project's
      `*.vercel.app` host.
- [ ] Run the production audit (Actions → Production audit, target
      `https://yuvoy.in`) and confirm green.
- [ ] If verification used the DNS method, nothing changes. If URL-prefix, add
      a new property for `https://yuvoy.in` and a new token.
- [ ] Re-submit the sitemap on the property.
