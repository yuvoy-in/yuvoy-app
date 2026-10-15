# Yuvoy Design System

> **Canonical from 18 Aug 2026.** This document moved here from `yuvoy-web` per decision D-101.
> The marketing site is visually frozen; the app is where the system now evolves, and there is
> deliberately **no sync back**. `yuvoy-web` keeps a stub pointing at this file.
>
> Sections describing marketing-only surfaces (the brand veil, the hero atmosphere, the device
> preview, destination plates) are **retained for reference** — the app does not implement them,
> but the reasoning in them is why the rules below are what they are.
>
> **Two light surfaces are named in this file and they are not the same colour.** Since v2.9
> (below) the app and the operator portal paint `paper` (`#FFFFFF`); `yuvoy-web` is frozen on
> `cream` (`#F4EFE4`). Retained marketing sections say `cream` and mean the marketing site's
> token. Everything describing the app says `paper`. A ratio quoted beside `cream` is the
> marketing site's and has not moved.

## v3.2 (2026-10-05, owner-approved): three voices

**The change: the type says who is speaking.** The host's own words move to Gotu (Ek Type,
Mumbai; SIL OFL 1.1), Yuvoy's interface stays in Anek Latin with sentence-case labels, times and
money stay on Anek's condensed cut, and Yuvoy's headlines move to a new semi-condensed cut.
Approved by the owner on 5 Oct 2026 as Direction 09, "Signature: three voices", of the typography
study in `yuvoy/typography-lab` (the decision verbatim in its `APPROVALS.md`), for the app and the
operator portal both. Nothing else moves: not the palette, not the radius scale, not the chassis,
not the spacing. **The whole system is `docs/typography-system.md`**; this section records what
changed and why, and §2 below is updated to match.

### Why

- **One voice for everybody hid the host.** A host's listing, story and messages were set exactly
  like Yuvoy's buttons, so a traveller could not tell the person from the product. Yuvoy's promise
  is a real local host, and the type now shows one.
- **Tracked capitals were the grammar the design authority reads as AI**, on four jobs at once
  (eyebrows, labels, navigation, buttons), and at 390px they wrapped the feed's eyebrow and the pay
  button.
- **The condensed cut shouted.** Width 75 is right for a figure on a board and too loud for a
  screen title; the semi-condensed 87.5 reads as a signboard.

### What changed

|                  | v3.0                                        | v3.2                                                           |
| ---------------- | ------------------------------------------- | -------------------------------------------------------------- |
| The host's words | Anek, like Yuvoy's                          | Gotu, `voice-host`                                             |
| Labels, eyebrows | uppercase, 12px, weight 500, tracked 0.18em | sentence case, 13/18, weight 500, untracked                    |
| Buttons          | the label                                   | `text-button font-bold`, 15/20                                 |
| Navigation       | the label                                   | `text-xs font-bold`                                            |
| Headlines        | `font-display`, width 75                    | `font-display`, width 87.5, `leading-display` 1.08, balanced   |
| Figures          | `font-display`, width 75                    | `font-board`, width 75 (the same cut, its own file and token)  |
| Running text     | Tailwind's leading for the size             | `text-body` 15/23 (portal: `leading-body` 1.55), `text-pretty` |
| References       | `tabular-nums slashed-zero`                 | `tracking-ref slashed-zero tabular-nums`                       |
| Font files       | 2, 75,456 bytes                             | 4, 126,516 bytes                                               |

- New tokens: `--font-board`, `--font-host`, `--text-label`, `--text-button`, `--text-body`,
  `--leading-display`, `--leading-body` and `--tracking-ref`. `--tracking-display` is -0.005em,
  and `--tracking-label` is gone.
- `cn()` learns the new steps and keeps a leading written before a size, as the browser does.
- All four files are preloaded on every route; the three voices load `optional`, the text face
  `swap` (`docs/typography-system.md`, "Font loading strategy").

### What it is enforced by

`palette.test.ts` checks every class string against the three voices and proves each rule fires
(`docs/typography-system.md`, "How it is enforced"); `fonts.test.ts` checks the four files.

## v3.1 (2026-10-04, owner-approved): the motion system

**The change: motion gets a system, and the app's single 250ms budget becomes
three.** Decided experiment by experiment from the before-and-after study in
`yuvoy/motion-lab` (25 experiments, the decisions verbatim in its
`APPROVALS.md`), for the traveller app and the operator portal separately.
§3 below is superseded where it disagrees with this section.

### The tokens

Two curves join the two production already had (both repos' `@theme`, kept
identical by the operator's `tokens:check`):

| Token                | Value                             | Job                                                                 |
| -------------------- | --------------------------------- | ------------------------------------------------------------------- |
| `--ease-interaction` | `cubic-bezier(0.32, 0.72, 0, 1)`  | Arriving, answering a touch (unchanged)                             |
| `--ease-cinematic`   | `cubic-bezier(0.22, 1, 0.36, 1)`  | A screen or picture travelling, landing softly (was unused)         |
| `--ease-move`        | `cubic-bezier(0.2, 0, 0, 1)`      | A to B with both ends on screen: an indicator, a list closing a gap |
| `--ease-exit`        | `cubic-bezier(0.3, 0, 0.8, 0.15)` | Leaving: accelerates away so a dismissal never lingers              |

Durations are written where they are used, on one scale: press 100, quick 150,
standard 200, sheet 250 (exit 200), spatial 350 (exit 250), moment 450ms.
`lib/motion` mirrors the curves for script (`motion.test.ts` fails if they
drift).

### The budgets (`palette.test.ts` holds every pairing to its own)

- **Interaction**, `--ease-interaction`, `--ease-move`, `--ease-exit`: at most
  250ms. Everything that answers a touch.
- **Travel**, `--ease-cinematic`: over 250ms and at most 450ms. Only a screen
  or a picture going somewhere, and the one authored moment in a flow.
- **The operator portal** has no travel: 200ms is its ceiling for anything
  but progress (the five-second undo window, which is the information).

### The rules

- **Answer first.** A touch is acknowledged within 100ms, and the work starts
  on the same tap. Nothing waits for an animation.
- **Exits are faster than entrances**, about two thirds.
- **Transform and opacity**; clip-path only on small elements. Never animate
  a box's size per frame: measure once and play the difference (FLIP). One
  exception, argued in `useHeightGlide`: the reel panel's departures, where
  the edge that moves is the panel's own top and no transform can move it
  without moving or clipping what sits below.
- **Never clip a filtered element.** The tab bar's frosted ground and its
  paper are separate elements: in Safari a clipped `backdrop-filter` drew a
  shaded block instead of a pill (found in the study, 4 Oct 2026).
- **Presses animate `scale`.** Tailwind 4 writes `active:scale-*` to the
  standalone `scale` property; every transition list used to name only
  `transform`, so every press in both apps snapped. `motion-control` (a
  Button) and `motion-disc` (a disc) carry the press: 100ms in, 150ms out.
  `palette.test.ts` fails a press whose string has no list naming `scale`.
- **No loops** but honest progress. No scroll reveals (the 3 Aug ruling
  stands).

### Reduced motion swaps, it does not delete

Approved as S01. The global rule still makes everything instant, now covers
`::backdrop` (a sheet's tint used to keep fading), and skips any element
marked `data-motion`: such an element ships its own reduced version, a 120ms
crossfade in place of travel. Colour and opacity are not motion (WCAG 2.3.3)
and feedback must stay legible, so a press under reduced motion changes the
control's ground instead of its size.

### Shipped with this version

- The press fix in every primitive (`Button`, `IconButton`, the play disc,
  the review stars).
- The tab bar answers the press and glides as one object (T04 B): the
  destination lights on the tap while `aria-current` waits for the route; a
  paper layer clipped to the open destination glides 250ms on `--ease-move`,
  the glyphs slide (FLIP), the bar's ground follows its width, interruptible,
  and drawn exactly as before until script has measured it.
- Save is one 150ms change (outline to filled from 0.9, ring and colour
  together); the share notice fades 6px out of its disc and leaves with its
  words (T13 A).

### Screen changes (T01 C and A, T02 C, T03 B)

A screen change is a React view transition carrying exactly one type, chosen
from the two routes by `lib/motion/route-motion.ts` and attached by the app's
`Link` (`components/ui/link`; ESLint refuses `next/link` anywhere else). The
screen's parts each answer each type (`Screen`'s stage strip and sheet, the
reel strip, the tab bar); the stylesheet draws the answers ("motion: screen
changes" in `globals.css`); `route-motion.test.ts` fails a class the
stylesheet does not draw.

| Type                       | When                              | What moves                                                                                                                                          |
| -------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deeper`                   | Into a focused screen             | The stage stays. The old sheet's words leave (100ms) over its held paper; the new sheet rises 32px and fades in (250ms); the bar steps down (150ms) |
| `back`                     | A Back control                    | The sheet drops 24px as it fades (200ms); the one behind returns (150ms); the bar steps up                                                          |
| `sideways`                 | Between tab roots, and out to one | The old fades out (100ms), the new in (150ms); nothing travels; the bar glides instead (T04 B)                                                      |
| `reel-open` / `reel-back`  | A reel and its listing            | The listing is the page to the reel's right: in over 350ms (cinematic) while the reel moves a third as far under a 25% dim; Back 250ms (move)       |
| `picture` / `picture-back` | A saved picture and its listing   | The picture flies to the hero (350ms, corners 12px to square), the sheet rises over it; home again in 250ms                                         |

- **No type, no motion.** The browser's own back and forward (iOS Safari
  draws its own swipe; a second animation is the double slide), a query on
  the same screen, and the app's own redirects after an action. The root is
  never animated, so the forest stage simply stays.
- **The listing comes in under the thumb.** On a phone a reel's right-to-left
  swipe brings the listing itself in, one to one, built ahead of time once
  the reel has been watched 700ms (`lib/feed/listing-peek.ts`); past a
  quarter of the width or a flick it completes, else it springs back (200ms).
  The route is pushed only once it has fully arrived, and the real page
  renders under it. Reduced motion and desktops keep the card's nudge.
- **Back returns to the reel you left**, on a step back only (our Back, the
  browser's), by clip rather than index (`lib/feed/reel-memory.ts`).
- **A saved card hands its picture to the listing**, whose gallery opens on
  it (`lib/motion/picture-handoff.ts`), so the picture that lands is the one
  tapped.
- **Reduced motion:** every screen change is a 120ms crossfade; the picture
  lands at once.
- Prove on a physical iPhone before `main`: an iOS 26.1 crash with enter and
  exit transitions was fixed in React (#35337, in the canary Next 16.3 ships);
  WebKit is covered by `e2e/motion-webkit.spec.ts`, which is not a phone.

### Sheets and the details panel (T06 A, T05 A)

- **A sheet leaves the way it came.** On a phone it rises from the bottom
  edge (250ms) and every way out (the X, the backdrop, Escape, Android's
  back, a caller closing it) sends it back down: 200ms, accelerating away.
  From `sm` up it is a centred panel, not an edge sheet: it keeps its rise
  and leaves by reversing it (a fade and 12px, 200ms).
- **The dialog closes only once the exit has run.** The exit is the Web
  Animations API, then `close()`: a closed `<dialog>` is not drawn, and
  Safari 27 dropped the `display` transition that would let CSS hold it.
  The page stays inert for those 200ms, as it is while the sheet is open,
  and focus returns to the opener when it closes, as before.
- **Callers render `<SheetPresence open={…}>` around their sheet** instead
  of mounting it behind a conditional, so it stays mounted through its exit
  and is still mounted afresh on each opening (a sheet's draft is seeded on
  mount). `sheet-presence.test.ts` fails a sheet mounted by a conditional.
- **The head can be pulled down** on a phone: one to one, the tint thinning
  with it; let go past a quarter of the height or flicked, it goes from
  where it is on `--ease-move`, the exit scaled by the distance left (120ms
  at least); otherwise it settles back in 200ms. The X stays.
- **The reel's details panel behaves as it looks**: in 250ms, out 200ms, and
  its handle pulls it down one to one (past 64px or a flick it closes from
  where it was let go; otherwise it settles back). The handle is
  `touch-action: none`, or a pull on it would scroll the feed back a reel,
  and the card's swipe to the listing never sees a pull's moves.
- **The details panel fits its details, at most 70% of the frame** (owner,
  10 Oct 2026; it was a 54% ceiling, which cut the departures off on every
  phone). As tall as what is in it, its body scrolling past 70%; on a tall
  screen that is about 56%, by the owner's choice over always filling 70%.
  It never covers the top 80px (the row of the mark, Login or a way back),
  which only bites on a phone on its side. When its departures land at
  another height than their placeholder (one or two, none, a failed read),
  it glides there in 200ms on `move` rather than jumping.
- **The tab bar steps aside while the details panel is open** (owner, 10 Oct
  2026: the panel's action sat flush on the pill). It steps down 16px and
  fades in 150ms, as for a focused screen, but on the panel's own curve: the
  action arrives under it about 60ms in, and on the exit curve the pill was
  still there to meet it. It comes back the same way 150ms after the panel
  starts down, once the action has cleared it. Its ground and row fade,
  never the pill (a fading parent turns frosted glass clear), and
  `visibility` follows, so it leaves the tab order too. The panel's foot is
  then its own 20px margin. The 13 Sep ruling stands: the bar stays on every
  reel scrolled through.
- **Reduced motion:** both are a 120ms fade in and out; a pull still follows
  the finger, and a closing pull fades where it was let go. The bar fades
  with the panel and does not step.

### Search: waiting, and a list that changes in place (T11 A, T14 A)

- **A wait is shown only once it has lasted 300ms**, and once shown it stays
  300ms (`useDelayedFlag`). Search keeps the last answer on screen while the
  next loads (`keepPreviousData`, the results marked `aria-busy`), so a
  quick answer never swaps the grid for a skeleton and back.
- **The skeleton is the shape that is coming**: the grid's own tiles, two
  across at 4:5 with two lines of words. It breathes as one layer.
- **Skeletons breathe** everywhere now: opacity 1 to 0.55 and back over 1.6s
  on `ease-in-out`, the system's one loop. The old sweep animated
  `background-position`, which repaints every tile every frame.
- **A list that changes in place is seen changing** (`useListMotion`, on the
  grid, the applied pills and the parts of the screen around them): what
  stays slides to its new place (FLIP, 200ms on `move`, one 40ms step after
  what left), what arrives grows (pills, 0.96) or rises (tiles, 8px) into
  place in 150ms, 40ms apart for a list arriving as a list (at most four
  steps), and what leaves fades where it was in 100ms as an `inert`,
  `aria-hidden` copy. Only what is on screen moves.
- **Tiles are keyed by their clip**, so a tile that stays is the same element
  and its picture is never fetched or decoded twice.
- **Counts roll** (`RollingNumber`): the old figure leaves as the new one
  arrives, upward when the number rises and downward when it falls, 200ms.
- **Chips colour in 150ms**, the selection speed.
- **A screen arrives whole**: its first pills, count and grid are simply
  there; only what changes on it afterwards is seen arriving.
- **Reduced motion:** nothing slides, grows, rises or rolls; arrivals and
  departures are a 120ms fade; the skeleton is still.

### Booking: tabs, the Book button, the day and the time, the moment (T07 A, T08 A, T09 A, T10 A)

- **The Trips tabs are one object** (`TripTabs`): a forest fill clipped to
  the chosen tab glides to the next on the tap (250ms on `move`), and each
  label turns paper where it passes. A tab's contents fade THROUGH to the
  next tab's (out 100ms, then in 150ms), and a tab's list fades in over its
  skeleton when it lands (`Crossfade`).
- **A button keeps its colour while it works** (`Button`'s `pending`):
  `aria-busy` and `aria-disabled`, never `disabled`; the label cross-fades to
  the working verb ("Booking", no ellipsis); a 16px ring shows only after
  300ms and turns once a second (a quarter turn a second under reduced
  motion). A tap while it works does nothing. The Book button keeps it until
  the booking page opens.
- **A refusal is seen**: at the foot of checkout it lands as its own arrival
  (rising 8px), the page scrolls so it sits 16px above the sticky bar, and it
  takes focus.
- **The chosen day is one object** (`DayStrip`): a window over the chosen day
  glides to the next (250ms on `move`) with the strip drawn chosen inside it,
  moving the other way, so the dates stay put. Transforms only. The day's
  times rise in order (200ms, 40ms apart); words that read the choice fade
  through (`FadeText`: out 100ms, in 150ms); the party number rolls; the rest
  of checkout fades in and its foot rises from the bottom edge (250ms), once,
  when a departure is first chosen. As before, the strip jumps to a day past
  its right edge (A keeps that).
- **The pass settles** (T10 A, the second authored moment): on the page the
  booking tap lands on, and only there (`lib/booking/arrival`, a one-shot mark
  checkout sets), the eyebrow's tick draws (250ms from 100ms), the first panel
  rises 12px and the reference arrives last: 350ms in all. A reload, a poll or
  a shared link opens the page as it is.
- **A confirmed booking's eyebrow carries a tick** where the terra square is
  (the owner's word, 4 Oct 2026). The word carries the state; the tick is
  `aria-hidden`.
- **A page that changes while open is seen changing**: on the booking page a
  section that arrives fades in, one that goes fades where it was, and what
  was under it slides up (`useListMotion` with `byNode`); its words fade
  through.
- **Reduced motion:** nothing travels; the fill and the day land and fade in;
  the moment's tick is simply drawn and its panel and reference fade (120ms).

### Pictures and refusals: a reel's start, the far side, a refused number (T12 A, T15 A, T16 A)

- **A clip is seen from its first frame**: it stays invisible over its poster
  until it has decoded one (`loadeddata`), then crossfades in 200ms. A clip
  drawn again (back inside the preload budget) earns its fade again. With a
  poster that is the clip's own first frame the crossfade is invisible;
  without one it is a 200ms dissolve instead of a jump.
- **A slow start says so, and stops saying so**: the ring keeps its 600ms
  wait, fades in (150ms) and out as the clip plays (150ms, accelerating
  away), and turns only while it shows. A first frame is not the end of a
  start (a clip can hold it while it buffers), and a stall shows the ring
  again at once. A clip the traveller paused is not slow to start: the ring
  used to come up behind the play control 600ms after a pause.
- **A clip that cannot load on the native path gives up** (Safari, iOS, and
  now Chromium, which plays HLS itself), on the element's own `error`, and
  the card is its poster again. It used to keep a play control and a sound
  toggle for a clip that could never play, or leave the ring turning for
  ever.
- **The far side recedes** (T15 A, approved on the condition that it measured
  cheap). On a phone, as the sheet covers a screen's picture, the picture
  scales from 1 to 0.96 from its top edge and an abyss layer over it rises to
  45%: linked to the scroll, no duration, linear, so it moves only with the
  finger. CSS alone, on `animation-timeline: scroll(root)`, inside
  `@supports`; a browser without scroll timelines keeps the still picture.
  The range is the picture's own height (`--hero-height`) less the sheet's
  rise over it: the gallery declares it beside its frame (125vw at 4:5, 56.25vw
  at 16:9), and the picture strip draws its height from it. Measured
  (Pixel 7, Chromium, 4x CPU slowdown, ten scrolls down and back): no dropped
  frames on or off (none over 20ms, p95 9.3ms both); no layout and no repaint
  per frame (two paints in a scroll, the overlay first drawn; commits
  identical); the main thread restyles the two layers once a frame, about
  0.35ms at 4x. Prove it on a mid-range Android before `main`.
- **A refused number arrives, it does not shove**: the reason fades in rising
  4px (150ms, one 40ms step in) and the button under it glides down to make
  room (200ms on `move`); on the next send the reason fades where it was
  (100ms) and the button glides back a step later. The field's border
  answers in 150ms. An empty state does not move: absence is not an event.
- **`useListMotion` learned `data-motion-leave`**: something inside an item
  that stays (a field's reason) fades where it was when it goes, and what
  follows waits for it as for any departure. A departed thing's copy is held
  still, so an entrance its classes carry never replays in it, and silent,
  so a live region is never read out twice.
- **Reduced motion:** the ring holds still and fades in and out (120ms); the
  clip crossfades in 120ms once asked for; the picture does not scale and only
  dims; the reason only fades (120ms) and nothing glides. Colour keeps its
  150ms (S01 A), so the fields are marked `data-motion` for their border.

## v3.0 (2026-10-03, owner-approved): Anek Latin, one family in two voices

**The change: Fraunces + Satoshi are replaced by one family, Anek Latin (Ek Type,
Mumbai; SIL OFL 1.1), set in two cuts. Nothing else moves: not the palette, not
the radius scale, not the chassis, not the type scale.** Approved by the owner
on 3 Oct 2026 as option 1 ("Jetty board") of the type study in
`yuvoy/ux-experiments/type.html`, for the app and the operator portal both.
`yuvoy-web` keeps Fraunces and Satoshi (owner ruling, same day).

### Why

- **It read as AI.** Fraunces is on the design authority's own list of reflex
  faces, and a soft serif on a light page with a terracotta accent is the exact
  look it names as the AI default. The colours are locked, so the type was the
  lever.
- **Neither old face had a rupee sign.** `Fraunces-Yuvoy.woff2` carried 169
  characters and `Satoshi-*.woff2` 431, and U+20B9 was in neither (the build
  script even asked for it; Fraunces upstream does not draw it). Every
  "₹4,500" in the product drew its ₹ from the phone's system font.
- **It is a working face.** Tabular figures for times and money, a slashed zero
  for references read aloud at the jetty, a condensed width for headlines that
  reads like the boards at the jetty, and Devanagari, Bangla, Tamil and Telugu
  siblings when the product is localised.

### The two cuts (`src/lib/fonts.ts`, built by `scripts/build-fonts.py`)

| Cut                        | What                                      | Size    | Loads      | Sets                                       |
| -------------------------- | ----------------------------------------- | ------- | ---------- | ------------------------------------------ |
| `Anek-Yuvoy.woff2`         | width 100, **variable weight 400-700**    | 57.7 KB | `swap`     | body, UI, labels: 400, 500, 700            |
| `Anek-Yuvoy-Display.woff2` | width 75, weight 700, **baked 12% large** | 16.0 KB | `optional` | `font-display`: headlines, titles, figures |

Together 74 KB against the 88 KB of the four files they replace.

> **Since v3.2** the width 75 cut is `Anek-Yuvoy-Board.woff2`, set by `font-board`, and
> `Anek-Yuvoy-Display.woff2` is the new semi-condensed display cut (width 87.5). The table above
> records v3.0.

- **The display cut is registered at weight 400**, exactly as the Fraunces cut
  was, so `font-display` at the default weight is still the one display voice and
  no class changed. `palette.test.ts` still bans `font-display` with any heavier
  weight: the browser would synthesise a bolder copy of a face already bold.
- **The 12% is baked into the file** (`unitsPerEm` 2000 to 1786), not declared
  with `size-adjust`. A condensed face reads small at sizes tuned for a normal
  width, and next/font builds its metric-matched fallback from the file: a
  declared adjustment would leave the fallback 12% smaller than the face, and
  with `optional` a slow first visit keeps the fallback for the whole page.
- **The text face is one variable file**, not three static cuts: one request
  and fewer bytes for three weights. `font-semibold` stays banned (three weights,
  not a continuum).
- **The display cut keeps the Fraunces cut's character range** (Latin-1) because
  it is the feed's LCP element; the text face adds Latin Extended-A for names.
- `--tracking-display` is `0em` (was -0.01em for Fraunces). There is no turn in
  the app, so `--font-weight-turn` is gone; the italic was never shipped here.

### References

Customer-facing references (bookings, support requests) are set in the text face
with `tabular-nums slashed-zero`, replacing the system monospace: an even rhythm
and a zero nobody reads as O. Codes being typed (sign-in, invite) and the small
technical error ids keep the system monospace.

### What it is enforced by

`src/lib/fonts.test.ts` reads the cmap of both shipped files and fails if
either cannot draw the rupee sign, the digits or the alphabet (and the text
face the accented letters names use). It was proved against the old Satoshi
file: it reports `₹ U+20B9` missing.

## v2.9 (2026-09-15, product-directed) — the app and the portal are white

**The change: the cream surface trio becomes a white one, and is renamed
`paper`. Nothing else in the system moves — not the ink, not the accent, not
the type, not the radius scale, not the chassis.**

The product team's note was one line: every product except the marketing site
should be white rather than cream. It applies to `yuvoy-app` and
`yuvoy-operator`; `yuvoy-web` keeps `cream` under D-101's no-sync-back rule.

### What the three tokens became

| Was                    | Is                     | Role                           |
| ---------------------- | ---------------------- | ------------------------------ |
| `cream` `#F4EFE4`      | `paper` `#FFFFFF`      | Canvas                         |
| `cream-deep` `#ECE5D6` | `paper-deep` `#F7F5F1` | Raised surfaces, cards, inputs |
| `cream-line` `#E5DCC9` | `paper-line` `#EDEAE4` | Hairlines                      |

**The separation was preserved, not the hue.** `paper-deep` sits 1.09:1 off the
canvas and `paper-line` 1.20:1, which are the steps the cream trio had (1.09:1
and 1.19:1). That is deliberate and it is the reason this is a token change and
not a redesign: every card, input, panel and divider holds exactly the weight it
held, on a white ground instead of a beige one.

The two supports stay **warm-neutral rather than grey**. The ink is a green and
the accent a terracotta; a neutral-grey panel between them reads as a third hue
rather than as the absence of one. (Owner decision, 15 Sep 2026, over a
cold-neutral ramp and over a softer off-white canvas.)

### Why the name changed with the value

A token called `cream` painting `#FFFFFF` is a lie every future reader has to
re-check against the hex, and `bg-cream` is the first thing the next screen
would have copied. `paper` was also already the system's word for this surface:
it is the name of the `Button` and `IconButton` variant that paints the light
control on the dark stage, which now paints `bg-paper` and reads correctly for
the first time.

Not `white`: Tailwind ships a built-in `white`, so `text-white/60` would have
silently satisfied the off-palette scanner in `palette.test.ts`.

### Every pairing gained contrast, by exactly 1.1467

Only the light end of the palette moved, so against any fixed ground the ratio
scales by `1.05 / (L_cream + 0.05)` = **1.1467**. Nothing needed re-sizing and
no scrim, tint or opacity rung was re-cut: the floors that were tight are the
same floors with more room. Every figure in this document and in `globals.css`
was multiplied through and re-measured rather than left to drift.

The one rule whose _justification_ changed is the terra rule (§1): `terra` on
the raised surface was 2.96:1 and failed everything; it is 3.41:1 and clears the
3:1 large-text floor. The rule is kept as a restraint rule, and says so.

### What it is enforced by

- `palette.test.ts` asserts the literals it measures **are** the `@theme`
  tokens, so a value can never again change underneath the test that claims to
  measure it.
- It also pins the two surface steps. Nothing else would catch losing them:
  every text pairing gets _better_ as the supports lighten, so a flattened ramp
  passes every contrast assertion while the panels quietly vanish.
- It holds `docs/reel-lab/css/tokens.css` to the promise its own header makes,
  since the lab restates the palette longhand and had nothing tying it back.
- `pnpm tokens:check` in `yuvoy-operator` diffs the `@theme` block against this
  one, so the portal moved in the same change.

### The brand marks moved too

The lockup, the compact mark and the ensō are `paper` on dark surfaces now, and
the favicon, app icon, Apple touch icon and OG mark were regenerated from the
recoloured vector. A cream mark beside white text measures 1.15:1 — the "two
whites" version of the failure v2.1 fixed when it merged two darks.

`scripts/generate-icons.mjs` was ported from `yuvoy-web` for this (`pnpm
icons`). It had always been web's, and the outputs here were copies — which
stopped working the moment the two products' marks stopped being the same
colour. The two copies differ only in `SRC`.

## v2.8 (2026-09-09, owner-directed) — the feed's chrome retracts

> **Removed 13 Sep 2026 (yuvoy-app#36):** the owner ruled the tab bar stays visible on every reel. The retract, its flag and its slide are gone; this section is kept for the reasoning about scrims and the swipe, which still hold.

**The change: on the reels feed, the chrome gets out of the way as a traveller
moves down and comes straight back when they move up. The masthead loses its
Search disc and centres the mark. Both feed scrims are re-cut as eased ramps.
A right-to-left swipe opens the reel. Nothing else in the app moves.**

The brief: _"the bottom nav bar should be only visible for the first reel …
scrolling to the second reel should hide the navbar … if I scroll to the
previous reel the navbar should come back … the darker shades under header and
bottom navbar are not smooth … swiping from right to left should directly open
the see dates thing."_ One fork was put to the owner and settled the same day.

### The rule: direction, not position

The bar is out on the first reel, hidden the moment the traveller moves DOWN a
reel, and back the moment they move UP one — from anywhere, not only at the
top. "Visible on the first reel only" was the other candidate and was rejected
**by the owner** on the trade it forces: a traveller eleven reels down would
have eleven swipes between them and Search. Direction keeps navigation one
gesture away from everywhere, and still leaves reel one with the bar in place,
because arriving at index 0 can only ever be an upward move.

The rule is one line — `setActiveIndex` in `lib/feed/store.ts` — and everything
else draws it. `Feed` publishes `data-chrome` on its root; the masthead, every
caption and the tail are descendants of that node, so they cannot disagree.
The tab bar lives in the shell, not the feed, so it carries the same state on
its own `data-retracted` **and** checks `isFeedRoute`: the store is a module
and outlives every component, so a value left behind by a feed must never be
able to take the navigation off Search, Trips or Account.

### Three consequences that are not optional

- **The layout follows the bar.** The caption's foot is its own 32px, and it
  rises by `--feed-lift` (60px) while the bar is there — which is exactly the
  92px `tabbar-clearance` was giving it. Hiding the bar without this leaves
  60px of dead space under the button on every reel but the first. The tail
  does the same in padding, because it is in flow and padding is its height.
- **The bar is translated, never hidden.** `visibility`, `inert` and
  `display: none` all take the app's navigation away from anyone who moves
  through the feed with a keyboard or a screen reader, since the gesture that
  restores it is one they cannot make. `:focus-within` brings it back.
- **The swipe is a shortcut, never the only way.** WCAG 2.5.1, and the button
  stays primary. The card builds the href once and hands the same string to
  both.

### Motion: this is interaction feedback, not an entrance

Everything here is **250ms on `--ease-interaction`** — §3's first budget. It
shipped at 460ms of `--ease-cinematic` first and that was wrong for the same
reason the marketing site's sliding header is already ruled on: chrome that
answers a gesture is not a composition arriving, and half a second of it on a
movement a traveller makes on every swipe reads as lag. `palette.test.ts`
parses the durations out of the chrome layer and fails anything slower or on
the other curve.

### The scrims are eased ramps now

Both feed scrims were four stops, and their slopes ran −0.29, −1.00, −1.48
between the knots. A change in slope is what an eye reads as an edge, so a
gradient that was smooth by construction had two visible seams across it and a
third where it met `transparent` with its slope still at −1.48 — a hard line
across moving footage on the one screen that is the product. They are now
twelve and nine stops sampling a sigmoid: the slope rises from ~0 at the foot
to −1.9 in the middle and falls back toward 0 at the head, so the scrim **ends
rather than stopping**.

The floors are unchanged in intent and are now **computed** rather than
asserted: `palette.test.ts` parses the stops, composites them over the palest
surf highlight measured (`#E8E2D4`) and recomputes the contrast. The caption
band holds 7.9:1 at the 50% stop and 5.4:1 at the 62% one; the wordmark sits
between 10.1:1 and 6.2:1. The figure this replaces — 8.9:1, written against
the 62% stop — did not survive being recomputed: it corresponds to about 76%
abyss, not 62%.

The masthead's height is part of that measurement, not a layout detail: the
mark occupies 12%–39% of a 132px block, and moving the padding slides it into
a lighter band with every contrast test still passing. The test pins the
padding to the gradient for exactly that reason.

### And the Search disc is gone

The masthead carried a Search disc while the floating bar two inches below it
carried Search as one of its four tabs — two controls for one screen, on the
smallest surface in the product, and the one on top was the one competing with
the picture. The mark takes the centre, the strip is wholly inert, and the
whole top of a reel scrolls the feed again.

## v2.7 (2026-09-02, owner-directed) — the app is rounded

**The change: the app gets a radius scale, pills and circles, a stage-and-sheet
chassis, and a floating tab bar. The palette and the type do not move.**

The owner's brief came with a reference set in `expectations/app` — ten
screens: a coffee ordering app, an interiors app, three dating apps, a surf
school, a nail studio, a social feed, two travel apps — and one sentence:
_"everything should follow the design system we have, i.e. colours and fonts,
but the designs should be coming from the expectations — and since this is an
application we can actually have the rounded corners."_ Two decisions were
taken with the owner the same day: **a dark stage with paper sheets** (over
all-dark, or paper-only), and **focused screens hide the tab bar** behind a
back control and a sticky action bar. The same language ships in
`yuvoy-operator`.

### What the references share, and what was taken

| In every reference                                                            | In the app                                                                                               |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A dark, cinematic ground; photography as the hero                             | The forest **stage** on every viewport; the feed's abyss media ground, unchanged                         |
| Transactional content on a light card rising over the picture                 | The paper **sheet**, 32px at the top, rising over the stage or the hero (`Screen`)                       |
| Cards at 20–28px, chips as pills, controls as circles                         | `--radius-card` 24px, `rounded-full` chips and discs                                                     |
| A floating pill navigation with one destination highlighted                   | `TabBar`: a forest pill detached from the foot; the active tab opens into a paper pill carrying its name |
| Detail screens with no tab bar, a floating back disc and one sticky price bar | `FOCUSED_ROUTE_PREFIXES`, `BackButton`, `StickyBar`                                                      |
| A serif display face, a sans for everything else                              | Fraunces + Satoshi, unchanged                                                                            |

What was **not** taken, and why: glass and blur (a GPU cost on a mid-range
Android, and hairlines already do the work shadows do elsewhere); a warm
accent as a button fill (CTAs stay monochrome, owner direction 2026-08-05 —
a `terra-soft` fill under `forest` text would measure 5.36:1 and _could_
pass, and stays out because the rule is about restraint, not contrast);
scroll-triggered entrances (the interaction budget is the app's only motion
budget); and an icon library (sixteen hand-drawn strokes in
`src/components/ui/icons.tsx`, one weight, about four kilobytes).

### The radius scale

| Token              | Value | Used for                                                                  |
| ------------------ | ----- | ------------------------------------------------------------------------- |
| `--radius-tile`    | 12px  | thumbnails, inner media, small tiles                                      |
| `--radius-control` | 16px  | inputs, selects, textareas                                                |
| `--radius-card`    | 24px  | cards, panels, notices, slot rows                                         |
| `--radius-sheet`   | 32px  | content sheets, desktop panels, the feed well                             |
| `rounded-full`     | pill  | chips, buttons, discs                                                     |
| `--radius-edge`    | 2px   | the marketing site's near-square; in the app only the guide's inline code |

Nesting is **concentric**: an inner radius is the outer one minus the padding
between them, or the two curves stop sharing a centre and the corner reads as
uneven. `palette.test.ts` fails an arbitrary radius and a `rounded-edge` on any
control.

### The chassis, restated

```
MOBILE  (< 1024px)                           DESKTOP  (>= 1024px)
+------------------------+                   +--------+----------------------------+
| forest stage           |                   |        |  forest stage              |
|  (<)      CHECKOUT     |                   |  rail  |    +------------------+    |
| +----------------------+  <- 32px corners  | forest |    | paper panel 32px |    |
| | paper sheet          |                   |        |    |                  |    |
| |                      |                   |        |    +------------------+    |
| |   sticky action bar  |                   |        |                            |
| +----------------------+                   +--------+----------------------------+
|   ( o  SEARCH  o  o )  <- floating pill
+------------------------+
```

- **Tab roots** (`/`, `/search`, `/trips`, `/account`, and the `/guides` hub)
  show the floating bar and leave `tabbar-clearance` for it. **Focused routes**
  hide it and carry a back control; the registry's `isFocusedRoute` and the
  screen's `back` prop are the two halves of that decision, pinned to each other
  by `nav.test.ts` and `e2e/shell.spec.ts`.
- **The feed is the one screen without a sheet.** The well fills the phone edge
  to edge with the masthead and the bar floating over it; on a desktop it is a
  32px well set into the stage, still capped at 480px.
- **Chrome is still `forest`**, now as objects — the pill bar, the rail, the
  discs — separated from a paper sheet by contrast and from the picture by a
  `paper/12` hairline ring. There is still no shadow token.
- **The back control is a link to a stated fallback, never `history.back()`.**
  A shared link opened in a fresh tab has no in-app history, and search keeps
  its results in component state, so a true back would restore nothing anyway.
- **A screen reached from many places follows the trail** (approved redesign,
  3 Oct 2026). The listing and a business's page set `back.followTrail`: the
  link goes to the screen of ours the traveller came from when Back can name
  it ("Back to search", query and all), and to the stated fallback otherwise.
  The trail is in memory only (`route-trail`), a step back takes a screen off
  it so two screens that link to each other never loop, and a reload or an
  arrival from outside simply has no trail.

### Measured, and one thing ruled out

Every pairing inside a sheet is the paper table from §1, unchanged. The stage
adds nothing new: paper and paper/70 on forest were already measured. One
combination the chips wanted is recorded as failing: `terra-soft` over a
`paper/10` tint on forest composites to **3.95:1**, so the accent chip on a
dark surface is outline-only. `palette.test.ts` computes it.

The feed caption's order is contrast, not taste: the accent chip sits beside
the price in the bottom band of the scrim (85%+ abyss, where `terra-soft`
measures 5.5:1) and the operator line above the title is paper.

### The primitives (`src/components/ui`, `src/components/chrome`)

`Button` / `ButtonLink` / `ButtonArrow` (CVA: `primary · paper · outline ·
outlineOnDark · ghost · ghostOnDark`, sizes 36/44/52) · `IconButton` /
`IconLink` (a disc with a required name) · `Chip` / `ChipButton` (two
surfaces, three tones; the filter chip carries `aria-pressed`) · `Panel`
(`raised · outline · alert · dark`) · `Field` (a leading icon and a pill shape
for search) · `StickyBar` · `Screen` / `BackButton` · `TabBar` / `NavList` ·
the icon set. Compose from these; a hand-rolled button string is what this
version replaced twenty of.

## v2.6 (2026-08-18) — one near-black, and an app chassis

**The change: `device` is renamed `abyss` and gains a second sanctioned usage.**

The proposal was to _add_ `abyss #06100D` beside the existing `device #0A100E` as a ground for
full-bleed video. Measured, those two are **1.01:1 apart** — indistinguishable. Shipping both
would have recreated exactly the failure this system already fixed once, when `teal #0D3B3E` and
`ink #22302E` were merged into `forest` because "two dark fields in two colours" reads as a
mistake rather than as structure.

So the value did not change. Only the name and the scope did.

| Token       | Hex       | Role                              | Sanctioned usages — and only these                                        |
| ----------- | --------- | --------------------------------- | ------------------------------------------------------------------------- |
| `forest`    | `#16362E` | Brand dark — **unchanged**        | Chrome: tab bar, rail, sheet headers, footers, the operator portal        |
| **`abyss`** | `#0A100E` | **The near-black** (was `device`) | ① the media ground — feed, player, lightbox · ② the product-preview bezel |

**Why `forest` could not be the media ground:** it letterboxes video in a visibly green frame,
and it tints dark underwater footage — on the one screen that _is_ the product.

### Measured, sRGB relative luminance, WCAG 2.2

Computed, not estimated. `src/app/palette.test.ts` asserts every row.

| Pairing                 | Ratio       | Verdict                                              |
| ----------------------- | ----------- | ---------------------------------------------------- |
| `paper` on `abyss`      | **19.21:1** | AAA                                                  |
| `paper-deep` on `abyss` | **17.64:1** | AAA                                                  |
| `terra-soft` on `abyss` | **7.86:1**  | AAA — a full rung better than its 5.36:1 on `forest` |
| `terra` on `abyss`      | **5.17:1**  | **AA at body size**                                  |
| `terra` on `forest`     | 3.53:1      | large text only                                      |
| `abyss` vs `forest`     | 1.47:1      | reads as depth, not as a second surface              |

**Two consequences worth stating explicitly:**

1. **`terra` becomes body-safe on `abyss`, and is not on `forest` or `paper`.** The terra rule in
   §1 is relaxed **on this ground only**. Stated here rather than assumed, because an accent that
   passes on one dark and fails on another is exactly the kind of thing that ships broken.
2. **Every existing pairing gains headroom.** Nothing that passes on `forest` fails on `abyss`.

### The guardrail

`palette.test.ts` pins `bg-abyss` to the feed, the player, the state shells and the app shell.
The moment a content section takes it, the site has two darks again and the rule that made
`forest` singular is dead. The test also bans `font-semibold`, raw hex outside the token block, a
display face at any weight but 400 or the turn, and — since v2.7 — an
arbitrary radius or a `rounded-edge` control.

**One sanctioned hex literal exists outside `@theme`:** `src/lib/site/theme.ts`. Next reads
`viewport.themeColor` before any CSS is parsed, so it cannot be a custom property. The test
asserts it equals `--color-forest`.

### The display face is baked, and loads `optional` (v2.6)

> **Superseded by v3.0** (Anek Latin). The reasoning for `optional` still holds and carried over;
> the file and its numbers below are Fraunces's.

The app ships **`Fraunces-Yuvoy.woff2`, 13 KB** — the upstream variable font
instanced to the exact axis values §2 already pins (`opsz` 144, `SOFT` 75,
`WONK` 0) at weight 400, then subset. Letterforms are identical; four axes of
interpolation machinery are not shipped to a 0.5–3 Mbps connection to produce
one cut. Regenerate with `scripts/build-display-font.py`.

**A new display weight means going back to the variable file first.** A static
400 cannot serve 480, and the browser would synthesise it — the faux-bold this
type system exists to prevent.

It loads with **`display: optional`**, not `swap`. Measured: the feed headline
is the LCP element, and swapping it repainted at 4.1s against a first paint of
0.8s. With `optional` the font is preloaded and at 13 KB usually wins its block
window, so most visitors still get Fraunces — and a visitor on a genuinely bad
connection keeps the fallback for that page rather than watching the headline
change under them. LCP 4.1s → 3.0s, performance 87 → 94.

The trade, stated plainly: **on a first visit over a very slow connection the
headline is not in Fraunces.** For somebody standing on a jetty trying to book
a boat, that is the right way round.

### The turn is not shipped in the app (v2.6)

> **v3.0:** there is no italic and no turn in the app at all; `--font-weight-turn` was removed.

The italic "turn" — the second thought of a headline, set in `italic font-turn`
with the terracotta accent — is the marketing site's most recognisable
typographic move, and it stays there. The app ships **upright Fraunces only**.

Not an aesthetic judgement: the italic is a 146 KB variable font, `preload`
covers every file in a family, and the feed's headline is the LCP element on a
connection measured at 0.5–3 Mbps. Carrying a face the app never sets was 43%
of the font payload for nothing.

If a turn is ever wanted here, add the file back **and measure LCP before
merging**.

## The app chassis (new in v2.6)

The existing system was built for an editorial marketing site: cream canvas, hairlines, generous
space, slow entrances. An Instagram-shaped product needs an immersive, dense, fast surface under
the same brand. **Nothing about the brand changes — the system gains a second register.**

```
MOBILE  (< 1024px)                   DESKTOP  (>= 1024px)
+---------------------+              +--------+------------------+
| full-bleed 9:16     |              |        |  9:16 feed       |
| abyss ground        |              |  rail  |  max 480px       |
|                     |              |  nav   |  abyss, centred  |
| price . Book        |              | forest |                  |
+---------------------+              |        |                  |
| Feed Search Trips o |  tab bar     |        |                  |
+---------------------+              +--------+------------------+
   forest chrome
```

- **Chrome is `forest`, never `abyss`.** The 1.47:1 between them is what separates the controls
  from the picture behind them.
- **The feed column caps at 480px** (`--container-feed`) and stays 9:16 on every viewport. An
  upscaled phone video stretched across 1200px looks like a mistake.
- **Four tab destinations**, from the approved prototype: Feed · Search · Trips · Account. A fifth
  is a design change, not a routing one — `src/lib/site/nav.ts` is the registry and the e2e suite
  pins the count.
- **`viewport-fit=cover` is never re-added.** Standing rule from the marketing site's header work.
  `tabbar-foot` reads `env(safe-area-inset-bottom)` anyway, so nothing depends on it.
- **Motion skews to the interaction budget.** Feed transitions, sheets and tab changes are all
  `--ease-interaction`. The cinematic budget belongs to the marketing surface and does not follow
  the traveller into the feed.
- **Skeletons, never spinners.** A spinner says "wait"; a skeleton says "here is the shape of what
  is coming", which on 0.5–3 Mbps is the honest message.

---

Single source of truth for visual design. **Every color, font, radius and tracking value used in the app must map to a token here.** Never invent a value that falls between tokens — add a token (with review) instead.

Direction: **editorial, rectangular, confident.** Geometric display type against wide-tracked caps labels; paper editorial surfaces alternating with forest immersive ones; hairline rules doing the work that boxes and shadows do elsewhere. Generous space, fast interactions, slow entrances.

> **Brand Kit v2** (ratified 2026-08-01) supersedes v1. v1 was Fraunces + pill geometry on a warmer cream; v2 moves to Poppins + IBM Plex Mono and a rectangular geometry, retuning the palette to match. Rationale and the full contrast table are in §1.
>
> **v2.1 (2026-08-03)** replaces the two darks, `teal` `#0D3B3E` and `ink` `#22302E`, with a single `forest` `#16362E`. Nothing else changed.
>
> **v2.2 (2026-08-03, owner-directed)** replaces the display face: Poppins → **Instrument Serif**, the editorial serif the narrative-landing rebuild is set in. Owner brief: anything but the palette may change in service of a more premium register. The serif ships one weight (400 + italic), so display type is `font-normal` always — mass comes from size and leading, and there is no faux-bold to reach for. The wordmark deliberately stays on the sans (Inter semibold) so the mark reads engineered against the serif's warmth. Palette untouched. Adds `--radius-device` (§4) and the preview-surface rule (§8).
>
> **v2.3 (2026-08-05, owner-directed, skill-audited)** retires the serif stack entirely: Instrument Serif / Inter / IBM Plex Mono → **Cabinet Grotesk (display) + Satoshi (everything else)**, self-hosted from `src/fonts` via `next/font/local`. Driver: repeated external feedback that the site read as AI-generated, confirmed by the installed design skills — Instrument Serif is a named LLM-favourite face, the serif-over-Inter-with-mono-eyebrows structure is the documented generated-page house style, and headline emphasis by italic style-switch is a listed tell. Display is **medium (500)** with **700 reserved for the turn**; the turn is now **bold + colour in the same family, never italic** (no italic file exists); labels leave the mono for tracked Satoshi caps; buttons pick up `tracking-label`. Five font files total, no Google Fonts dependency. Palette untouched — the skills sanction deep green + bone + warm accent as a premium family.
>
> **v2.4 (2026-08-05, owner-directed)** swaps the display face only: Cabinet Grotesk → **Poppins** (600 + 700), taken from the original landing prototype kept in `claude-artifacts/`. This is the Brand Kit v2 display face returning — v2 shipped Poppins, v2.2 replaced it for a more premium register, v2.3 replaced that with Cabinet Grotesk. The owner asked to try it again on headlines **only**, so the prototype's Inter and IBM Plex Mono do **not** come back: Satoshi still carries body, UI, labels and the wordmark. Display weight moves from `font-medium` (500) to `font-semibold` (600), since those are the two files that ship. Poppins is also Indian Type Foundry, so both families share a foundry. Four font files total.
>
> **v2.5 (2026-08-06, owner-confirmed)** ends the search: display becomes **Fraunces**, the open-license member of the soft-serif family (Canela / Recoleta / GT Super) that premium travel and island-hospitality brands set their identities in — chosen over roughly 350 candidates across seven review rounds. It ships as a **variable font tuned into the site's own cut**: `opsz` 144, `SOFT` 75, `WONK` 0, pinned on the `font-display` utility itself via `--font-display--font-variation-settings`. Display weight is **400** (`font-normal`, owner pick from a six-weight strip); the turn is a **true drawn italic** at `--font-weight-turn` (480) via `italic font-turn` — the signature stops being a synthesized oblique. Display tracking moves to `--tracking-display` (-0.01em). Satoshi unchanged as the text voice. Five files total (two Fraunces variable + three Satoshi); `font-semibold` is banned everywhere again.

## 0. Architecture rule

- Styling system: **Tailwind v4** utilities + **CVA** for component variants. Tokens are CSS custom properties in `src/app/globals.css` under `@theme`.
- Compose from `src/components/ui` primitives; do not re-implement.
- Class merging via `cn()` (`src/lib/cn.ts`).

## 1. Color tokens

Brand Kit v2. Every ratio below is measured (sRGB relative luminance, WCAG 2.2) — not estimated.

| Token        | Hex       | Role                                                           |
| ------------ | --------- | -------------------------------------------------------------- |
| `paper`      | `#FFFFFF` | Canvas — default page background                               |
| `paper-deep` | `#F7F5F1` | Raised surfaces — cards, inputs, panels on paper               |
| `paper-line` | `#EDEAE4` | Hairline borders on paper                                      |
| `forest`     | `#16362E` | Primary ink **and** every dark surface (13.11:1 on paper)      |
| `terra`      | `#BE7149` | Accent — decoration and LARGE display text only (3.72:1)       |
| `terra-deep` | `#985028` | Text-capable accent (5.98:1 on paper); never a CTA fill        |
| `terra-soft` | `#D89772` | Accent text on forest (5.36:1)                                 |
| `device`     | `#0A100E` | **The preview bezel only** — an object's colour, not a surface |

### Measured contrast

| Pairing                      | Ratio   | Verdict                     |
| ---------------------------- | ------- | --------------------------- |
| `forest` on `paper`          | 13.11:1 | AA + AAA body               |
| `terra-deep` on `paper`      | 5.98:1  | AA body                     |
| `terra-deep` on `paper-deep` | 5.49:1  | AA body                     |
| `terra` on `paper`           | 3.72:1  | **large text only** (≥24px) |
| `terra` on `paper-deep`      | 3.41:1  | **large text only** (≥24px) |
| `paper` on `terra-deep`      | 5.98:1  | AA body                     |
| `paper` on `forest`          | 13.11:1 | AA + AAA body               |
| `paper-deep` on `forest`     | 12.04:1 | AA + AAA body               |
| `terra-soft` on `forest`     | 5.36:1  | AA body                     |
| `paper-deep` off `paper`     | 1.09:1  | the raised-surface step     |
| `paper-line` off `paper`     | 1.20:1  | the hairline step           |

### There is one dark surface

**`forest` is the only dark background on the site** — sections, the
registration block, and the footer alike. It is also the colour of all body
text on cream. `Section`'s `tone` is `"cream" | "ink"`, and `ink` paints
`forest`; there is no second dark to choose between.

There used to be. `teal` (`#0D3B3E`) and `ink` (`#22302E`) differed in hue —
184° against 171° — and in saturation — 65% against 17% — so one read as a
cyan and the other as a grey. Nobody scrolling a page tracks which block is
structural; they see two dark fields in two colours and conclude one of them
was a mistake. It was reported as a bug three times before it was fixed as one.

`#16362E` is a forest green with a teal undertone (hue 165°, saturation 42%,
lightness 15%). Two things made it the pick over the lighter `#1B4138` that was
also on the table: it holds **five times the contrast headroom** on the
tightest pairing (terracotta accent on dark clears the 4.5 floor by 0.86 rather
than 0.12, so a later tweak to the accent cannot silently break it), and at 15%
lightness it matches the depth of the darks it replaced, so the change reads as
_the greens became one_ rather than _the site got lighter_.

### Artwork under type is measured at its worst pixel

Three sections paint a photograph or an illustration behind their own colour — the cover, the footer, and the first-launch act. **A scrim over artwork is sized against the brightest pixel in the frame, not the average one, and not the band the copy is expected to fall in.** The crop moves: `object-cover` follows the viewport, and a section's height follows its copy, its breakpoint and how many plates it holds, so there is no fixed place on the page where a highlight can be assumed not to be.

Sizing to the expected band is what broke `plate-dissolve` the first time it was written — the caption ran taller than the solid zone on a phone and a line of secondary text ended up at 3.2:1 over pale sand. **Nothing would have caught it**: axe reports text over a gradient as "incomplete", not as a violation, so the accessibility gate stays green either way. The measurement is the gate.

Where the scrim is a gradient, state the floor and show that the range is bounded by it: more of the surface colour moves every pixel toward the flat surface, so a scrim that is safe at its weakest stop is safe at all of them. `launch-field` in `globals.css` carries the worked example and its table.

### The terra rule (read before using an accent on text)

`terra` is **decoration and large display text only**. At 3.72:1 it clears AA
for large text (≥24px, or ≥18.66px bold) and nothing else. It may never be used
for body copy, labels, nav, or button text.

- Accent text at body/label size **on paper** → `terra-deep`.
- Accent text **on forest** → `terra-soft`.
- **`terra` text may only sit on `paper`, never on `paper-deep`** — and since
  v2.9 that is a restraint rule rather than a contrast one. It used to be
  arithmetic: on cream the headroom over the large-text floor was 0.24, the
  raised surface alone spent it, and 3.24:1 became 2.96:1 — the same headline
  passing on the canvas and failing on a panel, which is exactly what happened
  to the marketing site's operators section. A white canvas buys that headroom
  back: 3.72:1 on `paper` and **3.41:1 on `paper-deep`**, so the panel now
  clears 3:1 too.

  The rule is kept anyway. An accent that is legal everywhere is an accent that
  spreads, the margin on a panel is still only 0.41, and the raised surface is
  where cards and inputs live — which is small-text territory, where `terra`
  fails whatever the ground. Put the section on `paper` and raise its inner
  panels to `paper-deep`, which is how that section is built.

- Accent **fills** are not a thing any more. CTAs are monochrome (§5): forest
  on paper surfaces, paper on forest ones. A `terra` fill with text on it fails
  AA, and the `terra-deep` fill that used to carry the CTA was retired on
  2026-08-05 as a template tell.

### The opacity ladder (measured, not guessed)

Muted and secondary text comes from **opacity modifiers on `forest` / `paper`**, not new tokens. The rendered composite decides whether it passes, so the safe floors are fixed:

| Usage                         | Floor            | Composite ratio |
| ----------------------------- | ---------------- | --------------- |
| Body/secondary text on paper  | `text-forest/70` | 5.14:1          |
| Labels + small text on paper  | `text-forest/75` | 6.00:1          |
| Body text on forest           | `text-paper/60`  | 5.78:1          |
| Comfortable secondary on dark | `text-paper/70`  | 7.26:1          |

**Anything below `forest/70` on paper, or `paper/60` on dark, is decoration only** — never text. Every rung above held when the darks merged: `forest` is deeper than the `teal` it replaced, so each pairing gained margin rather than losing it.

Borders and fills are exempt from these floors — `border-forest/20`, `bg-forest/5`, `border-paper/12` are all fine.

## 2. Typography

**Three voices (v3.2).** The full system, with the scale, the rules and the loading strategy, is `docs/typography-system.md`. In brief:

- **The host: Gotu** via `voice-host`. Every word a host wrote and Yuvoy only carries: listing titles, descriptions, what is included, the meeting point, the policy, their story, their business name, their questions and messages, and the portal's fields that write them. One weight, synthesis off, untracked, proportional figures; it never sits beside a weight, face, tracking, case or figure class.
- **Display: Anek Latin, the display cut** (`font-display`). The semi-condensed bold (width 87.5, weight 700), baked 4% large and registered at 400. Yuvoy's headlines only, always `tracking-display leading-display text-balance` with a size. `font-medium`/`font-semibold`/`font-bold` must never appear with it: it is already bold, and the browser would synthesise a heavier copy. A host's headline is `voice-host leading-display text-balance` instead. The app sets no italic and no turn.
- **The board: Anek Latin, the board cut** (`font-board`). The condensed bold (width 75, weight 700), baked 12% large and registered at 400: the figure that leads a block, always `tabular-nums`, never tracked (`tracking-normal` inside a tracked headline), never at a weight class.
- **UI / body: Anek Latin** (`font-sans`, the default), normal width, weights 400 / 500 / 700 from one variable file. `font-semibold` must never appear: three weights, not a continuum. Running text is `text-body text-pretty` (15/23; the portal keeps its size with `leading-body`). Emphasis in running text is `font-bold`.
- **Label: Anek Latin** via the `label` utility: sentence case, 13/18, `font-medium`, untracked, never beside a size or a weight class. A button is `text-button font-bold` (15/20), navigation `text-xs font-bold`, a chip its own size at `font-medium`: none of them is a label. Tracked capitals are banned.
- **References**: booking, statement and support references take `tracking-ref slashed-zero tabular-nums` in the text face. Codes being typed and technical error ids keep the system monospace, the one place `uppercase` is allowed.
- **`eyebrow` utility** — the `label` preceded by a terracotta dot, the same square `size-1` marker the fact rows use (a hairline rule until 2026-08-05, replaced by owner direction). This is the section-opening gesture; **use it once per section**, at the top. Eyebrows are plain phrases: no act numbering (owner direction 2026-08-03). The one exception is the cover: the hero's opening line is a plain `label` with no marker (owner direction 2026-08-05).
- **Wordmark** — ensō + terra dot and the tracked YUVOY caps, side by side. **No strapline, on any surface** (owner, 14 Sep 2026, yuvoy-app#36): it was on the feed, search, trips, account, every listing header, the desktop rail, the home-screen name and the share card's alt, and it is now on none of them. `<Wordmark />` takes a `tone` and nothing else; the second drawing was deleted rather than left behind a prop, because a default is how a removed thing comes back. Two tone variants because a paper ensō is invisible on paper (the §1 pairings). Generated by `scripts/generate-feed-lockup.mjs` from the delivered lockup **in yuvoy-web**, which this repo no longer keeps a copy of. Never hand-edit the generated SVGs; re-run the script after a redelivery. `src/components/ui/wordmark.guard.test.ts` fails the build if either the strapline or the delivered art comes back under `src` or `public`.
- **Punctuation** — rendered copy never uses an em dash. Prefer a period, a colon, a comma or a parenthetical; ranges and pairings use a middot (owner direction 2026-08-03). Code comments are exempt. Since 2026-09-12 the ban covers every long dash (em U+2014, en U+2013, horizontal bar U+2015) and a range takes a plain hyphen, enforced by `pnpm check:dashes`, which runs first in `pnpm lint` and blanks comments before it looks; text from the API is stripped at the boundary instead, in `src/lib/format/dedash.ts`.
- **Launch timing** — never name a month. The hero states it plainly ("Opening soon", owner direction 2026-08-05); deeper copy may describe the season evocatively ("when the water clears", "when the sea turns to glass").
- **The mark** — the official ensō (brush ring + terracotta dot), **cut out, never tiled**. The delivered source (`design/brand-source/yuvoy-logo.png`) is white strokes on an opaque black field, so every display asset is derived by `scripts/generate-brand-assets.py`; never hand-edit them, and re-run it if the source is replaced.
  - `yuvoy-mark-on-light.png` / `yuvoy-mark-on-dark.png` — transparent cut-outs, forest and paper strokes. **These are what the UI uses.** Two files rather than one recoloured file because a paper ensō is invisible on paper and a forest one is invisible on forest. `WaveMark` renders both and cross-fades on opacity, so the header's colour change never waits on a fetch.
  - **Icons are generated from the vector by `scripts/generate-icons.mjs`** (2026-08-07): `src/app/icon.svg` (the primary favicon), `src/app/icon.png` (512, Android + the `Organization` logo), `src/app/apple-icon.png` (180), `src/app/favicon.ico` (16/32/48 PNG-in-ICO) and `public/brand/yuvoy-mark.png` (the OG card's mark). All carry the forest tile, because a favicon is drawn on a browser tab whose colour we do not control — **a tile must never appear in the page itself**; on a forest section it draws a green box around the mark. They previously came from the raster pipeline, which left a soft rectangular halo around the terracotta dot; the vector has none. Never hand-edit an output; re-run the script.
  - The script resamples by **area averaging, not bilinear**. Bilinear is a magnifying filter; shrinking with it discards most of the source pixels and is what made the mark look coarse and its brush strokes break up. Masks are measured off the source, not guessed.
  - **Delivered masters live in `design/brand-source/` and `design/photography-source/`, never under `public/`** (2026-08-07): anything in `public/` is deployed and publicly fetchable, and 4.6MB of print-weight PNGs were shipping on every deploy for no reason. Scripts read them from there.
- **Vector assets** are derived from the delivered master `public/yuvoy-logo-vector.svg` by `scripts/generate-vector-brand.mjs`: `public/brand/yuvoy-mark-vector-{paper,forest}.svg`, `public/brand/yuvoy-lockup-vector-{paper,forest}.svg`, and the intro's per-letter module `src/components/brand/yuvoy-letter-paths.ts`. The tagline is stripped from all of them, and the delivered colours are re-expressed as tokens (paper or forest strokes, `terra` dot). Never hand-edit the outputs; re-run the script.

Scale: Tailwind's type scale with three steps of our own (`text-label`, `text-button`, `text-body`); the table is in `docs/typography-system.md`.

## 3. Motion

> **Superseded in part by v3.1 (4 Oct 2026, above)**: three budgets, four curves, and reduced motion that swaps rather than deletes. The marketing-site entries below (the `emerge` entrance, the shutter, the veil, the header) are unchanged and remain the marketing site's.

Two budgets, and they are not the same thing — this is the ruling that resolves "fast, responsive UI" against "slow, considered entrances".

| Class of motion                                                                 | Budget     | Easing               |
| ------------------------------------------------------------------------------- | ---------- | -------------------- |
| **Interaction feedback** — menu open/close, hover, tab switch, accordion, focus | **≤250ms** | `--ease-interaction` |
| **Entrance** — the `emerge` utility, on first paint only                        | ~1100ms    | `--ease-cinematic`   |

- Tokens: `--ease-interaction` (`cubic-bezier(0.32,0.72,0,1)`), `--ease-cinematic` (`cubic-bezier(0.22,1,0.36,1)`). The cinematic curve's second control point was `0.16` until 2026-08-04, which made every entrance climb to full, sag back and climb again — a wobble halfway through the motion. If an entrance ever looks unsettled, check this number first.
- CSS entrance: the `emerge` utility, used **only** for the homepage cover's first paint. It moves three properties at once — scale (toward the viewer), translate (settling) and blur (pulling into focus) — so the composition surfaces from depth rather than sliding up, and the blur clears at 65% so the type is sharp while it is still settling. It ships zero JS.
- **The site menu opens like a shutter**: `menu-shutter` unrolls the panel from its top edge with `clip-path` (420ms, cinematic) and rolls it back up to close (320ms, quicker — waiting on a dismissal you already asked for reads as lag). `SiteMenu` holds the dialog open until the closing shutter has run, and skips that wait under reduced motion, where there is nothing to wait for.
- **The brand veil (`BrandIntro`) is the site's entrance**, and the one composition allowed above the `emerge` budget: once per tab session, a night-water scene (film-gradient field, the comp's island horizon at the foot, particle swells rolling in from each edge and dying before the centre, grain) on which the mark surfaces, the wordmark's letterforms arrive in the cover's own emerge grammar, "Experience more." is written on in the veil-only handwriting face (`--font-script`, the one sanctioned use), a sloped calligraphic swash underlines it as the word finishes, and the island's name signs the foot of the frame (~3.4s all told, timeline in `globals.css`). The exit is the emerge grammar reversed — the camera pushes through the dissolving veil — and it hands off: the cover's `emerge` entrance is suspended (`animation: none`, fail-open visible) while the veil holds `data-intro-wait`, then re-applies from zero at exit start, so the hero surfaces through the dissolve. Page scroll is locked by the component only while it plays, never by pre-hydration code, so a hydration failure cannot strand a locked page. It is theatre over a live page, never a loading gate: the page renders and settles behind it, CSS alone runs and ends it, an inline script decides **before first paint** that repeat sessions, reduced motion and no-JS visitors never see it, and any keypress dismisses it on the interaction budget. It must never be given work to do — no data fetching, no font waiting, no route gating — and its session key is `yuvoy.intro-played`.
- **The header wears the cover's colours at the very top** of a route whose first section is dark (`data-dark-hero`, currently `/` and `/go/*`): transparent bar, cream contents. Any scroll away from the top returns the solid bar (owner's choice, 2026-08-04, over tracking the whole cover). The swap is invisible in practice because it happens while the header is hidden — the only cross-fade seen is the deliberate one at the top edge. The cover carries `-mt-14` so it reaches up behind the bar; without that, "transparent" would show the page background rather than the cover.
- **The header is the one exception to the no-scroll-motion rule** (owner direction, 2026-08-04): it slides out of the way going down the page and returns going up, via the `header-slide` utility and `HeaderShell`. It answers a gesture rather than decorating an arrival, which is why it sits in the interaction budget (250ms) and not the entrance one. It never hides near the top, always returns on focus, and does not run at all under reduced motion.
- **No other scroll-triggered motion.** Sections render in place, fully visible, the moment they are reached. The `<Reveal>` component and the operator grid's draw-on-scroll strike were both removed on owner direction (2026-08-03): content that animates itself into view reads as decoration, and on a pitch page it delays the thing the reader came for. Do not reintroduce either without that decision being revisited.
- JS motion: **none.** `motion/react` has no consumers, and `<MotionConfig>` was removed with its last one. If a genuine need for JS animation returns, restore `<MotionConfig reducedMotion="user">` in `providers.tsx` in the same change — it is what makes Motion honour the OS preference, which CSS-level reduced-motion cannot do for it.
- **Reduced motion is handled globally**, once, in `globals.css`: a `prefers-reduced-motion: reduce` block neutralises every animation and transition. Individual components must not add their own reduced-motion branch — if a component needs one, the global rule is wrong and should be fixed instead.
- Smooth scroll: **not implemented, and out of scope.** Lenis was removed in v2 rather than left as a dependency implying a feature that did not exist.

## 4. Radius, spacing, sizing, grid

- **Radius, on the marketing site: `rounded-edge` (2px) — the editorial near-square.** Buttons, inputs, cards and panels all share it there, and pills are not part of that surface. **In the app (v2.7, above) the scale is `tile · control · card · sheet` plus the pill**, and `rounded-edge` is banned on controls.
- **`--radius-device` (2.25rem) — the one rounded object in the system**: the Season One phone-preview frame. It depicts hardware, not UI; nothing else may use it. (Tiny `rounded-full` dots inside the preview depict hardware/avatars and share this exemption.)
- **`bg-device` — the bezel's near-black**, on that same frame and nothing else (owner direction, 2026-08-06). `forest` was tried and reads green at 4px of bezel. This is **not a second dark surface**: it is what a phone's frame is made of, and `Section` still offers one dark tone and no choice to make. `palette.test.ts` pins that exactly one element in `src` carries `bg-device`, and that it is darker than `forest` — the moment a section takes it, the site has two darks again. Not pure `#000`, which sits harder than anything else on the page and rims the frame against cream.
- **The bezel's padding and the screen's radius are one measurement.** The screen is `calc(var(--radius-device) - <bezel padding>)`; change the padding without the radius and the two curves stop being concentric, which shows as an uneven bezel at the corners.
- **`device-frame` — the one gradient and the one shadow in the system**, on that same frame and nothing else (owner direction, 2026-08-06). The frame is an object resting on the page rather than a panel drawn on it, which is the whole reason it may be lit or cast at all. It carries a diagonal rail gradient, a 1px specular edge and a top highlight (so it reads as milled metal rather than a border), then two soft drop shadows — a tight contact one and a wide ambient one with negative spread so it cannot bloom into a halo. Every value is a `color-mix` on a token: the highlights are `cream` lifting `device`, and the shadows are `forest`, never black, which would grey the cream under it. `device-key` draws the volume and wake buttons from the same mix. Everywhere else, hairlines still do the work shadows do elsewhere.
- Spacing: Tailwind v4 dynamic scale (multiples of `0.25rem`). Stay on the scale.
- Control heights: `sm` 36px (`h-9`), `md` 44px (`h-11`), `lg` 52px (`h-13`). Inputs are 48px (`h-12`).
- **The header is 56px (`h-14`)**, and the menu panel's top bar matches it exactly — same height, same `container-page` gutters, same negative margin on the button — so the close button lands on the pixel the trigger occupied. Anything that offsets for the header (`scroll-mt-14`, the cover's `100dvh-3.5rem`) follows this number; change them together.
- **Page measure: `container-page`** — `max-w-page` (70rem) with `px-6 sm:px-10` gutters. Every full-width section uses it; prose pages may narrow further (`max-w-2xl`).
- **Editorial grid: `grid-page`** — 4 columns on mobile, 8 from `sm`, 12 from `lg`, with responsive gutters. Place children with `col-span-*` per breakpoint. Use it for content-heavy pages (destinations, journal, comparison layouts); simple stacked sections do not need it.

## 5. Components (current)

- **`Button`** — variants `primary | outline | paper | ghost | outlineOnDark`, sizes `sm | md | lg`. Labels are uppercase bold at `tracking-label`; hover lifts a pixel, press compresses (`active:scale`), and the trailing arrow eases forward — all on `--ease-interaction`.
  - **CTAs are monochrome** (owner direction 2026-08-05): on cream surfaces the pair is `primary` (solid forest) + `outline`; on forest surfaces it is `paper` (solid cream) + `outlineOnDark`. Both fills are 11.44:1. **Terracotta is never a button fill** — it is the accent for type, dots and marks; the old terra-deep CTA was retired as a template tell.
  - `ghost` (text-only) is **situational** — allowed, but justify it in review. The former `ink` variant is gone: `primary` now is the forest fill.
  - Use `buttonVariants()` to style a `<Link>` as a button; `<ButtonArrow />` for the trailing arrow on a forward action.
- **`Section`** — the page's unit: one tone (`cream | ink`), the `container-page` measure, and the standard vertical rhythm. It takes an optional **`backdrop`** slot: a full-bleed decorative layer painted behind the measure, which is how the first-launch act carries artwork without hand-rolling its own `<section>`. The caller owns the layers and must make them inert (`aria-hidden`, `pointer-events-none`, `absolute inset-0 -z-10`); the section supplies `relative isolate overflow-hidden` when the slot is filled. **A backdrop does not relax the contrast floors** — see the artwork rule in §1.
- **`Input`** — `rounded-edge` field on `cream-deep`, terra-deep focus ring.
- **`WaveMotif`** — the three-line wave glyph, the island signature. Decorative accent only, at most once per section; tone follows the surface.
- **`Wordmark`** — the horizontal lockup, self-sized by a height class (`h-9` default; the footer passes `h-10`). `tone` follows the surface. The square cut-out marks still ship in `public/brand/` for the favicon, app icon and OG card; `WaveMark` (the standalone square-mark component) was removed with the lockup switch — nothing rendered it.
- **`BrandIntro`** — the brand veil (§3), rendered first in the root layout's body. Owns only the pre-paint decision script and the post-play cleanup; every visual decision lives in `globals.css` under the `intro-*` classes.
- **`SiteHeader`** / **`SiteFooter`** / **`SiteMenu`** — the shell, rendered by the root layout on every route. All navigation comes from the registry (§7).
- **`DestinationPanel` / `DestinationGrid`** — the editorial plate and the triptych. The whole plate is the link (one target, not a heading plus a "read more" to the same page). The photograph fills a **fixed `aspect-3/4` plate**, and the caption is `absolute bottom-0` so its height constrains nothing — it grows upward over the image rather than clipping or pushing the plate taller. The ground under the type is a **continuous gradient**, not a block: `plate-shade` for ~190px above it, `plate-caption` across it, meeting at one value with no seam, so roughly 31% of the picture still reads under the name. The caption's order — name, description, terracotta link — is **load-bearing**: the gradient deepens downward and the elements are stacked in order of how much contrast each needs, so the tightest pairing in the palette sits where the shade is almost closed. Reordering it fails AA; replacing a plate photograph means re-measuring. Both figures and the sweep behind them are on `plate-shade` in `globals.css`. The description is never clamped — it is the only thing on the plate not repeated by the section around it.
- **`ExperienceCategoryGrid`** — deliberately lighter than the triptych, and deliberately **not links**: four panels pointing at one anchor are four repeated links, and there is no per-category page because there is no inventory. One call to action beneath the grid instead.
- **`FaqAccordion`** / **`StatusNotice`** — native `<details>`/`<summary>` (the browser owns the keyboard behaviour; the `faq-summary` utility kills the marker in Blink _and_ WebKit), and the compact panel that replaced the full-section "what this is not" blocks. A status notice is visible and never dominant: if it needs a heading and a list, the copy is too long and belongs in the FAQ.
- Growing set: ExperienceCard, FeedPlayer, AvailabilityPicker, PriceBreakdown (as screens land).

## 6. Accessibility (release gate)

WCAG 2.2 AA, enforced not assumed:

- Contrast pairings come from §1's measured table and the opacity floors. Nothing ships on an unmeasured pairing.
- Keyboard-complete flows; visible focus (`focus-visible:ring-terra-deep`).
- **Tap targets: `tap-target` on any standalone small link.** A 16px `label` link is a 16px pointer target, below the 24px SC 2.5.8 minimum — the utility lifts it to 28px. Links inside a sentence are exempt (the criterion's inline exception) and should not use it. Enforced per route in `e2e/shell.spec.ts`; axe does not catch this.
- `aria-invalid` + `role="alert"` on form errors.
- The mobile menu is a native `<dialog>` opened with `showModal()` — the browser provides the focus trap, Escape handling and background inerting, so they cannot drift out of sync with the markup.
- axe runs in CI against every route.

## 7. Navigation registry

`src/lib/site/nav.ts` is the single source of truth for every navigable route. The header, the site menu and the footer are all derived from it.

- **A route is added to the registry in the same PR that ships its page** — never before. This makes a link to a non-existent page structurally impossible.
- **The header names three routes and the call to action** (owner direction, 2026-08-06): Explore, For Operators, About, then Join Waitlist, inline from `lg` up. **Adding a fourth nav item is a design change, not a routing one** — it goes through review, and `e2e/shell.spec.ts` pins the link count so it cannot arrive by accident.
- **Below `lg` the bar carries two things: the mark and the menu trigger.** It carried a centred operator link and a small CTA button until 2026-08-06; three competing targets in 64px reads as a toolbar rather than a masthead, and left the mark no room. Both live in the shutter menu now, where the CTA is pinned at full size at the foot of the panel.
- **Journal stays out of the desktop bar** until there is enough of it to earn a slot. It is in `MENU_ITEMS` and the footer meanwhile. `inHeader`, `inMenu` and `footer` are set explicitly per route rather than derived — the menu carries Safety (a Trust-column route) and omits the legal pages (pinned separately), and every derived rule got one of those wrong.
- **The site is addressed to travellers by default.** The homepage, and any future page that does not say otherwise, speaks to them; the operator _case_ belongs on `/operators`. The homepage carries a three-sentence introduction and one way out to it (`OperatorTeaser`) — that is the bound, and `e2e/home.spec.ts` holds it: no operator form, no audience picker, no tooling argument. A page that pitches both audiences at once ends up asking the visitor to self-identify before it has earned the right to (see `LeadForms`' `audiences` prop, which is how a page commits to one).
- Footer columns with no entries are dropped rather than rendered empty.
- `CONTACT_CHANNELS` is empty by design: an unmonitored address is worse than none, so the footer omits the whole row until a real channel is confirmed.

### The information architecture (2026-08-06)

Four pages — `/destinations`, `/experiences`, `/how-it-works`, `/travellers` —
were one question answered in four places, so a visitor who read all of them
met the same three benefits four times. They are now four sections of
`/explore` and redirect onto it.

Those redirects are **307, not 308, on purpose**. A browser caches a permanent
redirect indefinitely, which would make the consolidation irreversible on every
machine that ever saw one. They are promoted to permanent only once the shape
has held for a season. (`/destinations/neil` → `/destinations/neil-island` _is_
308: that is a canonical slug fix, not a structural bet.)

Permanent public structure: `/` · `/explore` · `/operators` · `/about` ·
`/safety` · `/journal` · `/waitlist` · `/privacy` · `/terms` ·
`/destinations/[slug]`.

### Destinations are data, not pages

`src/lib/site/destinations.ts` is the only place a destination is described.
The homepage triptych, Explore, the destination pages and the OG cards all read
from it. **Adding a second market is an entry there plus one in the lead
registry** — no component knows Andaman is the current launch, only that a
destination has a `launchStatus`. Copying a blurb into a page file is the bug
this shape exists to prevent.

`heroMedia` is optional on both destinations and experience categories: with no
image a panel renders as an editorial type plate, with one it renders as a
full-bleed photograph plus a measured scrim. Photography is a data change and
needs no redesign.

## 8. Figma / prototype → code

No Figma. The reference is the [pre-launch landing artifact](https://claude.ai/public/artifacts/b099d827-a565-4679-91c2-38d242feeed7) plus the brand docs.

**The artifact is a visual reference, not a content one.** Its layout, density, type treatment and motion are the target. Its copy is not: it shows prices, live availability, named listings and completed-booking screens, none of which exist. Those are barred by the project's truthfulness rules (see `CLAUDE.md` and issue #32) and several of its own colour pairings fail AA — the palette in §1 is the corrected version, not a transcription.

### The preview surface (owner-approved exception, 2026-08-03)

The **Season One phone preview** (`ProductDemo`) is the one place illustrative product content may appear — prices, seat counts, operator lines — under three conditions, all enforced:

0. **At most one per page.** It appears twice on the site — the homepage's why act and `/explore`'s how-it-works section — and each page carries exactly one, asserted by `e2e/home.spec.ts` and `e2e/explore.spec.ts`. Its rail copy may differ per page through `actCopy` (the homepage's headline has already made the argument, so the rail is a caption; `/explore` _is_ the explanation, so it is specific). Only the sentence changes: the acts, the script and the timings are the same object on both, because a page may describe the tour differently and must never restage it.

1. The frame is **visibly captioned** ("Sample preview") and its wrapper carries `data-preview`; the frame's accessible name states outright that nothing is bookable yet, and the e2e guards ban invented numbers everywhere _outside_ that wrapper (see `e2e/support/text.ts`, which also strips Next's dev-mode RSC payload — `page.textContent("body")` includes `<script>` text and therefore sees every string twice).

   > The wording moved twice on 2026-08-06 (owner direction): the "Season One preview" badge pinned to the frame, then the longer caption under it, then the present two words. **A caption must stay narrower than the screen it labels** — the long one was wider than a phone, and on a shared `w-fit` wrapper that sized the wrapper to the caption, stretched the frame block to match and left the screen's slack down its right edge. The frame carries its own `w-fit` now, but the rule stands.
   >
   > The caption says "sample", not "not bookable". The page's plain-language statement lives in the registration section's first answer — "Can I book something today? No, and we won't pretend otherwise." — which `home.spec.ts` asserts alongside the caption.

2. Its "footage" is **moving colour built from brand tokens** (`film-*` + `caustics` utilities, `color-mix` only) — unmistakably an illustration, never a fake photograph or a real-looking screenshot.
3. Claims **outside** the preview stay literally true (e.g. the "3 founding operators signed" count is owner-confirmed and must track reality).

Any pasted export is oversized vs. real scale: calibrate the ratio, snap every value to a token, re-express with flex/grid, mobile-first.
