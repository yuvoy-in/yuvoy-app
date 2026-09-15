# Nine reel screens, evaluated

The companion to `REEL_SCREEN_RESEARCH.md`. That document establishes what the
screen is for; this one says what each answer does about it, what each gets
wrong, and which should become the production direction.

Open the laboratory at `docs/reel-lab/index.html`. It needs no server, no build
and no network. Press 1 to 9.

**Read in two passes.** Concepts 01 to 05 are the original studies. After
reading them the owner specified a sixth from pieces of two, and concepts 06 to
09 are that screen and three ways further. The **Column family** starts at
section "The family" below; the five studies it came from follow it.

Everything measured below comes from `docs/reel-lab/audit.mjs` running in WebKit
across four phone sizes, not from looking at a screenshot.

---

## The thesis being tested

> **The first reel screen exists to turn a scroll into a shortlist.** It should
> show the picture at full size and give a traveller only what decides the next
> swipe: what this is, and whether they could actually do it while they are
> here. Price, operator and evidence are revealed the moment the traveller stops
> scrolling, because stopping is the only honest signal of interest this screen
> can read.

Every concept keeps the picture full size. They disagree about the second and
third clauses, and that disagreement is the experiment.

---

## What they all share

Not as a convenience. These are the settled decisions from the repository, and a
concept that broke one would be re-litigating a closed question rather than
proposing a new one.

- **The bar is visible on every reel and never retracts.** Built on 9 September,
  killed by the owner on the 13th by name.
- **The mark is top left, 28px, no tagline.** Same ruling.
- **Right to left opens the listing**, at the app's own gesture constants: a
  1.4 axis bias, a 72px commit, a 24px right-edge guard for the platform's own
  back gesture, a mouse refused, a click swallowed after a drag.
- **Poster first.** A card is complete with no clip. The preload budget is the
  active card plus one.
- **Tap on the picture is play and pause.** It belongs to the media.
- **One href**, shared by the arrow, the title and the swipe.
- **No rating, no review count, no like, no follower.** None exists in the API,
  and all of them would be fabricated claims.
- **Fraunces at 400, Satoshi, forest, cream, terra, abyss.** No shadow, no
  glass, no accent fill, no chip over video.

---

# The family

## What the owner specified

> From 01 take the entire screen layout, here we should have like and share
> buttons as well on the right side column, but just icons, these should be
> above that arrow button as a column. For the arrow that we have in 01, the
> more info should be shown as the modal that we have in 03.

Built as Concept 06, and taken three ways further as 07, 08 and 09. Everything
true of all four lives in `js/column.js` and `css/family-column.css`; a concept
file is only its own idea, which is what makes any one of them extractable
alone.

## The owner's second ruling, 14 September

> In 01 we have an up arrow after seats left. Clicking it shows some content.
> 06 should have the same arrow on the right side of seats left, but clicking
> that I want the 03 dialog.

So in **Concept 06 the chevron after the seats opens the panel, and the arrow
goes back to opening the listing.** Every control on the card now does exactly
one thing: chevron for what it costs and who runs it, arrow to leave, heart to
keep it, share to send the clip.

It is the better split and it undoes a cost the first version paid. Putting
disclosure on the arrow made a right-pointing glyph mean "stay here", and it
spent the feed's one-tap route out. It also fixed an alignment that was quietly
wrong: as plain type the availability line is about 20px tall and bottom aligned
against a 44px disc, so the words sat twelve pixels below the arrow's centre. As
a 44px control the two centres agree exactly.

**Concepts 07, 08 and 09 still put disclosure on the arrow.** They were built on
06's first shape and have not been brought across; 07 in particular is built
around the arrow opening a panel that then leads to a second view. Say the word
and they move in one pass.

## The two decisions the brief forced, and how they were answered

**The panel is opened by one control and the listing stays reachable.** In 06
that is the chevron, and the listing is reachable four ways: the arrow, the
reel's title, a right-to-left swipe, and the panel's own title, which is a link
in every concept in this family. In 07, 08 and 09 the arrow still discloses, so
the listing is reachable three ways rather than four.

**The panel covers the foot, so the foot steps aside.** The panel is bottom
anchored and up to 54% tall, so it necessarily covers the caption and the rail.
Leaving them there left three controls a keyboard could still reach and a screen
reader still announced behind a panel nobody could see through. They go
`visibility: hidden`, which takes them out of the tab order as well as out of
sight, and the panel grew a title of its own so it names what it is describing.

**"Like" is a private save.** It is a heart, because that is the glyph a
traveller reads as "keep this". Nothing it records is published, aggregated,
counted in public or shown to an operator, and no number appears beside it. The
API publishes no rating, no review count and no follower count on purpose, and a
heart with a count under it would reverse that decision by accident. In
production it is IndexedDB beside the booking tokens, which is where the app
already keeps trips on the device; `localStorage` is banned outright by an
eslint rule. **If a public like is wanted, that is an API change and a reversal
of a deliberate product decision, not a design tweak.**

---

## Concept 06: Column

**The problem it solves.** Concept 01 fixed the feed's information and left the
traveller one page load away from the price and the operator. The arrow was
spending a whole screen transition on a question a panel can answer in place.

**Hypothesis.** Concept 01's restraint, a right-hand rail of icon-only controls
with the arrow at its foot, and that arrow opening Concept 03's panel rather
than leaving the feed.

**Information hierarchy.** On the reel: activity and place, the title, one
availability line. In the panel: the name, the price and the server's unit
phrase, the next departure with its seats, how long, how it books, the operator
and one line of evidence. On the listing: everything else.

**Interaction model.** Tap the availability line, or its chevron, for the panel.
Tap the picture, drag the panel down, press Escape, or scroll on to dismiss. The
arrow opens the listing, as do the title and a right-to-left swipe. Save and
share are icons in the rail. The whole line is the control rather than the
chevron alone, because a 16px glyph is a 16px target and the line is what a
thumb is aiming at anyway.

**Strengths.** It is the plain version of the family and reads that way: one Z
across the screen, mark to sound to name to rail. The caption and the rail are
bottom aligned, and now genuinely so: the availability control and the arrow are
both 44px and share a centre. Price is knowable without leaving the feed, which
is the single biggest gain over Concept 01, and it costs the feed nothing,
because the arrow still leaves in one tap. The rail is three controls rather
than the borrowed stack of three identical discs: two translucent, one solid,
and the solid one is the only one that leaves.

**Weaknesses.** The panel covers the foot while it is open, so the chevron that
opened it is hidden the whole time it is expanded. That is geometry rather than
choice, and it means the panel's handle is the only visible way to close it,
with Escape and a tap on the picture behind it. Sound is at the top of the
screen, outside comfortable one-handed reach on a large phone.

**Trade-off.** Almost none, now. The panel is additive: nothing that worked
before costs more than it did.

**Best use case.** The production direction if the family is the direction.

---

## Concept 07: Column Deep (advanced)

**The problem it solves.** The panel answers "what is this and who runs it". A
traveller who likes the answer has one question left, and it costs a page load,
a date picker and a scroll.

**Hypothesis.** Answer "can I go on a day I am here" in the feed, with a second
view that fetches the departures once, on an explicit act of interest.

**The model: one action per view.** FACTS is built entirely from data the feed
already holds, so it is instant every time, offline included, and its action
reads "Choose a day". DATES replaces it: the facts step aside, the price stays
as the anchor, a rail of departures arrives, and the action becomes "Full
listing". A listing with nothing in the next ninety days never enters DATES at
all; its action says "Have a look" and goes to the listing, because sending
somebody into an empty date picker is the tap that loses them.

**Why the dates are fetched rather than carried.** `GET /reels` gives one date
per listing and one seat sentence for it, never a set. Putting a set on the card
would mean either a much larger feed payload on a 0.5 Mbps island link, measured
against LCP, or an invented list, which is a fabricated claim. So this is the
only thing in the family that touches the network, it does so once per listing,
and only after a traveller has opened a panel and then asked for more. **An
explicit act of interest is the cheapest possible trigger for an expensive
request.**

**Which means it ships all three states, and does.** Loading as a skeleton rail
rather than a spinner. Failed, with an alert and a retry. And an empty answer
that is a **disagreement rather than an absence**: the card's date is computed
when the feed page is built and this is fetched when a traveller asks, one
sold-out boat later, so the copy says what happened rather than claiming the
season is wrong. The laboratory's panel forces all three.

**Strengths.** It closes the loop from watching to a chosen day without leaving
the feed. The request discipline is the strongest thing in the set: nothing is
prefetched, nothing is invented, and a listing that has answered once is never
asked again. Two views rather than one growing panel is both better design and
the reason it fits its ceiling.

**Weaknesses.** The most machinery in the family. A traveller in DATES is not
really watching a reel any more, they are booking, and that is worth naming even
though the clip keeps running. It is also the only concept whose behaviour
depends on a second endpoint, so it is the only one that can be slow.

**Trade-off.** The most implementation risk in the family for the most product.
Nothing about it needs a backend change beyond an endpoint that already exists.

**Best use case.** The direction if in-feed booking intent is worth pursuing
before the listing page is reworked.

---

## Concept 08: Column Aware (advanced)

**The problem it solves.** The first five studies concluded that Concept 04 is a
technique rather than a direction, and that its engine could sit under any
layout. This is that claim, built, so it can be judged rather than believed.

**Hypothesis.** Put the frame-reading engine under the owner's screen: the words
move to where the picture is already dark, the rail never moves, and the veil
that is saved buys one more fact on the card.

**Measured, across the twelve frames.** Seven regions at the foot, three at the
head, one down the left. **Six of twelve resolve to a veil of zero**, so half
the feed draws no darkening at all. The bright surf frame pays 0.48 and the noon
shore frame 0.64, in one region rather than across the bottom of the picture.

**Interaction model.** Identical to Concept 06. The one discipline that makes it
usable rather than clever is that **information moves and controls never do**.
The rail is at the foot right on every frame, in every region, always, and its
own hairline is solved separately at the 3:1 non-text floor rather than the 7:1
the type gets.

**Strengths.** Because the overlay is cheaper it can carry more: this is the
only concept in the family with price on the persistent line, and on half the
frames it still darkens less of the picture than Concept 06 does. That is the
argument in one sentence. The failure mode is Concept 06 exactly, which is the
property that makes it shippable.

**Weaknesses.** A caption that changes position between reels is unfamiliar, and
whether it reads as intelligence or as instability is the one question this
laboratory cannot answer. The poster is a still and the clip moves, so a frame
that is quiet at load can brighten two seconds later. And it needs
`Access-Control-Allow-Origin` from Cloudflare Images to work at all.

**Trade-off.** A second release on top of the family, gated on one response
header, that silently does nothing if the header never arrives.

**Best use case.** Layer it onto whichever concept wins, once the poster host
sends CORS.

---

## Concept 09: Column Compare (advanced, and the bold one)

**The problem it solves.** Every panel in every other concept belongs to a card,
so it dies when the card scrolls away. To compare two experiences a traveller
has to open a panel, read it, close it, swipe, open the next, and hold the first
in their head.

**Hypothesis.** Open it once and it stays open. Mount the panel at the frame
rather than on a card, and swiping changes the reel above it while the facts
cross-fade inside it.

**Interaction model.** The arrow opens it; from then on a swipe is both "next
reel" and "next candidate". The panel never re-mounts, it cross-fades its
contents on the 120ms interaction budget, so the eye tracks one object changing
rather than two objects trading places. Three dismissals, unchanged.

**Measured.** The panel persists across a swipe and its contents change, at 52%
of the frame on a standard phone. The saved total sits on the panel's own title
row, where it counts what this device is holding and nothing else.

**Strengths.** The only concept here that changes what a swipe means, and it
changes it into something a traveller with three days actually needs: the feed
becomes a comparison at a fixed level of detail, same fields, same order, same
place on the glass, one flick apart. It is also where the heart stops being a
bookmark for later and becomes the mark you make while comparing.

**Weaknesses.** A panel that outlives its card can show the previous reel's
facts for a frame, which is a whole class of bug per-card panels cannot have. It
is driven off the strip's own active-card observer for that reason, so there is
exactly one source of truth, but the risk is structural rather than removed. It
also made the feed unreachable by keyboard, because hiding the card's controls
left a scroll container with nothing focusable in it: caught by axe, fixed on the
scroller itself.

**Trade-off.** The most novel interaction in the set, on the most structurally
delicate implementation.

**Best use case.** The direction if travellers are choosing between options
rather than discovering them one at a time. It is also the one concept whose
value depends on a behaviour nobody has measured yet.

---

# The five studies it came from

## Concept 01: Quiet Frame

**The problem it solves.** The 13 September cutback answered a spatial complaint
by deleting information, and it deleted the wrong information: the card kept the
name and lost what the thing IS and whether it can be done. A traveller is left
with a beautiful coin flip.

**Hypothesis.** The cutback was right about restraint and wrong about which two
words it kept. Keep the bareness, spend it on what decides the next swipe, and
invert clear mode so a press and hold ADDS rather than hides.

**Information hierarchy.** Persistent: activity and place, title, one
availability line. On the hold or the tap: price and unit, duration, booking
mode, operator and the evidence line. On the listing: everything else.

**Interaction model.** Hold anywhere to reveal, transient. Tap the availability
line to reveal, sticky. Escape closes. Tap the picture plays and pauses. Swipe
or arrow opens.

**Strengths.** The smallest change from what ships today: two lines of type
added, two discs removed, one gesture. It removes the borrowed disc rail. It
moves sound into the top scrim, which was already darkening a fifth of the frame
to carry one 28px mark, so the foot is freed without a new layer. It fixes the
single worst defect in the current build.

**Weaknesses.** The hold is undiscoverable on its own; it works only because the
availability line is a visible, scented control doing the same job. Price is one
tap away, which is correct for understanding and worse for triage than Concept
03's peek. The reveal is transient, so it teaches nothing about itself.

**Trade-off.** Lowest risk, lowest ceiling. It makes today's screen right rather
than making it new.

**Best use case.** The production direction if the answer has to ship before 1
October with no new mechanism in it.

---

## Concept 02: Field Notes

**The problem it solves.** The most complete answer to "the reel is covered" is
that nothing is drawn on it at all.

**Hypothesis.** A travel feed should read as a published guide rather than a
social stream. Letterbox the clip into a 32px well on the forest stage and set
every word beside it.

**Information hierarchy.** Everything is persistent, because nothing competes
with the picture: folio, activity and place, title, a three-fact rule (when,
takes, from), operator and evidence, and a text call to action. There is no
progressive disclosure in this concept and that is the design.

**Interaction model.** Ordinary. Scroll, tap the plate to pause, tap anything to
open. No new gesture at all.

**Strengths.** The only concept that can promise the picture is 100% visible on
every frame in every lighting condition. It carries the most information of the
five and feels the least crowded. It is the most distinctive: nothing else in
the category looks like this, and it reads as the app it belongs to, because
v2.7 already made the whole product a dark stage with content rising out of it.
The finite folio ("06 / 12") is a feature no competitor can copy, because none
of them has a catalogue small enough to count. It is also the only concept with
no new interaction to teach.

**Weaknesses.** The picture is roughly 22% smaller, and on an iPhone SE with a
long title the plate compresses to about half the screen. It is a page rather
than a feed, and a page does not invite a fast scroll. The title clamps at two
lines rather than three to protect the plate.

**Trade-off.** Trades immersion for legibility and completeness, deliberately
and completely. It is the concept most likely to be loved in a review and least
likely to survive a traveller flicking through twenty reels.

**Best use case.** Not the feed. It is the right design for a surface where the
traveller has already chosen to look closely: the search grid's expanded view, a
business's own reels, or a shared link opened cold from a message, where there
is no context at all and the page has to explain itself.

---

## Concept 03: Two Detents (advanced)

**The problem it solves.** Price is the second question and the one that ends
the most sessions when it goes unanswered. A feed cannot ask whether somebody is
interested, but it can notice when they stop.

**Hypothesis.** Dwell is the only honest interest signal this screen has. A
non-modal sheet on two detents gives the traveller what stopping earned, without
the video stopping or being covered.

**Information hierarchy.** Rest: activity and place, title, one way forward.
Peek, after 1.2 seconds of dwell: price, the server's unit phrase, the date.
Open: the departure with its seats, duration, booking mode, operator and
evidence, and the call to action. On the listing: everything else.

**Interaction model.** Dwell raises the peek. Tap or drag the peek up to open.
Drag down, tap the picture, press Escape, or scroll on to dismiss. The sheet
owns the vertical axis inside its own box and nowhere else, so a drag that
begins on the picture still scrolls the feed. The arrow disc fades as the
labelled control takes the same band: the call to action transforms rather than
multiplying, so there is exactly one way forward at every moment.

**Measured.** The open sheet covers 40% of the frame on a Pro Max, 45% on a
standard iPhone, 47% on a narrow Android and 49% on an SE, against a stated
ceiling of 54%. Nothing clips and nothing runs under the bar at any size. The SE
needed a container query and a compacted layout to hold that promise, and the
16px that made it fit came from noticing that a sheet's own foot does not need
the 92px of breath a screen leaves for the bar.

**Strengths.** The best answer in the set to the actual complaint: nothing is
added until a traveller has shown interest, and what is added covers under half
the frame with the clip still running above it. Nothing appears on a clock. The
peek is a properly scented stub, showing the currency, the number and the unit
phrase, so it predicts the sheet rather than hiding it. The CTA transformation is
the only motion in the set that is purely state, not decoration.

**Weaknesses.** It is the most machinery: three states, a dwell timer, a drag
with two commit thresholds, and an axis arbitration that has to be right or the
feed fights the thumb. 1.2 seconds is a number somebody chose; it wants a real
measurement. A fast scroller never sees the peek at all, which is correct and is
also a large share of impressions. And the peek is a pill on a picture, which is
one container more than Concept 01 draws.

**Trade-off.** The most implementation risk in the set, for the most product per
pixel. Nothing here needs a backend change.

**Best use case.** The feed, as the production direction.

---

## Concept 04: Reading the Frame

**The problem it solves.** A fixed caption forces every frame to pay the scrim
that the worst frame needs. The current build darkens the bottom two thirds of a
night dive exactly as hard as it darkens white surf.

**Hypothesis.** Read the poster, write where the picture is already quiet, and
darken only that.

**How it works.** The poster is drawn once to a 9 by 16 canvas. Four zones are
scored on mean luminance plus a flatness penalty minus a position prior that
prefers the foot. The winner takes the caption, and the veil under it is solved
for that zone's brightest cell, composited per channel in sRGB the way the
browser will actually composite it, to a 7:1 floor.

**Measured, across the twelve frames.** Seven chose the foot, three the head,
one the left band. Six resolved to a veil of **zero**: a dark frame pays nothing
at all. The bright surf frame pays 0.48 and the noon shore frame 0.64, in one
region rather than across the bottom of the picture.

**Interaction model.** Unchanged from Concept 01's, deliberately. The one
discipline that makes this usable rather than clever is that **information moves
and controls never do**: the arrow is bottom right and sound is top right on
every frame, in every zone, always.

**Strengths.** Genuinely novel, and it earns more than it costs: because the
overlay is cheaper, this is the only concept that carries price on the
persistent line without the frame feeling covered. The failure mode is the
current design: a cross-origin poster taints the canvas, the read throws, and it
falls back to the fixed foot layout with the full system scrim. Six of twelve
frames draw no darkening whatsoever, which no fixed layout can do.

**Weaknesses.** The caption moving between reels is unfamiliar and could read as
instability on a fast scroll; the laboratory cannot answer that, only a person
can. The poster is a still and the clip moves, so a frame that is quiet at load
can brighten two seconds later. It needs `Access-Control-Allow-Origin` from
Cloudflare Images to work in production at all. And the zone priors are
judgement, not measurement.

**Trade-off.** It is not really a fifth layout. **It is a technique that can sit
underneath any of the other four**, and that is how it should be read.

**Best use case.** Fold into whichever concept wins, as a second release. Not a
standalone direction.

---

## Concept 05: The Shortlist (advanced)

**The problem it solves.** A traveller has three to seven days and needs to hold
four options, not book the first one. Today the only verbs are watch and book,
so four good reels in a row produce nothing.

**Hypothesis.** The feed's job is planning, not watching. The missing verb is
"hold".

**Information hierarchy.** Persistent, and reordered on purpose: the date and
its seats lead, then the title, then activity, place and duration. Price is not
on the card at all. On the listing: everything else.

**Interaction model.** Double tap the picture, or use the Hold control in the
caption. Held reels dock into a tray above the bar; tapping a thumbnail returns
to that reel. The caption moves up to make room the moment the tray appears.

**Why the gesture is free.** `.feed-card` already sets
`touch-action: pan-y pinch-zoom`, and `globals.css` records the price and the
reasoning: that setting costs double-tap zoom, and "double-tapping a full-bleed
clip was never a gesture this feed offered anything for". The gesture is bought
and currently does nothing.

**What it would take to ship.** Nothing from the backend. The app already keeps
trips on the device in IndexedDB via `@/lib/booking/token-store`, and
`localStorage` is banned outright by an eslint rule. A shortlist is that
mechanism with a different object store, no account and no request.

**Strengths.** The only concept that changes what the screen is for, and the
only one that makes the band above the bar do work instead of stand empty.
Leading with availability is the sharpest expression of the research: it puts
the traveller's real question first. The gesture is already paid for.

**Weaknesses.** The date leading means the title is not the first thing read,
which is a real cost on a discovery surface and the reason this is the bold one
rather than the safe one. A double tap is undiscoverable without the visible
control beside it. The tray is a fourth persistent element at the foot of a
screen whose complaint was that too much was drawn on it, and it is only paid
for if travellers actually hold things. Nothing downstream consumes the
shortlist yet, so today it is a list that leads nowhere.

**Trade-off.** Adds a feature to fix a design problem, which is the most
expensive kind of fix and the only one here that changes the roadmap.

**Best use case.** The direction if the feed is understood as the front of a
planning tool rather than a discovery surface. It should not ship without the
screen that consumes the shortlist.

---

## The family, evaluated

Scored 1 to 5. The figures are measured by `audit.mjs` in WebKit across four
phone sizes.

| Criterion                             | 06 Column | 07 Deep | 08 Aware | 09 Compare |
| ------------------------------------- | :-------: | :-----: | :------: | :--------: |
| Is the experience the hero            |     4     |    4    |  **5**   |     4      |
| Right amount of information           |     4     |  **5**  |  **5**   |   **5**    |
| Video unobstructed (panel covers 52%) |     4     |    4    |  **5**   |     4      |
| Is the next action obvious            |     4     |  **5**  |    4     |     4      |
| Bottom navigation feels intentional   |     4     |    4    |    4     |     4      |
| Mobile ergonomics                     |   **5**   |  **5**  |  **5**   |   **5**    |
| Discoverability of interactions       |   **5**   |    4    |    4     |     3      |
| Premium feel                          |     4     |  **5**  |  **5**   |   **5**    |
| Accessibility (axe clean, all four)   |     5     |    5    |    5     |     5      |
| Could this ship                       |   **5**   |    4    |    2     |     3      |
| Scales with real data                 |   **5**   |  **5**  |    4     |     4      |
| Feels like our product                |     4     |  **5**  |  **5**   |     4      |
| Improves discovery                    |     4     |  **5**  |    4     |   **5**    |
| **Total**                             |  **57**   | **60**  |  **57**  |   **55**   |

Notes on the tight ones:

- **08 scores 2 on "could this ship"** only because of the CORS dependency on
  Cloudflare Images. It degrades to Concept 06 exactly, so the risk is a feature
  that quietly does nothing, not a broken screen.
- **09 scores 3 on discoverability** because a panel that persists across swipes
  has no precedent a traveller arrives with, and 3 on shipping because its value
  depends on comparison behaviour nobody has measured.
- **06 now scores 5 on "is the next action obvious"**, up from 4. The mismatch
  that cost it a point (a right-pointing arrow that opened a panel) is gone with
  the 14 September split.
- Accessibility is flat because all four are clean under axe at WCAG 2.2 AA with
  colour contrast actually running. It is a gate here, not a score.

## The picks

### Best overall: **Concept 06, Column**

It is the direction, and the other three are phases on top of it. It is the
screen as specified, twice, it invents no data, it needs nothing from the
backend, it holds its panel ceiling on every phone the laboratory tests, and it
closes the gap the first five studies exposed: the price and the operator are
knowable without leaving the feed, and after the 14 September split that costs
the feed nothing at all. Ship this first; 07, 08 and 09 all begin from it
unchanged.

### Best balance: **Concept 07, Column Deep**

The most product per unit of risk, and additive rather than alternative. Its
request discipline is the strongest thing in either set: nothing prefetched,
nothing invented, one request per listing, triggered only by a traveller asking
twice. It is the one concept that carries a traveller from watching to a chosen
day without a page load, and all three of its states are built rather than
assumed.

The open question is not design, it is the contract: which endpoint answers
"departures for this listing", and what it costs on an island link.

### Best experimental: **Concept 09, Column Compare**

The only concept in either set that changes what a swipe means, and it changes
it into something a traveller with three days needs. It is also the most
structurally delicate: a panel that outlives its card is a class of bug the
others cannot have, and it made the feed unreachable by keyboard until axe
caught it. Worth building when there is evidence travellers compare rather than
browse.

### And one that is still not a concept

**08 remains a technique.** It is Concept 06 with the frame-reading engine under
it, and on half the frames it draws no darkening at all. Layer it on once the
poster host sends `Access-Control-Allow-Origin`.

## The route this suggests

1. **Ship Concept 06.** The whole screen, the rail, the panel. No new
   dependencies.
2. **Then 07's second view**, once the departures endpoint and its cost are
   agreed. It is additive: 06's panel becomes 07's first view unchanged.
3. **Then 08's placement engine**, gated on one response header, silently inert
   without it.
4. **Hold 09** until there is evidence travellers compare. The implementation is
   real and the behaviour it serves is a guess.

---

## The first five studies, evaluated

Scored 1 to 5. These are judgements, but the ones marked with a figure are
measured by `audit.mjs`.

| Criterion                           | 01 Quiet | 02 Notes | 03 Detents | 04 Frame | 05 Shortlist |
| ----------------------------------- | :------: | :------: | :--------: | :------: | :----------: |
| Is the experience the hero          |    5     |    3     |     4      |  **5**   |      4       |
| Right amount of information         |    3     |    4     |   **5**    |    4     |      4       |
| Video unobstructed                  |    4     |  **5**   |     4      |  **5**   |      3       |
| Is the next action obvious          |    3     |    4     |   **5**    |    3     |      4       |
| Bottom navigation feels intentional |    3     |    4     |     4      |    3     |    **5**     |
| Mobile ergonomics                   |    4     |    4     |   **5**    |    4     |    **5**     |
| Discoverability of interactions     |    4     |  **5**   |     4      |  **5**   |      3       |
| Premium feel                        |    4     |  **5**   |   **5**    |    4     |      4       |
| Accessibility (axe clean, all five) |    5     |    5     |     5      |    5     |      5       |
| Could this ship                     |  **5**   |    4     |     4      |    2     |      3       |
| Scales with real data               |    4     |    3     |   **5**    |    4     |      4       |
| Feels like our product              |    3     |  **5**   |     4      |    4     |      4       |
| Improves discovery                  |    3     |    3     |   **5**    |    4     |    **5**     |
| **Total**                           |  **50**  |  **54**  |   **59**   |  **52**  |    **53**    |

Notes on the tight ones:

- **02 scores 3 on "is the experience the hero"** despite drawing nothing on the
  picture, because a 22% smaller picture is a smaller hero. The two readings of
  that criterion pull against each other and that tension is the concept.
- **04 scores 2 on "could this ship"** only because of the CORS dependency on
  Cloudflare Images. The code degrades to today's design, so the risk is a
  feature that quietly does nothing, not a broken screen.
- **05 scores 3 on video unobstructed** because the tray is a fourth persistent
  element, and 3 on discoverability because the double tap needs its visible
  twin to be found at all.
- Accessibility is flat because all five are clean under axe on
  wcag2a/aa, wcag21a/aa and wcag22aa, with colour contrast actually running. It
  is a floor this project treats as a gate rather than a score.

---

## The studies, ranked

These were the picks before the owner specified the family. They are kept
because the reasoning behind them is what the family was built out of, and
because Concept 02 is still the right answer for a different screen.

### Strongest study: **Concept 03, Two Detents**

It is the only concept that gives the information back without giving the pixels
back, which is the exact shape of the problem. It respects every settled
decision, invents no data, needs no backend change, and its central claim is
measured rather than asserted: the sheet covers 40% to 49% of the frame across
four phones against a 54% ceiling, with the clip running above it the whole
time. The peek is a properly scented disclosure control rather than a hidden
feature, and the call to action transforms rather than multiplying, which keeps
the one-way-forward rule the 13 September change established.

The risk is honest and stated: three states and an axis arbitration that has to
be right. The 1.2 second dwell is the one number in it that is a guess and it
should be measured against real sessions before it is fixed.

### Boldest study: **Concept 05, The Shortlist**

It is the only one that asks what the screen is FOR rather than how it should
look, and its answer is the one the research points at: a traveller with three
days is building a plan, not watching television. It spends a gesture the
codebase has already paid for, it needs nothing from the API, and it is the only
concept that turns the permanent band above the bar from a clearance into
composition.

It is experimental rather than recommended because it is incomplete by
construction: a shortlist with no screen behind it is a list that leads nowhere,
and leading with the date instead of the title is a real cost that only a
traveller can price.

### Best balance: **Concept 01, Quiet Frame**

Two lines of type added, two discs removed, one gesture, no new mechanism. It
fixes the single worst defect in the shipping build (a feed that knowingly sends
travellers to listings with no dates) at close to zero implementation risk, and
it removes the one piece of borrowed layout in the product. If the answer has to
be small, this is the small answer, and it is a strictly better screen than what
is live today.

### And one that is not a concept

**Concept 04 is a technique, not a direction.** Its placement engine is
orthogonal to everything above and can sit underneath 01, 03 or 05 unchanged.
The recommendation is to treat it as a second release on whichever wins, gated
on Cloudflare Images sending `Access-Control-Allow-Origin`, since it falls back
to today's design when it cannot read a frame.

---

## What survived into the family

- **Concept 01's screen** is the family's screen, with two lines of type doing
  the work a rail of discs was doing.
- **Concept 03's panel** is the family's panel, opened by the arrow instead of
  by dwell. Dwell is the one idea from 03 that did not survive: the owner's
  model is that the traveller asks, and a panel that arrives because somebody
  paused is a panel that arrives uninvited.
- **Concept 04's engine** became Concept 08, and is still a technique rather
  than a direction.
- **Concept 05's verb** became the family's heart, with the same rule: private,
  on the device, never a count.
- **Concept 02 did not, and should not.** Its folio, its fact rule and its
  evidence line are the strongest typography in either set, and they belong
  where a traveller has already slowed down: a shared reel opened cold from a
  message, or a business's own reels. It is the wrong shape for a feed and the
  right shape for a page.

---

## What the laboratory proved, and what it cannot

**Proved.** No console or page errors on any concept. No overlap with the bar,
no clipping, no horizontal overflow, no tap target under 24px and no unnamed
control, across nine concepts and four phone sizes including the open states.
Every panel in the family opens instead of navigating, names the experience it
describes, holds its 54% ceiling, keeps a call to action on screen, and leaves
nothing reachable behind it. Concept 07's loading, failed, empty and cached
paths all behave. Concept 09's panel survives a swipe and updates.
Every title clamps. axe is clean on all nine at WCAG 2.2 AA with colour contrast
actually running, which required serving the files rather than opening them.
Concept 04's engine discriminates across three zones and resolves to zero veil
on half the frames. Concept 03 holds its ceiling at every size. Concept 05's
double tap holds and restores playback. The whole thing runs from `file://` with
the real Fraunces and Satoshi faces, and reduced motion neutralises the drift
through the global rule rather than any per-concept branch.

**Cannot.** Whether a caption that moves between reels reads as intelligence or
as instability. Whether travellers compare or browse, which is the whole of
Concept 09's case. Whether one extra tap to the listing is a cost anybody
notices. Whether 1.2 seconds is the right dwell. Whether travellers hold
anything. Whether leading with a date instead of a name is worth it. Whether the
letterbox reads as craft or as a smaller video. All five are questions for a
person with a phone, which is what the laboratory is for.

**And one thing it is standing in for.** There is no rights-cleared footage yet
(yuvoy-app#11), so these are synthetic frames built to have the luminance
structure real footage has. They are honest about brightness and they are not
footage. Every judgement here should be re-made against the first real clips.
