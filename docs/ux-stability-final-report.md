# UX stability pass: final report

6 October 2026 · the traveller app (`yuvoy-app`) and the operator portal (`yuvoy-operator`).

Each product's work is on its own `feat/ux-stability` branch, merged into `dev`: [yuvoy-app#158](https://github.com/yuvoy-in/yuvoy-app/pull/158) and
[yuvoy-operator#150](https://github.com/yuvoy-in/yuvoy-operator/pull/150). Nothing is on `main`; production waits for the owner's "ship it". The same report sits
in both repos.

## The highest-impact changes

1. **What is on screen stays on screen (app).** One failed background read used to swap a working
   screen for an error page: checkout lost the typed name, the conversation lost its composer and
   the keyboard, the booking page vanished over one dropped poll, and a saved experience said it
   was "no longer on Yuvoy". Twenty-four branches now tell "never loaded" from "a refresh failed",
   and ESLint bans the flag that cannot tell them apart.
2. **A refused or dropped form keeps what was typed (operator).** Every form snapped back to what
   was on file after a refusal: twelve listing fields over one bad price, or the day chips on Add
   departures unticked under a screen that still drew them ticked, so the next tap sent every day
   of the fortnight. A request that never came back took the whole screen to the error page, or
   left a button or an upload busy for good. Now a refusal hands back what was typed, and a dropped
   request is the form's own "No signal" sentence, where it was.
3. **What was typed before the script arrived counts (both).** On a slow link a form is on screen
   for seconds before its script, and React keeps what was typed in that time without telling the
   screen (its own fix ships only in its experimental channel). Operator sign-in held ten digits
   under a disabled "Send me a code", trip recovery asked for a code for "+91" with a whole number
   on screen, and a rewritten About went back to the old words the moment the script arrived.
   Every server-drawn field now hands over what it holds as the page wakes, every textarea keeps
   its text, and a static check refuses a new field that does neither.
4. **A tab change is one steady object (app).** The tab bar no longer blinks out for up to 150ms on
   every tab change, a tab tapped mid-change opens, and it opens the tab under the finger rather
   than its neighbour.
5. **One loading shape per screen (both).** Search, checkout, Trips, Account, the invitation, the
   listing's price panel, the reel panel and the reel screens each passed through two or three
   shapes before their content; each now waits in the shape of what replaces it. Measured layout
   shift is 0 on each of the ten first loads checked, on a fast link and on a laggy one with a 4x
   slower CPU. In the operator, three screens gained loading screens and every tap into a detail
   screen turns a busy ring.
6. **Typing never navigates (app).** Search and checkout asked for the whole page on every keystroke
   and choice (seven requests to type "dive"), and offline that became a full page load onto the
   offline page, which lost the checkout form. They now write the address in place.
7. **Try again tries again (both).** The error screens drew the failed page again without asking
   the server, so a server failure came straight back, and with no signal the tap led to a dead
   end. Both now ask the server, stay busy until it answers, and with no signal wait for one.
8. **Video recovers (app).** A clip that hit one bad fragment ended on its poster, a flick back to a
   starting clip drew the play control, Safari drew "Loading video" over a playing clip, the next
   reel's poster popped in as it slid into view, and native streams kept a decoder per card.
9. **Sheets behave as modals (operator).** Tab no longer walks out of a sheet into the page behind,
   focus finds its way back when the opener has gone, two sheets closing in either order give the
   page its scroll back, nothing slides sideways on a desktop, and a sheet fits an iPhone screen
   with its toolbars showing.

## How the pass was run

- Read each product's shell, routing, loading boundaries, media, sheets, forms and data layer in
  full before changing anything.
- Measured in Playwright's WebKit (the Safari engine) and Chromium against production builds on the
  mock API: frames held mid-transition, hit tests, node identity across renders, layout shift,
  scroll positions and request counts.
- Fixed each defect at its cause. No delays to hide a race, no warnings silenced, StrictMode left
  on, no dependencies added, the fonts and the approved motion untouched.
- Guarded every fix with a test that fails on the old code (each was run against the old file to
  prove it), and with a static check wherever the rule can be enforced by construction.
- Torture-tested the result in both engines (see Testing performed).

## The traveller app

### Navigation and the tab bar

| Issue                                                                        | Root cause                                                                                                     | Fix                                                                                   |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| The tab bar blinked out for up to 150ms on every tab change, in both engines | A screen change draws both screens in a layer above the page, and the bar is part of the page                  | The bar is captured and drawn above the screens, unanimated, and solid while captured |
| A tab tapped mid-change did nothing                                          | Both engines skip a captured element when they hit-test, and WebKit sends no click to a node that answers none | A well under the bar takes the tap for those frames and hands it on                   |
| A tab tapped mid-glide could open its neighbour (Chromium, 17 of 25 runs)    | The tab opening already has its new width while the tab closing still slides, and the first box in the row won | The destination whose middle is nearest the finger wins (0 of 25 in both engines)     |
| Back and Forward lit a press two screens old                                 | A press lapsed by comparing paths, which history makes true again                                              | A press lapses in the render that sees the route move                                 |
| The feed's masthead jumped on every tab change to or from the feed           | It sat 4px further in and 2px to 6px lower than every other screen's header                                    | It draws the screen header's own 64px row                                             |
| Back's step-back hook was handed Next's click event as a path (latent)       | The prop was typed `() => void`                                                                                | Typed with Next's own signature                                                       |

### The address and history

| Issue                                                                                                                                                      | Root cause                                                                                                           | Fix                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A request for the whole page on every keystroke on Search and every choice on checkout; offline, a full page load onto the offline page that lost the form | `router.replace` on a dynamic route is a navigation                                                                  | `history.replaceState`, which Next folds into `useSearchParams` with no request |
| Search could write its own query back over the Search tab or Back, and cancel a tab tapped meanwhile                                                       | It re-sent its write on every render until the write landed                                                          | It writes from the event, and adopts a query it did not write                   |
| A QR card showed a grey sheet, then reloaded the whole page, and filtered nothing                                                                          | A redirect under a loading boundary streams a meta refresh, and the place went on a parameter Search no longer reads | A route handler that answers 307, with `?place=`                                |
| On an invited trip the tab bar covered Decline                                                                                                             | The route was not marked focused                                                                                     | It is, and its loading screen draws the same Back                               |

### Loading states and layout

| Issue                                                                                                                                                                        | Root cause                                                                                                                                          | Fix                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Checkout drew three frames before its calendar, swapping the header twice                                                                                                    | Three different fallbacks, and the listing's data was never handed over                                                                             | One `CheckoutSkeleton`; the listing seeds checkout's cache; More dates holds its place                                                        |
| The Search tab passed through a generic sheet, a blank gap and a skeleton shorter than its tiles                                                                             | Three different fallbacks                                                                                                                           | One heading and skeleton for the route and the screen, its rows the height of the tiles                                                       |
| The listing's price panel changed height as the open days landed, and vanished on a failure                                                                                  | Each state drew a different number of lines                                                                                                         | One two-line block in every state, with a way to try again                                                                                    |
| Checkout's heading faded from the question to the chosen day as the dates landed, and moved everything under it by 5px, or 27px at 360px, again on every tap that changed it | A change made as the screen opened was faded like a choice, and the question (two lines below 375px) and the chosen day (one line) differ in height | Drawn simply when it resolves as the screen opens, as the times and form already were; the heading holds the taller of the two at every width |
| Trips and Account settled in several jumps                                                                                                                                   | The heading arrived with the session, and the stay was asked for only after it                                                                      | The heading draws while waiting, and the stay is asked for alongside the session                                                              |
| The invitation passed through three shapes, its caption last                                                                                                                 | Three separate waits                                                                                                                                | One `InviteSkeleton` for the route and the screen                                                                                             |
| The feed and the reel screens had no masthead or Back while loading, failed or empty                                                                                         | The chrome lived inside the strip of reels                                                                                                          | `ReelFrame` draws the chrome in every state                                                                                                   |
| The reel panel's foot dropped as departures landed, and a logo jumped the title by up to 80px                                                                                | Three skeleton rows stood 128px against 147px for three real ones, and the logo had no box                                                          | Skeleton rows the height of real ones, and a logo box of full height                                                                          |
| The consent banner flashed on every hard load for a traveller who had already chosen                                                                                         | The server answered "unset" for a choice it cannot see                                                                                              | The server answers "unknown", which draws nothing                                                                                             |

### Data, refetching and races

| Issue                                                                                                                                            | Root cause                                                                                         | Fix                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| One failed background read replaced content on screen with an error: checkout, the conversation, Trips, the booking page, a saved experience     | Twenty-four branches tested `isError`, which is also true when a refresh fails with data on screen | `isLoadingError` for a full error; ESLint bans `isError`, destructuring included |
| Checkout read availability back to back while a refusal stood (91 reads in one test)                                                             | A refusal was reported from an effect keyed on a callback that changed every render                | Reported once, from the submit                                                   |
| Seats and cutoffs went stale while checkout sat in the background                                                                                | Nothing read them again on return, and the page's clock stopped                                    | Read again on return, and the clock keeps running                                |
| The Next up pass and the conversation blinked empty when their key changed                                                                       | A new key started with no data                                                                     | The last answer stays until the new one lands                                    |
| A failed mark-as-read left "2 new" and the dot on Trips                                                                                          | A failed mark counted as done                                                                      | It is asked again once the next poll lands                                       |
| A cancelled read was retried and reported as a network fault, its timers left running                                                            | The retry loop caught an abort like a dropped connection                                           | An abort is rethrown, and its backoff ends with it                               |
| The booking page said "Tomorrow" for today's departure after midnight, and a second booking link in the same tab inherited the first one's state | The time was read once, and the state outlived the link                                            | One ticking server clock, and each booking mounts afresh                         |
| A stored session was never adopted in development                                                                                                | A StrictMode guard flag cancelled the only run that posted                                         | The adoption belongs to the page and runs once                                   |

### Media

| Issue                                                                                                                              | Root cause                                                                              | Fix                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| The next reel's poster popped in as it slid into view                                                                              | Native lazy loading measures the viewport, not the reel scroller                        | Eager across the preload window, high priority only for the reel in view                               |
| The play control appeared over a clip that was only starting                                                                       | Leaving a card rejects `play()` with an AbortError, which was read as a refusal         | Only a NotAllowedError is a refusal                                                                    |
| "Loading video" over a playing clip in Safari                                                                                      | `stalled` was read as stopped                                                           | Buffering is `waiting`                                                                                 |
| A long feed session kept buffers and a decoder per card                                                                            | Native HLS sources were never released                                                  | A card leaving the preload window empties its source                                                   |
| A card on its way out could be picked as the one playing                                                                           | `isIntersecting` is true for a card leaving                                             | Picked by intersection ratio                                                                           |
| One bad fragment ended the clip on its poster                                                                                      | Every fatal hls.js error was final                                                      | A decode fault is recovered once per attachment                                                        |
| The page behind the full-screen photograph scrolled under it, Close sat under a desktop scrollbar, and the old photograph lingered | The page kept its scroller, `100vw` counts the scrollbar, and the image node was reused | The page is held while the view is open, the view is `100%` wide, and each photograph is its own image |
| The listing drew the operator's logo twice                                                                                         | A square copy came back beside the round one                                            | Drawn once                                                                                             |

### Errors and no signal

| Issue                                                        | Root cause                                                                                              | Fix                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Try again showed the same failure again                      | `reset()` draws the segment again without asking the server                                             | Next 16.3's `retry()`, busy until the answer lands                   |
| Try again with no signal led to the offline page, a dead end | A failed refresh falls back to a full page load, which the service worker answers with the offline page | With no signal it says so in place, and asks once the signal returns |

### Fields typed before the page hydrated

| Issue                                                                                                                | Root cause                                                                                                                                                                                                   | Fix                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Trip recovery showed a whole number and asked for a code for "+91"                                                   | React keeps a server-drawn field's value as the page hydrates but replays no change for it (`enableHydrationChangeEvent` is in its experimental channel only), so state still held the server's empty number | `useChangedBeforeHydration` hands each field changed before hydration to its owner, once, at mount; the phone field reads its two halves as one number |
| A word typed into Search or Help before the script arrived searched nothing, and the next render would have wiped it | The same                                                                                                                                                                                                     | The same hook; Search writes the address as a keystroke would                                                                                          |
| The invite code field, drawn by the server when the gate is on, would send nothing (latent)                          | The same                                                                                                                                                                                                     | The same hook                                                                                                                                          |
| A textarea drawn by the server would lose what was typed into it (latent: none is yet)                               | Stable React writes a textarea's server text back over it while hydrating, before any effect can look                                                                                                        | Every textarea is `Textarea`, which reads the field in the render that hydrates it                                                                     |

## The operator portal

### Forms after a refusal

| Issue                                                                                                                                                                                                                                                                                                                     | Root cause                                                                                                                         | Fix                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A refused form snapped back to what was on file: a listing's twelve fields over one price, a bank change, the builder's steps, the business details over one GSTIN character, a document, the footage attestation, the calendar's forms, a call-off, a message, a cancel, a role change, the weekly schedule, a take-down | React resets an uncontrolled form when its action resolves, refusals included, and cannot reset a select or a choice held in state | `sendForm` hands a refusal back with what was typed, each field reads `typed ?? saved`, and what a reset cannot restore remounts on the attempt; one-time codes are typed again |
| The day chips on Add departures came back unticked under a screen that still drew them ticked, so the next tap sent every day of the fortnight                                                                                                                                                                            | The same reset, under state the screen still held                                                                                  | The form remounts on the attempt, drawn from what the screen holds                                                                                                              |
| The join link's "take me off" box unticked while the agreement it stood for stayed                                                                                                                                                                                                                                        | The same reset                                                                                                                     | The box remounts per refusal and draws the agreement                                                                                                                            |

### Fields typed before the page hydrated

| Issue                                                                                                                                                                    | Root cause                                                                                                                                                                                                                                | Fix                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in held ten digits under a disabled "Send me a code" until one was typed again (found by the stress run)                                                            | React keeps a server-drawn field's value as the page hydrates but replays no change for it (its fix is in the experimental channel only), so state still held the server's empty number, and the next render would have cleared the field | `useChangedBeforeHydration` hands each field changed before hydration to its owner, once, at mount: seventeen screens, from sign-in and the bookings filters to the listing editor, the weekly schedule and the bank form |
| A rewritten About went back to the old words when the script arrived, and the listing editor's description, inclusions, requirements and safety notes saved the old text | Stable React writes a textarea's server text back over what was typed while hydrating, before any effect can look                                                                                                                         | Every textarea is `Textarea`: it reads the field in the render that hydrates it, draws what it holds, and leaves the server's text as its default for the owner to take the change                                        |
| A notification switch flipped early showed on and was never saved                                                                                                        | The same as sign-in                                                                                                                                                                                                                       | Taken and saved as a tap would be                                                                                                                                                                                         |

### Requests that never come back

| Issue                                                                                                                                               | Root cause                                                                    | Fix                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| A dropped request took the whole screen to the error page, the typed form with it: every form, the doors, Show more, a switch, a statement download | The rejected Server Action call reached the root error boundary               | `callAction` makes it the screen's own "No signal" sentence, in place; redirects, a missing action and server errors pass through as before |
| Send the code, Opening, Preparing, Checking and Saving could spin for good                                                                          | Busy was set before an await with no `finally`                                | Busy until the answer is in, whatever it is                                                                                                 |
| The audit's note that the check-in, cash and replay catches would swallow a sign-in redirect                                                        | Checked: Next 16.3 follows an action's redirect itself, then rejects the call | No change needed; a test pins that a check-in made as a session ends is kept and sent later                                                 |

### Loading and navigation feedback

| Issue                                                                                        | Root cause                                                                                    | Fix                                                                                                                                           |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Team, Add a listing and the invitation painted nothing on the tap                            | No loading screens, so nothing to prefetch or paint                                           | Loading screens of their own shape, in route groups that keep a 404 from streaming as a 200                                                   |
| A tap into a detail screen looked ignored on one bar of signal                               | No loading boundary is allowed there, since a 404 would stream as a 200                       | The link's busy ring after 300ms, a row's chevron giving way to it; a static check names any link without it, the builder's step bar included |
| The builder, Business, verification and sign in escaped the loading-boundary checks (latent) | The check left out every page that mentioned `redirect(`, and the builder can also answer 404 | Only a page that draws nothing counts as a redirect, so all four are held to every rule                                                       |
| Add a listing and Fix it painted nothing until the builder came                              | The push ran outside a transition                                                             | A busy button until the builder paints                                                                                                        |
| A search left the old rows looking like the answer, and could strand a lit pill              | The search navigated outside the transition the rows watch                                    | Searches run in that transition, and the pill clears on any change to its link                                                                |
| Bookings' Clear undid itself 300ms later                                                     | The search box was seeded once, and its debounce wrote the old text back                      | The box adopts any search it did not send                                                                                                     |
| Each door's loading screen drew another door's caption and sheet                             | One shared fallback                                                                           | Each door's own                                                                                                                               |
| The error and missing-page screens wore a signed-out chassis everywhere                      | Every route drew them with no bar                                                             | They wear the chassis of the route they replace                                                                                               |

### Refreshing and signal

| Issue                                                                        | Root cause                                                                                        | Fix                                                                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Coming back to the app fired two full re-reads, and a tap waited behind both | `focus` and `visibilitychange` fire together, each refreshed, and the minute's timer ignored both | One shared refresh schedule                                                               |
| The unread badge stayed after a conversation was read                        | The badge is drawn by the root layout, which nothing re-read                                      | Marking a thread read refreshes once, in the same round trip                              |
| The no-signal strip jolted the rows on a flapping connection                 | It followed every blip                                                                            | What a screen says waits for a change to hold 2s; actions still follow the signal at once |
| Boarding's headcount rolled on a hard load with kept check-ins               | The phone's count arrived as a change                                                             | The first client pass draws it still                                                      |

### Sheets

| Issue                                                                                                                  | Root cause                                                                      | Fix                                                                             |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| The page slid sideways under an opening sheet on desktop, and two sheets closing out of order left it unable to scroll | The scrollbar left with the overflow, and each sheet restored what it had saved | `scrollbar-gutter: stable`, and a counted scroll lock                           |
| Tab walked out of a sheet into the page behind, and focus was lost when the opener had gone                            | `aria-modal` without inertness                                                  | The page behind is inert while a sheet is open, and focus returns to a stand-in |
| A sheet could stand taller than an iPhone screen with its toolbars showing                                             | `88vh` ignores the toolbars                                                     | `88dvh`, and a check that keeps static `vh` out                                 |

### Errors and no signal

| Issue                                                                                          | Root cause                                               | Fix                                                                               |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Try again showed the same failure again, and with no signal went to the browser's offline page | `reset()` draws the page again without asking the server | `retry()`, busy until the answer lands, waiting for the signal when there is none |

## Testing performed

- **Unit and component tests:** 2,013 tests in 157 files in the app and 2,361 in 226 files in the operator (run twice there: on today's clock and a week ahead), all
  passing. Every new test was first run against the old code, and failed there.
- **End-to-end:** each repo's full Playwright suite against a production build, as its pre-push
  gate: 505 passed and 45 skipped in the app, 832 passed and 60 skipped in the operator.
- **Static gates:** typecheck, ESLint (with the `isError` ban), the long-dash check, Prettier, the
  QA sweep, the contract check and the prerender check; in the operator also the token check, the
  static `vh` check, and the loading-boundary checks that read every page and link from the syntax
  tree.
- **Torture runs (app),** each in WebKit and Chromium, on a fast link and again with 350ms added to
  every request and, in Chromium, the CPU slowed 4x. All 22 passed:
  - six rounds of three to five tab presses, 40ms, 120ms and 260ms apart: the screen,
    `aria-current` and the lit tab always end on the last press;
  - sixteen steps back and forward, 60ms and 180ms apart: always the entry the count says;
  - ten first loads: one busy region each, resolved, nothing thrown, layout shift 0;
  - the full-screen photograph opened, scrolled and shut six times at speed: the page holds its
    place and gets its scroller back;
  - the feed flicked ten times, 30ms to 110ms apart: it settles on one whole reel, with at most one
    clip playing.
- **The tab race (app):** Trips, Trips, Search, Trips from Trips, 40ms apart, 25 runs per engine.
  Before the fix Chromium ended on Search in 17 of 25; after it, 0 of 25 in both engines.
- **Typed before hydration (both):** `e2e/early-input.spec.ts` holds each page's scripts, changes
  every field the server drew, lets the scripts go, and compares what React holds with the screen.
  It also checks the number recovery sends, the word Search runs, and that a switch flipped early
  survives a reload. Against the old builds it failed on sign-in, the bookings filters, trip
  recovery and Search; it passes now. Unit tests keep a control that fails if React starts
  replaying the change itself.
- **Torture runs (operator),** in WebKit and Chromium, on a fast link and again with 350ms added to
  every request and, in Chromium, the CPU slowed 4x. All 22 passed:
  - six rounds of three to five tab presses, 40ms, 120ms and 260ms apart: the screen and
    `aria-current` always end on the last press, with one heading, nothing busy and nothing thrown;
  - sixteen steps back and forward, 60ms and 180ms apart: always the entry the count says;
  - eighteen first loads, from Today to a departure's boarding list: one heading each, nothing left
    busy, nothing thrown, layout shift 0 in Chromium.

## Devices and browsers

| Profile        | Engine                                      | Viewport                   | Used for                                     |
| -------------- | ------------------------------------------- | -------------------------- | -------------------------------------------- |
| iPhone 14      | WebKit (Playwright's bundled Safari engine) | 390 x 664 at 3x, touch     | App e2e, every torture run, held transitions |
| Pixel 7        | Chromium                                    | 412 x 839 at 2.625x, touch | App and operator e2e, every torture run      |
| Desktop Chrome | Chromium                                    | 1280 x 720, mouse          | App and operator e2e, desktop scrollbars     |

The operator's e2e suite runs in Chromium only: a production build sets the session cookie Secure,
and Playwright's WebKit keeps no Secure cookie over plain http. Its torture runs hand the session
back to WebKit by hand, a harness step only.

The hls.js path (browsers without native HLS) is covered by component tests with a stand-in hls.js.
No real devices were used.

## Network conditions

- A local production build on the mock API, unthrottled.
- 350ms added to every request, with the CPU slowed 4x in Chromium (the torture runs).
- The CPU slowed 6x while typing a search (Chromium, `e2e/address.spec.ts`).
- The page's scripts held back while its HTML was already on screen, as on a link that delivers
  the page long before its JavaScript (`e2e/early-input.spec.ts`, both repos).
- In component and unit tests: slow reads (open days held 1.2s), failed reads (a 404, a 503 then a
  200), dropped connections, cancelled reads, a Server Action request that never comes back, no
  signal and the signal returning, and a signal that flaps every few seconds.

## Remaining limitations

### The traveller app

- **A first Feed tab change can skip its fade.** When the router does not hold the feed yet, the
  change waits on the network, since the feed keeps no loading boundary (by ruling: streaming the
  feed breaks hydration in WebKit). In that wait React can commit Next's empty deferred render on
  its own, and that commit takes the change's motion type, so the feed appears at once instead of
  fading through. On the Chromium phone that was 3 to 8 cold changes in 100; none was seen in
  WebKit, and a change into a feed the router still holds (visited in the last 30 seconds) was
  typed 118 of 118. Nothing else is affected: the bar holds still and the feed loads as usual. The
  cause is upstream, in how React hands queued transition types to the next commit, so it was not
  worked around. The options are to prefetch the feed in full from the tab bar (one server render
  of the feed per page view, every 180 seconds) or to report it to React and wait.
- **The Feed tab starts at the first reel.** Reel memory (approved with T02 C, 4 Oct) resumes only
  on a step back; a step forward onto the feed, the Feed tab included, starts at the top.
- **In-app Back opens a grid at its top.** Back is a plain link to a named screen (the 3 Oct trail
  redesign kept that rule), so going back to search results, saved experiences or a business's page
  starts at the top and adds a history entry; the phone's own back keeps the place. Changing it
  needs an owner ruling: remember each grid's place as the feed remembers its reel, or use the
  browser's back when the trail and history agree.
- **Room under checkout's chosen day on narrow phones.** At 360px and below the question wraps to
  two lines, and the heading keeps that height once a day is chosen so that nothing under it
  moves; the cost is about 27px of space under the day. Fitting the question on one line there
  would be a type decision.
- **Very long feed sessions:** every card stays mounted. Media is bounded by the preload window and
  released outside it, but memory over a long session needs a real device.
- **A guide hero has no dimensions** (latent: no guide has a hero yet).

### The operator portal

- **A session that ends mid-action** shows that screen's failure line for a moment while Next
  follows the redirect to sign in. Check-ins and cash taken in that moment stay on the phone and
  are sent after sign in.
- **The no-signal strip can trail the signal by up to 2 seconds**, so that a flapping connection
  does not jolt the rows. Actions still follow the live signal.
- **Coming back within 5 seconds of the last re-read does not re-read again.**
- **A pill tapped while a search is landing goes back**, because the router drops that tap.
- **On a screen gone into, the error and missing pages keep Back's place as an empty circle**,
  since they cannot know where back leads.
- **Stacked sheets are not supported**; none exist today.

### Both

- **The keyboard over a form or a sheet** (iOS and Android) cannot be checked in an emulator.
- **Layout shift in WebKit:** WebKit has no layout shift API, so it was checked by geometry,
  positions before and after each change.
- **Fields typed before hydration** are handled by working around stable React. When Next ships
  React with `enableHydrationChangeEvent` on, the control tests fail, which is the cue to remove
  `useChangedBeforeHydration` and `Textarea`. The QA check reads a file at a time, so a file
  with one adopted field and one that is not passes it; the e2e sweep covers the routes it lists,
  and a new server-drawn form needs adding there.

## Next steps

- **Owner:** try a real iPhone and a mid-range Android on island signal: tab changes, the feed, a
  listing's photographs, checkout, and an operator form refused on purpose.
- **Owner:** rule on the Feed fade: prefetch the feed from the tab bar, or report it to React and
  live with it meanwhile.
- **Owner:** rule on in-app Back over grids: keep it as it is, remember each grid's place, or use
  the browser's back when the trail and history agree.
- **Owner:** say "ship it" for each product when it looks right; `main` is untouched.
