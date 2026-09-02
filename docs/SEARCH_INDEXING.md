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

### 1. Domain property via DNS (recommended)

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

Only if DNS access is genuinely unavailable. It verifies exactly one origin.

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

When the app takes `yuvoy.in`:

- [ ] Set `NEXT_PUBLIC_ALLOW_INDEXING=true` and redeploy. Both `robots.txt` and
      the meta tag flip together — they are derived from one flag on purpose.
- [ ] Set `NEXT_PUBLIC_SITE_URL=https://yuvoy.in` so canonicals, OG URLs and the
      sitemap follow.
- [ ] Point the `PRODUCTION_URL` repo variable at `https://yuvoy.in` so the
      audit tests the real origin.
- [ ] If using the DNS method, nothing changes. If using URL-prefix, add a new
      property for `https://yuvoy.in` and a new token.
- [ ] Re-submit the sitemap on the new property.
- [ ] Confirm `yuvoy-web`'s redirects resolve to the canonical host, so no
      sitemap URL 30x-chains.
