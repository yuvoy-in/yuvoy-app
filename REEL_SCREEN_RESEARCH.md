# The reel screen: research, thesis and design law

A study of `/` (T2, the reels feed) in `yuvoy-app`, written before any of the
five concepts in `docs/reel-lab/` were drawn. Everything asserted about the
current product is read off the repository at `bce4b6f` or off the API contract
pinned in `contracts/`; everything asserted about other products is cited.

---

## 1. Current product assessment

### 1.1 What the screen is, mechanically

`src/app/page.tsx` server-renders the first page of `GET /reels` (twelve items,
`REELS_PAGE_SIZE`) and hands it to `Feed`, which renders `ReelStrip`: a CSS
scroll-snap column of full-bleed 9:16 cards. One `IntersectionObserver` decides
the active card, a second fetches the next page two screens early. Only the
active card and the one after it may hold a `<video>` (`PRELOAD_AHEAD = 1`).
Playback is poster-first: `posterUrl` always resolves, `hlsUrl` is progressive
enhancement, and a failed clip degrades silently to its poster.

Each card today draws, and nothing else:

| Element                | Where                                      | Note                                   |
| ---------------------- | ------------------------------------------ | -------------------------------------- |
| The clip or its poster | full bleed                                 | `bg-abyss` ground                      |
| The Yuvoy mark         | top left, inert                            | no tagline, `feed-scrim-top` behind it |
| The title              | bottom left, `line-clamp-3`, 2rem Fraunces | a link to `/e/{slug}`                  |
| Arrow disc             | bottom right, solid cream                  | same href                              |
| Sound disc             | below the arrow, translucent               | only when a clip is playable           |
| Share disc             | below sound, translucent                   | shares `/r/{media.id}`                 |
| The tab bar            | floating forest pill, always visible       | 56px plus a 12px foot                  |

Four surfaces share `ReelStrip`: the feed, a shared reel (`/r/[id]`), the search
grid's reel view (`/search/r/[id]`), and a business's own reels
(`/o/[slug]/r/[id]`). Anything designed here has to survive all four.

### 1.2 What works, and should not be touched

- **Poster-first architecture.** On a 0.5 to 3 Mbps island link the poster is
  what most travellers see. The card is complete without video. This is right
  and every concept keeps it.
- **The preload budget.** Active card plus one. Anything that mounts more video
  on a mid-range Android is a regression, not a design.
- **Scroll snapping is CSS.** No scroll handler fighting momentum.
- **Three routes to one href.** Arrow, title and a right-to-left swipe are built
  from a single `href` string so they cannot drift. Keep this rule.
- **The tail tells the truth in three ways.** `more`, `complete` and
  `server_stopped` are distinct, told by the server, never inferred from a short
  page. Most infinite feeds get this wrong.
- **The scrim is sized against the brightest pixel a clip can show**, not the
  average, and it is a twelve stop sigmoid rather than a two stop ramp so there
  is no Mach band across moving footage. This matches the strongest external
  guidance available: a two stop gradient creates a sharp perceptual edge and
  four or more eased stops match how light actually falls
  ([Instant Gradient](https://instantgradient.com/blog/accessible_gradient_guide),
  [Smashing Magazine](https://www.smashingmagazine.com/2023/08/designing-accessible-text-over-images-part1/)).
- **`aria-setsize` is honest.** `-1` until the server says `complete`, because
  claiming "1 of 12" about a feed with forty in it and then renumbering is a lie
  to a screen reader user.

### 1.3 What does not work

**The feed cannot be triaged.** A traveller sees a clip, a name and an arrow.
Nothing on the card answers the three questions that decide a tap on a travel
booking: _what would I be doing_, _can I do it while I am here_, _roughly what
does it cost_. Every reel is therefore a coin flip that costs a page load to
resolve. On a 3 to 7 day island trip that is the whole cost of the product.

**The one field built to prevent the losing tap is now rendered nowhere.**
`ExperienceSummary.nextAvailable` is documented in the contract as: _"Absent
means nothing is bookable in the next 90 days, not 'we did not check'. A card
that says nothing about availability makes the traveller tap through to find
out, and the tap that ends in 'no dates' is the one that loses them."_
`seatsOnNextDisplay` was added by the API team in api#92 specifically for this
card. The 13 September cutback deleted the date line, and the closing comment on
yuvoy-app#36 records the consequence in as many words: _"Nothing renders
`seatsOnNextDisplay` any more."_ The product currently ships a feed that
knowingly sends travellers to listings with no dates.

**The overlay is a rail of discs, and a rail of discs is the generic pattern.**
Three stacked circles at the bottom right is the single most recognisable
short-video layout in the world. It is also the one place our product looks
exactly like everyone else's. The arrow is differentiated from the other two by
fill, which is good, but the arrangement itself is borrowed.

**The title has no supporting cast, so it is carrying meaning it cannot carry.**
"Try-dive at Nemo Reef" at 32px over moving water, with `line-clamp-3`, is
beautiful and ambiguous. Operator-written titles are unbounded and will not
always be this good. A three line clamped title over surf is the worst case the
current design has no answer for.

**There is no sense of place in the feed.** `location` exists on every summary
("Havelock", "Neil Island") and is drawn nowhere. The feed spans islands, and a
traveller on Neil cannot tell that the reel they are watching departs from
Havelock, which is a ferry away.

**There is no position signal.** No progress bar, no index, nothing that says
how far through a clip or how far through the feed a traveller is. On an
infinite feed that is defensible. On this one it is not: see 1.5.

**Nothing survives the scroll.** A traveller who sees four good reels in a row
has no way to hold any of them. There is no shortlist, no save, no compare.
Everything is either forgotten or booked, and booking on the first tap is not
how anybody plans three days.

### 1.4 Visual problems, specifically

- **Bottom-heavy composition with an unusable foot.** Title, three discs, and
  then 92px of mandatory `tabbar-clearance`, and then a 56px floating bar. The
  entire bottom third is chrome or clearance, and the top two thirds carry a
  16px mark and nothing else. The canvas is unbalanced in a way no amount of
  restraint fixes, because the imbalance is structural.
- **The top scrim pays for one small mark.** `feed-scrim-top` runs to 20% of the
  frame at up to 80% abyss to carry a 28px logo. That is a lot of darkened
  picture for a brand impression.
- **Discs compete with each other.** Three 44px circles at the same size in a
  vertical stack read as one control group of equal weight. Fill alone is a weak
  differentiator at 44px over moving footage.
- **No visual relationship between the reel and the bar.** The bar floats over
  the picture with a `cream/12` ring. It does not belong to the reel, and the
  reel does not acknowledge it. It reads as an app chrome pasted over a video
  player, which is precisely the thing Phase 4 of the brief says to avoid.

### 1.5 The two structural facts that make this product different

These are the findings that should drive the design, and neither is visible from
the screen.

**(a) This is a catalogue with the fidelity of a stream, not an infinite feed.**
Three published reels at the time of the yuvoy-app#18 fix. Six fixtures. Tens,
not thousands. `feedTail` can legitimately return `complete`, and the copy for
it already exists: _"That is everything on sale right now."_ A traveller can
plausibly see the entire inventory in one sitting. Everything TikTok's interface
optimises for, an inexhaustible supply raced through at speed, is false here.
Consequences: exhaustion is a designed state rather than a theoretical one;
repeat visits show the same reels, so "I have seen this" has value; and the feed
can afford to be slower and denser than a social feed without feeling heavy.

**(b) Yuvoy publishes no ratings, no review counts and no follower counts, on
purpose.** The contract is explicit, twice: _"There are no followers and no
rating. Reviews do not exist until real completed bookings produce them, and a
number nobody earned is a fabricated claim."_ Reviews are collected from day one
and published to nobody. What the API does publish is `operator.verified`
("true only when every mandatory credential is on file, verified and unexpired.
It is a statement about evidence we hold, not a badge") and `credentialsSummary`
("human readable statements of what was checked, each backed by a record").

Every competitor's feed leans on 4.9 stars and 2.3k reviews. We cannot, and the
correct response is not to feel the absence. **Our trust currency is verified
evidence rather than crowd count.** "Their dive licences are current" is a
stronger claim than a star average, it is one nobody else in this category can
make, and it is unexploited by the current design.

### 1.6 Repeated patterns from previous iterations

Read from the git history so no concept re-proposes a settled question.

| Iteration                        | What it did                                                                                                                                                                                                       | Why it changed                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `3767409` (scaffold)             | Overlay carried operator, Verified chip, title, activity label, next date, price, unit, instant-or-request chip and a full width "See dates" button. Wordmark centred at top with the "Experience more." tagline. | Nine things over a clip.                                                                                                                    |
| `bdf7d9a` (v2.8, 9 Sep)          | Chrome **retracted** on a move down a reel and returned on a move up. Masthead lost its Search disc. Scrims became eased ramps. Right-to-left swipe opens the listing.                                            | Owner ratified "direction, not position" the same day.                                                                                      |
| `700e70f` (13 Sep, yuvoy-app#36) | Overlay cut to title plus three discs. **Retract deleted outright**, along with `--feed-lift`, `.feed-stage`, the masthead fade and `.tabbar-slide`. Share now sends `/r/{media.id}`.                             | Owner on an iPhone: _"I'm unable to see reel fully, it is covered by lot of things."_ And: _"the tab bar must stay visible on every reel."_ |

**Three things are therefore settled and no concept may re-propose them:**

1. **The tab bar stays visible on every reel.** The retract was built, shipped
   and killed four days later by name. A concept that hides the nav on scroll is
   re-litigating a closed decision.
2. **The mark sits top left, small, without a tagline.**
3. **Right-to-left opens the listing.** Confirmed by the owner on 13 Sep.

**And one thing is misread as settled and is not.** The owner's complaint was
_spatial_ ("covered by lot of things"), not _informational_. They did not ask to
stop knowing the price. The 13 September change answered a spatial complaint by
deletion, which is the cheapest available fix and the one that costs the most
product. **The remaining opportunity is to give the information back without
giving the pixels back.** That is the entire brief for the five concepts.

---

## 2. Industry findings

Structured as **pattern, why it works, what we learn, how we reinterpret**.
Nothing here is copied.

### 2.1 Clear mode / clear display (TikTok, Instagram)

TikTok ships Clear Display on a long press; Instagram has been testing Clear
Mode with the same gesture, hiding descriptions and UI so the video is
unobstructed ([Social Media Today](https://www.socialmediatoday.com/news/instagram-tests-clear-mode-reels/714956/)).

_Why it works_: it concedes that the overlay is a cost, and gives the user the
control rather than the designer taking a position.

_What we learn_: the right answer to "the UI covers the video" is a **state**,
not a deletion. Both giants arrived at the same conclusion the owner did, and
solved it with a gesture instead of by removing information.

_How we reinterpret_: we invert it. Long press to _hide_ assumes a dense default.
Our default is already bare, so the gesture should **add**, not subtract. Press
and hold, or pull, to bring the facts in. The picture is what you get for free;
the information is what you ask for. (Concepts 01, 03, 05.)

### 2.2 Progressive disclosure and information scent

Progressive disclosure only works when the user can predict what is behind the
control; a well scented disclosure control communicates the topic _and the
granularity_ of what it will reveal
([UXPin](https://www.uxpin.com/studio/blog/what-is-progressive-disclosure/),
[IxDF](https://ixdf.org/literature/topics/progressive-disclosure)).

_What we learn_: a bare handle, a chevron or an unlabelled affordance is not
progressive disclosure, it is a hidden feature. Whatever we hide must leave a
**scented stub** on screen: the shape of the answer, not a hint that an answer
exists.

_How we reinterpret_: every concept that hides something shows a fragment of it.
A price sheet shows the currency mark and the unit. An availability panel shows
the weekday. The stub is the scent.

### 2.3 CTA layering in short video commerce

Most viewers exit before the final frame, so single end-of-video CTAs
underperform; layered CTAs that appear at multiple points in the watch session
capture intent where it actually peaks
([Influencers Time](https://www.influencers-time.com/creator-briefs-for-short-form-video-hook-and-cta-strategy/)).
The strongest social commerce content does not transition from story to sale, it
makes the sale read as the story's resolution
([Influencers Time](https://www.influencers-time.com/short-form-video-for-conversion-in-social-commerce/)).

_What we learn_: our single persistent arrow is the "one CTA" pattern, and it is
placed for reach rather than for intent. Intent in a travel feed peaks at a
specific, observable moment: **when a traveller stops scrolling.** Dwell is the
signal.

_How we reinterpret_: the CTA earns prominence rather than holding it. It is
present and reachable from frame one, and it resolves into a fuller, more
confident form once dwell says the traveller is interested. It never animates in
on a timer, because a control that appears on a clock is an advertisement.

### 2.4 Thumb zone on large phones

On devices over 6.5 inches the comfortable one-handed zone is the lower two
thirds; top corners are effectively unreachable, and width matters more than
height ([Parachute Design](https://parachutedesign.ca/blog/thumb-zone-ux/),
[Tim Graf](https://timgraf.com/ux-design/designing-for-the-thumb-zone-a-modern-guide-to-mobile-ux-that-respects-human-anatomy/)).

_What we learn_: our bottom band is not wasted, it is the **only** premium real
estate on the screen, and it is currently occupied by a mandatory 148px of
clearance plus bar. That is not a constraint to design around. It is the best
land in the product, and we are parking on it.

_How we reinterpret_: information the traveller acts on lives in the band
directly above the bar; information they only read may sit higher. Nothing
interactive goes above 60% of the frame height. (All five concepts.)

### 2.5 Bottom sheet detents

Material 3 and iOS both formalise peek, detents and settle: the collapsed peek
height should have enough height to indicate there is more
([Material 3](https://m3.material.io/components/bottom-sheets/guidelines),
[Mobbin](https://mobbin.com/glossary/bottom-sheet)).

_What we learn_: the sheet is the correct container for "more about this reel",
and its peek is where the scented stub lives.

_How we reinterpret, and where we refuse it_: a modal sheet with a scrim kills
the video, which is the one thing this screen must not do. Our sheets are
**non-modal, video-preserving and driven by the same vertical axis the feed
already owns**, which means the gesture has to be arbitrated rather than simply
added. Concept 03 does this deliberately and documents the arbitration.

### 2.6 Infinite scroll

Infinite scroll suits flat structures where content streams constantly and is
equally relevant
([NN/g](https://www.nngroup.com/articles/infinite-scrolling-tips/)).

_What we learn_: our structure is flat but our supply is **not** constant. We
match half the precondition. That is the strongest single argument that copying
a social feed wholesale is wrong for this product.

_How we reinterpret_: the feed acknowledges its own size. Concept 04 makes
finiteness legible; every concept keeps the truthful three way tail.

### 2.7 Text over moving imagery

A scrim is the most reliable technique, and contrast must be verified at
multiple points because it varies across the frame
([Smashing Magazine](https://www.smashingmagazine.com/2023/08/designing-accessible-text-over-images-part1/)).

_What we learn_: we already do this better than the guidance asks. The
opportunity is not a better scrim, it is **needing less scrim**, by putting type
where the picture is reliably dark rather than darkening the picture to suit the
type.

_How we reinterpret_: Concept 04 reads the poster and places the overlay in the
quietest region of the actual frame. This is the one genuinely novel technique
in the set.

---

## 3. Information architecture

Every field `GET /reels` actually returns, classified. Being opinionated is the
instruction; these are rulings, not options.

### 3.1 Must show immediately, on every reel

| Field                                    | Why                                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `experience.title`                       | The subject. Non-negotiable.                                                                                                                                                                                                                                                                       |
| `experience.activityTypeLabel`           | _What you would be doing._ One or two words. On a feed where every clip is blue water this is the difference between a scroll and a tap, and the contract says so. Removing it was the single worst deletion of 13 Sep. Absent on unclassified listings: render nothing, never a placeholder noun. |
| Availability truth, from `nextAvailable` | Prevents the losing tap. Rendered as one quiet line of type, never a chip, never coloured. Its **absence** is the more valuable message and must be stated, not omitted.                                                                                                                           |
| One way forward                          | Arrow, title and swipe, one `href`. Already correct.                                                                                                                                                                                                                                               |
| Sound, when a clip is playable           | Not drawn for a poster that will never play. Already correct.                                                                                                                                                                                                                                      |
| The mark, top left                       | Settled.                                                                                                                                                                                                                                                                                           |

`location` is **conditionally** must-show: present when the feed spans
destinations (the default), suppressed when a destination filter is applied,
because a filtered feed repeating "Havelock" forty times is noise.

### 3.2 Show on interaction

| Field                                           | Gesture that earns it                                                                                                                                                                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fromPrice` + `pricingUnitLabel`                | The second question, never the first. A feed that prices every card invites comparison before understanding. Render `pricingUnitLabel` verbatim; never build the phrase from `pricingUnit`. Absent price is "Price on request", never a zero. |
| `operator.name`, `operator.verified`            | Who runs this and whether the evidence is current. Second order until interest exists.                                                                                                                                                        |
| `operator.credentialsSummary` (first item only) | The trust asset from 1.5(b). One statement, not the list.                                                                                                                                                                                     |
| `durationMinutes`                               | Trip planning, not triage.                                                                                                                                                                                                                    |
| `seatsOnNextDisplay`                            | Only ever beside the date it belongs to. Never persistent: a scarcity number on every card is pressure selling, and this product has refused that everywhere else.                                                                            |
| `bookingMode`                                   | "Instant" versus "the operator answers first" changes the shape of the next ten minutes. It belongs at the moment of committing.                                                                                                              |

### 3.3 Detail page only

`summary`, `description`, `included`, `requirements`, `safetyNotes`,
`policyTier`, `cancellationPolicy`, `meetingPoint`, `gallery`, `safety`,
`questions`, `maxPartySize`, `bookable`, and the full `credentialsSummary` list.

### 3.4 Must never appear

Ratings, star averages, review counts, "popular", "booked N times today", likes,
followers, trending badges. **None of these exist in the API and all of them
would be fabricated claims.** This is recorded here so that no future concept,
prototype or pull request invents one because the layout looked empty. A design
that needs a number the product cannot earn is the wrong design.

### 3.5 One thing the product does not have and should

**A device-local shortlist.** A traveller planning three days needs to hold four
reels, not book the first one. There is no wishlist endpoint, and there does not
need to be: the app already keeps trips on device in **IndexedDB** via
`@/lib/booking/token-store` (`localStorage` is banned outright by an eslint
rule). A shortlist is buildable today with no API change and no account. It is
the highest value unbuilt thing on this screen and Concept 05 is built on it.

---

## 4. Interaction principles

1. **The vertical axis belongs to the feed.** It is the product's core gesture.
   Anything else on that axis has to be arbitrated explicitly, never merely
   added, or the feed starts fighting the thumb.
2. **Horizontal, right to left, opens the listing.** Settled, already built,
   with an axis lock at 1.4 bias, a 24px right edge guard for the platform's own
   back gesture, mouse and multi-touch refused, and a click swallow so a drag
   ending on a control does not fire it. Any new gesture must pass the same bar.
3. **Every gesture is a shortcut, never the only route.** WCAG 2.5.1. If a
   gesture reveals something, a visible control reveals the same thing, and both
   are built from one source of truth.
4. **Tap on the picture is reserved for play and pause.** It is the most
   discoverable tap on the screen and it belongs to the media.
5. **Disclosure is reversible and cheap.** Anything revealed is dismissed by the
   same gesture reversed, by scrolling on, and by Escape.
6. **Nothing appears on a timer.** A control that fades in after three seconds is
   an advertisement. Reveals answer a gesture or a measured dwell, never a clock.
7. **The CTA is present from frame one and gains confidence, never presence.**
8. **Motion is feedback.** The app has one motion budget: 250ms on
   `--ease-interaction`. Entrances are a marketing-site concept and do not exist
   here. Reduced motion is handled globally and no component adds its own branch.

---

## 5. Design principles (the law all five concepts obey)

1. **The picture is the product; the interface is a caption for it.** If an
   element cannot be justified as helping a traveller decide, it is removed.
2. **Type carries hierarchy. Containers do not.** Fraunces at 400 for the
   subject, Satoshi for facts, the `label` utility for metadata. No card, no
   panel, no badge over a reel unless it is genuinely a control.
3. **Information is given back without the pixels being given back.** The answer
   to the owner's complaint is _when_ and _where_, never _whether_.
4. **The bottom 148px is the best land on the screen and is treated as
   composition, not as clearance.** The bar is part of the reel's architecture.
   It is never hidden, never retracted, never apologised for.
5. **Trust is evidence, not crowd count.** Where a competitor would show stars,
   we show what was checked. Where we cannot show evidence, we show nothing.
6. **The feed is finite and says so.** Three tail states, told by the server,
   never inferred.
7. **Nothing is drawn that the API cannot supply, and nothing is inferred that
   the API says is its own to word.** `pricingUnitLabel` and
   `seatsOnNextDisplay` are rendered verbatim.
8. **Measured, not estimated.** Contrast on the `abyss` scrim floors, 44px
   targets, `prefers-reduced-motion`, and no second dark surface. `terra` on
   dark is outline only; a filled `terra-soft` chip on forest measures 4.05:1
   and is banned.

---

## 6. Design opportunities

Ranked by how much they differentiate the product, not by effort.

1. **Availability as the organising fact.** No short-video product on earth is
   built around "can I do this on Thursday". Ours must be. It is the question a
   traveller with three days actually holds, and we have the field.
2. **Evidence instead of stars.** A quiet, factual credential line is a stronger
   and rarer trust signal than any rating, and it is ours alone.
3. **Finiteness as a feature.** A feed you can finish, that tells you where you
   are in it, is calmer than one that cannot end. Nobody in this category does
   this because nobody else has a small catalogue.
4. **Frame-aware overlay placement.** Put the type where the picture is already
   dark instead of darkening the picture. Cheap to compute from the poster,
   which we already load first.
5. **A shortlist held on the device.** Turns a scroll into a plan. Buildable
   today on IndexedDB, no account, no endpoint.
6. **Dwell as the interest signal.** The traveller stopping is the cleanest
   intent signal available and it costs nothing to read.
7. **The bar as composition.** The permanent bottom pill is a fixed element that
   every competitor's immersive feed lacks. Composing deliberately against it is
   a visual signature rather than a compromise.

---

## 7. Anti-patterns (explicit refusals)

- **A rail of stacked discs at the bottom right.** The most borrowed layout in
  the category. Present in the current build; removed in every concept.
- **Pills and chips over video.** The palette forbids a filled accent chip on
  dark anyway (4.05:1). Type does this work.
- **Floating cards over the clip.** A card over a picture is a hole in the
  picture.
- **Any second gradient.** One scrim per edge, twelve eased stops, sized to the
  brightest pixel. A gradient added for style is a darkened photograph for no
  reason.
- **Shadows.** There is no shadow token in this system and there will not be
  one. Hairlines at `cream/12` do the work.
- **Glass and heavy blur.** Explicitly rejected in v2.7 on GPU cost for
  mid-range Android. Backdrop blur is allowed only on the existing 64px play
  disc, where it already ships.
- **Invented social proof.** See 3.4. Non-negotiable.
- **Full-width shouting CTAs.** Removed on 13 Sep for cause.
- **Retracting chrome.** Settled against by the owner.
- **Timer-driven reveals.** See principle 6 of section 4.
- **Long dashes anywhere a traveller can read.** Em, en and horizontal bar are
  all banned, enforced by `pnpm check:dashes`.
- **Autoplaying sound.** Muted by default, remembered per session once unmuted.
- **A like button, a follow button, a comment count.** They have no backing and
  no product.

---

## 8. The product design thesis

> **The first reel screen exists to turn a scroll into a shortlist.** It should
> show the picture at full size and give a traveller only what decides the next
> swipe: what this is, and whether they could actually do it while they are
> here. Price, operator and evidence are revealed the moment the traveller stops
> scrolling, because stopping is the only honest signal of interest this screen
> can read.

Three clauses, each of which falsifies a previous iteration: _full size picture_
falsifies v1, _what decides the next swipe_ falsifies v2, and _revealed on
stopping_ is the axis neither version had.

---

## 9. Design hypotheses (one per concept)

Each concept is a different answer to "what decides the next swipe", not a
different skin.

**Concept 01, Quiet Frame.** _Hypothesis: the current design is correct about
restraint and wrong about which two words it kept._ Keep the bareness; replace
the disc rail with type; make the persistent line answer "what is this and can I
do it" instead of only naming it. Everything else arrives on a press and hold,
inverting clear mode. If this wins, the fix was one line of information and a
gesture, and the 13 September change was 90% right.

**Concept 02, Field Notes.** _Hypothesis: a travel feed should read as a
published guide rather than a social stream._ Editorial composition, a numbered
position in a finite collection, facts set as a typographic rule rather than as
controls, evidence where a competitor would put stars. If this wins, the product
is a curated catalogue and should stop behaving like a feed at all.

**Concept 03, Two Detents.** _Hypothesis: the traveller stopping is the signal,
and a non-modal sheet is the right container for what stopping earns._ The reel
has a peek state and an open state on the same vertical axis the feed owns, with
the arbitration made explicit. The video never stops and is never covered above
the fold. If this wins, the answer is a state machine rather than a layout.

**Concept 04, Reading the Frame.** _Hypothesis: the overlay should move to the
picture instead of the picture being darkened to suit the overlay._ Sample the
poster, find the quietest region, place the type there, and size the scrim to
what is actually behind it rather than to the worst case. If this wins, we can
carry more information for fewer darkened pixels than any fixed layout allows.

**Concept 05, The Shortlist.** _Hypothesis: the feed's job is planning, not
watching, and the missing verb is "hold"._ A device-local shortlist, a bar that
doubles as its count, and an availability-first overlay. Boldest, and the only
concept that changes what the screen is for. If this wins, the roadmap has a new
feature in it and the feed becomes the front of a planning tool.

---

## 10. What this research refuses to decide

Left open deliberately, for the owner:

- **Whether price belongs on the persistent line.** Every concept hides it
  behind a reveal, which is the recommendation. It is a commercial call, not a
  design one, and Concept 03's peek state is the cheapest place to change the
  answer.
- **Whether the shortlist is a product.** Concept 05 assumes yes. If the answer
  is no, Concept 05 is still valid minus the verb.
- **Whether the feed should ever filter itself by island.** `destinationKey` is
  on the endpoint and the search screen already sends it. The feed does not.
