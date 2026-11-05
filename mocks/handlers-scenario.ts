/* The `Scenario` union, moved word for word out of handlers.ts (yuvoy-app#243). */
export type Scenario =
  | "ok"
  | "empty"
  | "slow"
  | "offline"
  | "server-error"
  | "booking-disabled"
  | "operator-not-bookable"
  | "payments-unavailable"
  | "rate-limited"
  | "stale-availability"
  /*
    The word list alone is unavailable (yuvoy-app#37 item 7).

    `server-error` cannot reach this state: it fails every read, so the screen
    goes to its own error panel and the sheet never opens. Where and What have
    to fail while the search box, the grid and the When chips keep working, and
    that is a state only a per-endpoint scenario can produce.
  */
  | "vocabulary-unavailable"
  | "capacity-unavailable"
  | "cutoff-passed"
  | "request-window-closed"
  /*
    A feed long enough to page.

    The `REELS` fixture is six reels — deliberately, because its job is to
    prove the operator rotation is passed through untouched, and six across
    three rounds is what makes that legible. Six is smaller than one page, so
    against the real fixture the scroll never reaches a second request and
    every paging path would be exercised only in unit tests.

    So the length lives in a scenario rather than in the fixture: the rotation
    stays readable, and `/?__scenario=long-feed` walks real cursors through
    real page boundaries in the browser and in Playwright.
  */
  /*
    A listing that answers 200 and cannot be bought — yuvoy-app#19.

    Deliberately NOT a 404: the card is already gone from every feed and from
    search, so the only way to this page is a link, a bookmark or a search
    result, and telling that person the business does not exist is worse than
    telling them it is not selling. Unreachable from the fixture otherwise, and
    it is the state the whole flag exists to make visible.
  */
  | "not-bookable"
  /*
    A listing whose `cancellationPolicy` is absent — yuvoy-app#28.

    Not a hypothetical: the field is `omitempty` and the API populated it with
    nothing, so this was the shape of EVERY listing in production from launch
    until 9 Sep 2026, and checkout could never be submitted for any of them.
    The fixtures all carry the field, which is precisely why the suite stayed
    green throughout — so the absent case has to be reachable on purpose.

    An optional field that is never populated passes every check either side
    has. This scenario is the standing answer to that.
  */
  | "no-cancellation-policy"
  | "long-feed"
  /*
    `complete: false` with NO `nextCursor` — the contract's third case, "a
    different thing from the feed having ended". Unreachable from the fixture
    otherwise, and it is the one tail state that has no test unless something
    can produce it on demand.
  */
  | "feed-stopped"
  /*
    `GET /reels` alone, answering late: inside the 3s a server render waits
    for its first page (`FIRST_PAGE_TIMEOUT_MS`), and past it. Inside, the
    route's fallback is what a traveller watches while the server asks; past
    it, the page arrives without its first tiles and the screen draws its own
    wait while the browser asks. `slow` reaches neither on purpose: its 3s is
    the budget itself, so which side won would be a race.
  */
  | "slow-reels"
  | "stalled-reels"
  /*
    Places and release stages (yuvoy-app#181). `two-markets` adds the sample
    second bookable market, so no sentence that names a place from data can
    assume there is one; `places-unavailable` is the list failing, when every
    page names no place. `explore-all`, `explore-early` and `explore-staff`
    move the one release R0 has, which `/app-config` otherwise answers `off`.
  */
  | "two-markets"
  | "places-unavailable"
  | "explore-all"
  | "explore-early"
  | "explore-staff"
  /* `POST /outcomes` answering 503 (keep the batch) or 429 (slow down). */
  | "outcomes-down"
  | "outcomes-slow-down"
  /*
    Explore any place (yuvoy-app#179). Each opens `explore` at `staff` with a
    staff `GET /me`, plus one fault or one shape of answer; `found-handlers.ts`
    says what each does. `places-error` is `places-unavailable` under a staff
    world: both lists fail, and `explore` is open to the caller.
  */
  | "found-empty"
  | "found-error"
  | "found-page-error"
  | "found-stopped"
  | "found-long"
  | "found-slow"
  | "found-dept-empty"
  | "places-error"
  | "report-throttled"
  | "report-too-fast"
  | "report-gone"
  | "item-ended"
  | "item-merged"
  /*
    Checked cities (yuvoy-app#180). Each opens `checkedCities` at `staff` as
    well as `explore`, on R3's clock (Friday 21 August, 17:30 in Kolkata);
    `found-handlers.ts` says what each does.
  */
  | "found-checked"
  | "found-weekend-thin"
  | "found-free-empty"
  | "found-search-empty"
  /*
    What found cards' pages state (yuvoy-app#195, R3-T6), on R3's clock:
    `found-stated-facts` with `checkedCities` at `staff`, and
    `found-stated-closed`, the same cards with it `off`.
  */
  | "found-stated-facts"
  | "found-stated-closed"
  /*
    One table at `/tables/{id}` (yuvoy-app#194), each a state of the same
    fixture id (`table-handlers.ts`). `table-requested` is the default read;
    `table-started` answers withdraw with `409 table_closed`, and
    `table-report-too-fast` answers the report with a 429.
  */
  | "table-requested"
  | "table-approved"
  | "table-women-only-requested"
  | "table-declined"
  | "table-cancelled"
  | "table-ended"
  | "tables-paused"
  | "table-missing"
  | "table-started"
  | "table-report-too-fast"
  /*
    A traveller's share links (yuvoy-app#207, R12-T2). Each opens `creator`
    at `staff`; `creator-link-handlers.ts` says what each does.
  */
  | "creator-links"
  | "creator-links-empty"
  | "creator-links-not-went"
  | "creator-links-not-open-yet"
  | "creator-links-rate-limited"
  | "creator-links-down"
  | "creator-tools-off"
  | "creator-outside"
  /*
    People: friend requests and the friend link (yuvoy-app#222). Each opens
    `people`, at `staff` but `people-all`; `people-handlers.ts` says what
    each does and lists the fixed friend link codes.
  */
  | "people"
  | "people-all"
  | "people-first"
  | "people-paused"
  | "people-age-locked"
  | "people-down"
  | "people-outside"
  /*
    Crews, a traveller's own named lists of friends (yuvoy-app#227). Each
    opens `people` at `staff`; `crew-handlers.ts` says what each starts with.
  */
  | "people-crews-none"
  | "people-crews-full"
  | "people-crews-big"
  | "people-crews-empty"
  | "people-crews-down"
  /*
    Trigo, the chat (yuvoy-app#223, R5-T5). Each but `trigo-not-released`
    opens `trigo` at `staff`; `trigo-handlers.ts` says what each does.
  */
  | "trigo-reply"
  | "trigo-fixed-reply"
  | "trigo-limit"
  | "trigo-continue"
  | "trigo-slow"
  | "trigo-down"
  | "trigo-consent"
  | "trigo-age"
  | "trigo-busy"
  | "trigo-fast"
  | "trigo-not-released"
  /* Cards and the link note in a reply (yuvoy-app#223 (b), (c)): `trigo-reply-handlers.ts`. */
  | "trigo-reply-cards"
  | "trigo-reply-link"
  | "trigo-reply-link-ended"
  /* Trigo's confirm cards (yuvoy-app#223 part 2): `trigo-card-handlers.ts`. */
  | `trigo-card-${string}`
  /*
    Organiser pages (yuvoy-app#224). With no scenario the caller is an adult
    with one organiser in each state; `organiser-handlers.ts` says what each
    of these does.
  */
  | "organisers-empty"
  | "organisers-paused"
  | "organisers-age"
  | "organisers-closed-release"
  /*
    A traveller who holds groups (R9 clubs) sets up a group's organiser page
    in one step (yuvoy-app#225); `organiser-club.ts` says what each does.
  */
  | "organisers-club"
  | "organisers-club-paused"
  /*
    Me on the Account screen (yuvoy-mobile#444). Each but `me-off` opens `me`
    and `going` at `staff`; `me-handlers.ts` says what each does.
  */
  | "me-off"
  | "me-life-list"
  | "me-life-list-long"
  | "me-empty"
  | "me-badges-new"
  | "me-life-list-error"
  | "me-writes-fail"
  | "me-tables"
  /*
    The door (yuvoy-app#226): the caller owns one verified organiser and
    `organiser-door.ts` answers the codes; paused and age as named.
  */
  | "organisers-door"
  | "organisers-door-paused"
  | "organisers-door-age";
