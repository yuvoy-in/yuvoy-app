# yuvoy-app

The **traveller web application** for Yuvoy — screens T1–T12. A traveller finds a departure in a
vertical video feed, holds a seat, pays, and turns up at a jetty.

Backend: [`yuvoy-api`](https://github.com/yuvoy-in/yuvoy-api) (Go/Echo, live in production).
Marketing site: [`yuvoy-web`](https://github.com/yuvoy-in/yuvoy-web) — retires when this app takes
the root domain at launch.

**Plan of record:** `yuvoy/YUVOY_APP_PLAN.md` (workspace root, one level up).

## Run it

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

Mocks are **on by default in development** — no backend needed. MSW runs in both the browser and
the Next server (via `instrumentation.ts`), so server components work too.

To talk to the real local Go stack instead:

```bash
# in yuvoy-api
scripts/dev-stack.sh --reset      # Postgres + migrations + seed + API on :8099

# here
NEXT_PUBLIC_API_MOCKING=disabled pnpm dev
```

### Reaching a failure state on purpose

The states that lose money are the ones nobody can reproduce. Any request can be forced:

```
http://localhost:3000/?__scenario=booking-disabled
```

**Catalog and feed**
`ok` · `empty` · `slow` · `offline` · `server-error` · `rate-limited` ·
`booking-disabled` · `operator-not-bookable` · `media-unavailable` ·
`stale-availability`

**The money loop**
`payments-ready` (payment succeeds) · `verifying` · `paid` (verifying → confirmed) ·
`declined` (refund progress) · `cancelled` · `expired` · `capacity-unavailable` ·
`request-window-closed` · `cutoff-passed` · `token-expired`

**Cancelling and reviewing**
`partial-refund` (routes to a human) · `not-cancellable` · `quote-moved` ·
`already-reviewed`

The dive listing (`try-dive-nemo-reef`) carries a health screener and a minimum
age; the kayak (`mangrove-kayak-at-dawn`) has neither, and no contracted price.
The snorkel trip is request-mode.

## What is built

Every traveller screen from the approved prototype, T1–T12.

| Route            | Screen                                                             |
| ---------------- | ------------------------------------------------------------------ |
| `/`              | T2 — the reels feed                                                |
| `/search`        | Date-first discovery. The day pills are the primary control        |
| `/e/[slug]`      | T3 experience detail (static + ISR) and T4 availability            |
| `/e/[slug]/book` | T6 checkout and T7 safety gates                                    |
| `/booking#t=…`   | T8 payment, T9 confirmed, T10 status over time, T12 weather cancel |
| `/trips`         | Bookings kept on this device — no account, works offline           |
| `/trips/recover` | "I lost my link" — OTP to the phone that booked                    |
| `/account`       | T5 optional sign-in, T11 every trip on this number                 |
| `/trip/[token]`  | The shared view. No payer details, cannot cancel                   |
| `/go/[code]`     | T1 QR arrival, recorded server-side                                |
| `/offline`       | The service worker's fallback                                      |

## Verify

```bash
pnpm verify           # the pre-push gate — all nine steps below, in order
pnpm qa               # the static sweep on its own
pnpm prerender:check  # what the build froze, against sign-off (needs a build first)
pnpm test:e2e         # 38 e2e tests, incl. axe on every route
```

```
typecheck · lint · format · qa · test · contract:check · build · prerender:check · e2e
```

**`pnpm qa` catches what the compiler cannot** — none of these fail a build, and all are visible
to a traveller:

- a link to a route that does not exist, or a nav entry with no page
- a screen that queries but renders no loading or error state
- a symbol-only button with no accessible name, or an input with no label
- paise divided by hand, or `toLocale*` on a date
- **a client component that transitively reaches a Node-only module** — this shipped once as
  `msw/node` → `async_hooks` in the browser bundle, and only `pnpm dev` showed it
- **a mock serving an endpoint the contract does not have** — this shipped once as `/auth/otp/*`
  after the endpoint was deleted upstream
- **`initialData` seeded without `initialDataUpdatedAt`** — React Query refetches it on hydration,
  which silently throws away the server fetch that put the content in the HTML

**`pnpm prerender:check` asserts the build output, not the source.** Static generation is opt-_out_
in the App Router, so a page becomes frozen at build time by the absence of something rather than
the presence of it. `scripts/check-prerender.mjs` lists every statically prerendered route with the
reason it is safe to freeze; a route joining or leaving that list fails the check. It caught
`/search`, which reads the wall clock during render — its day pills said "Today" over the build
date until hydration rewrote them.

A green `pnpm build` does not mean the app runs. Two runtime failures reached the owner before
these checks existed; both now have a static guard and a regression test.

## The contract

`contracts/openapi.yaml` is a **byte-exact mirror** of `yuvoy-api`, pinned by commit SHA in
`contracts/PINNED`. It is in `.prettierignore` — formatting it would hide a real upstream change
behind a formatting diff.

Pinned to **`master`**. PR #50 merged on 20 Aug 2026 and master moved on since — `/auth/otp/*`
and `/me` were deleted ("the second sign-in is deleted"), so **recovery IS the sign-in** and
`/me/bookings` is authenticated by the status token recovery returns.

When the contract moves: re-pull it, run `pnpm codegen`, and commit both. The typechecker names
every affected call site, which is the reason the client is generated rather than hand-written.

`pnpm contract:check` fails the build if the local copy stops matching the pinned ref. It warns
rather than fails when GitHub is unreachable, so a build never depends on the network.

## Layout

```
contracts/       the mirrored OpenAPI contract + its pin
docs/            DESIGN_SYSTEM.md (canonical) · ERROR_MAP.md
mocks/           MSW handlers + contract-faithful fixtures
src/
  app/           routes. /e/[slug] is static+ISR; the feed is client
  components/
    chrome/      the app shell — tab bar, rail
    feed/        T2 — the reels feed and its player
    experience/  T3 detail, T4 availability
    states/      the seven states, as composable shells
  lib/
    api/         generated schema + the hand-written client
    feed/        the feed store and its preload budget
    format/      money, time — the two that are dangerous to get wrong
    query/       cache policy, in one file
```

## The rules that will bite

Full list in `docs/ERROR_MAP.md` and the plan. The five that are enforced in code:

1. **Branch on `error.code`, never `error.message`.** Codes are an enum; messages are copy.
2. **Render `remainingDisplay`. Never re-derive it** from `remainingSeats`.
3. **Money is `amountMinor`, integer paise.** ₹4,500 is `450000`. `formatMoney` is the only
   renderer; `fromPrice` absent means "no price yet", never ₹0.
4. **Use `localDate` / `localStartTime`.** A 7am dive shown as 1:30am is a missed boat.
   `toLocale*Time` on a slot is an eslint error.
5. **503 is often deliberate.** `booking_disabled` and `operator_not_bookable` are decisions, not
   outages — calm copy, no retry button.

`localStorage` is also an eslint error: booking tokens belong in IndexedDB.
