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

`ok` · `empty` · `slow` · `offline` · `server-error` · `booking-disabled` ·
`operator-not-bookable` · `payments-unavailable` · `rate-limited` · `stale-availability`

## Verify

```bash
pnpm verify    # typecheck · lint · format:check · test · contract:check · build
```

`pnpm verify` is the pre-push gate. All six must pass.

## The contract

`contracts/openapi.yaml` is a **byte-exact mirror** of `yuvoy-api`, pinned by commit SHA in
`contracts/PINNED`. It is in `.prettierignore` — formatting it would hide a real upstream change
behind a formatting diff.

Currently pinned to **PR #50 (`feat/m18-hardening`)**, not `master`: `master` carries 18 public
paths and no safety gates, and T7 cannot be built against it at all. **Re-pin to `master` the day
#50 merges**, run `pnpm codegen`, and commit both.

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
