# Reel screen design laboratory

Nine design hypotheses for the reels feed at `/`, in a real phone viewport, in
two groups.

**Open `index.html`.** No server, no build step, no network. Double click it.

**Column family (06 to 09)** is the owner's concept and three ways further:
Concept 01's screen layout and a right-hand column carrying save and share above
the arrow as icons only. In **06** the chevron after the seats opens Concept
03's panel and the arrow opens the listing, so every control does one thing
(owner's ruling, 14 Sep). In 07, 08 and 09 the arrow is still the one that
opens the panel. 07 adds a second detent that fetches the departures. 08 moves the
caption to the quiet part of the frame. 09 keeps the panel open across swipes so
the feed becomes a comparison.

**Earlier studies (01 to 05)** are the five the family was chosen from. They
stay because the family only makes sense against what it came from.

- Press **1** to **9** to switch concepts, or use the panel.
- Press **D** for the frame luminance grid (concepts 04 and 08).
- **Departures fetch** forces Concept 07's second detent slow or failing, so its
  loading, error and empty states can be walked rather than imagined.
- The **viewport** buttons put the same concept in an iPhone SE, a standard
  iPhone, a Pro Max and a narrow Android.
- **Jump to a hard case** goes straight to a long title, a listing with no
  price, one with no dates in ninety days, an unclassified one, the brightest
  frame in the set and the darkest.

A tap that would navigate reports where it would have gone rather than going
there; there is no listing screen behind this.

## What is real and what is standing in

| Real                                                                               | Standing in                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every colour, radius, easing and tracking token, lifted from `src/app/globals.css` | The clip. There is no rights-cleared footage yet (yuvoy-app#11), so posters are procedural SVGs built to have the luminance structure real footage has, and a slow drift stands in for playback |
| The delivered Fraunces Yuvoy and Satoshi faces, copied into `assets/`              | The shortlist in Concept 05, held in memory. In production it is IndexedDB beside the booking tokens                                                                                            |
| The icon set, traced path for path from `src/components/ui/icons.tsx`              |                                                                                                                                                                                                 |
| The swipe constants, value for value from `src/lib/feed/use-swipe-to-open.ts`      |                                                                                                                                                                                                 |
| The scrim, stop for stop, including the twelve-stop sigmoid                        |                                                                                                                                                                                                 |
| The tab bar at its own 56px, 12px foot and 92px clearance                          |                                                                                                                                                                                                 |
| The field names, optionality and verbatim-rendering rules of `GET /reels`          |                                                                                                                                                                                                 |

## How it is put together

The seam is in the same place as production, on purpose: `ReelStrip` owns the
scroll, the observers, the preload budget, the gesture and the tail, and the
concept owns only what is drawn over the picture. A concept that fits this seam
fits `ExperienceCard` without touching the four surfaces that share the scroller.

```
index.html            the shell
css/tokens.css        the real design system, as plain custom properties
css/reel.css          the shared reel surface: strip, card, scrims, chrome, bar
css/family-column.css the Column family, plus the frame-reading layer 04 and 08 share
css/concepts.css      one sealed section per earlier study
css/lab.css           the instrument's own chrome, deliberately not on brand
js/ui.js              DOM helper, icons, formatters, the bar and the masthead
js/data.js            twelve rows shaped exactly like GET /reels, and the
                      stand-in for the departures endpoint
js/posters.js         procedural frames, and the luminance read
js/frame-read.js      where a frame is quiet, and what writing there costs
js/strip.js           the shared scroller
js/column.js          the Column family: foot, rail, saved set, sheet chassis
js/lab.js             registry, viewport presets, instruments
js/concepts/*.js      one file per concept
```

Scripts are classic rather than ES modules. A module loaded from a `file://` URL
is blocked as cross-origin in Chrome, which would mean this folder only worked
behind a server; classic scripts execute in order and share one `Lab` namespace,
which buys the same separation with none of that.

## The checks

```
npx playwright install webkit                          # once per machine
node docs/reel-lab/file-check.mjs                      # the file:// path
python3 -m http.server 8777                            # from the repo root
node docs/reel-lab/audit.mjs                           # geometry and axe
```

Both resolve Playwright through the checkout they are run from. From a worktree
with no `node_modules`, point them at one that has:

```
LAB_RESOLVE_FROM=/path/to/yuvoy-app/package.json node docs/reel-lab/audit.mjs
```

`audit.mjs` sweeps nine concepts across four phone sizes for overlap with the
bar, clipping, overflow, tap targets under 24px, unnamed controls and unclamped
titles, checks Concept 03's sheet against its stated 54% ceiling in the open
state at every size, checks Concept 04's placement engine actually discriminates,
checks Concept 05's double tap, and runs axe at WCAG 2.2 AA on each concept.

For the Column family it also checks, on every one of the four: that the arrow
opens a panel rather than navigating, that the panel holds its 54% ceiling on
every phone without clipping or running under the bar, that nothing behind the
open panel is still reachable, that save is a real two-way toggle, and that no
number ever appears beside it. Plus Concept 07's three fetch states and the fact
that Concept 09's panel survives a swipe and updates.

It exits non-zero on any of them.

It is served rather than opened because axe fetches every stylesheet to run
colour contrast, and a `file://` stylesheet is cross-origin to it: over `file://`
the contrast rule does not fail, it does not run. `file-check.mjs` covers the
filesystem path separately, including reduced motion.

Nine defects came out of these scripts rather than out of looking at the screen,
and each is recorded at the line that fixes it. The three that mattered most:
the open panel left three controls reachable behind it, the panel broke its own
ceiling on an iPhone SE and put the call to action under the bar, and Concept
09's panel left the feed unreachable by keyboard.

## Nothing here is wired to the app

This folder is documentation. It imports nothing from `src/`, is imported by
nothing, and changes no production behaviour. The only files it takes from the
repository are four font files and one SVG, copied so the folder opens on its
own.

## Saving is private, and there are no counts

The Column family's heart is a save, not a like. Nothing it records is
published, aggregated, counted in public or shown to an operator, and no number
appears beside it. The API publishes no rating, no review count and no follower
count on purpose, and a heart with a count under it would reverse that decision
by accident. The only number anywhere in the family is Concept 09's "N saved",
which counts what this device is holding and nothing else.

See `REEL_SCREEN_RESEARCH.md` and `DESIGN_EXPERIMENTS.md` at the repository root.
