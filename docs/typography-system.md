# Yuvoy typography system

> **v3.2, "Signature: three voices"**, owner-approved on 5 Oct 2026 (Direction 09 of the
> typography study in `yuvoy/typography-lab`, decision verbatim in its `APPROVALS.md`).
>
> This is the reference for type in the traveller app and the operator portal. It is canonical
> here, as the tokens are: the portal's own `docs/typography-system.md` says how the portal applies
> it, `pnpm tokens:check` in the portal diffs its type tokens against this repo's, and the four
> font files are byte-identical in both repos. `yuvoy-web` is frozen on Fraunces and Satoshi and is
> not covered. Why each decision was taken is in `docs/DESIGN_SYSTEM.md` (v3.0 and v3.2).

## Three voices

Every string on a Yuvoy screen is said by one of three speakers, and the type says which.

| Voice     | Who is speaking                                                                                                                                                                               | Face                  | Class                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------- |
| The host  | the person running the experience: their listing's name, description, what is included, the meeting point, their policy, their story, their business name, their questions and their messages | Gotu                  | `voice-host`                                            |
| Yuvoy     | the product guiding you: headlines, labels, buttons, explanations, states                                                                                                                     | Anek Latin            | `font-sans` (the default), `font-display` for headlines |
| The board | the figure that leads a block: a time, an amount, a count, read like the boards at the jetty                                                                                                  | Anek Latin, condensed | `font-board`                                            |

A string's voice is decided by **who wrote it, not where it sits**. A host's title is in Gotu on a
reel, a card, a ticket, a search result and in the field where the host types it. A stand-in that
Yuvoy writes when the host wrote nothing ("A trip", "Your listing", "Not written yet") is Yuvoy's,
so it stays in Anek.

## Display font

**Anek Latin, display cut** (`font-display`, `Anek-Yuvoy-Display.woff2`): one static instance at
width 87.5 and weight 700, baked 4% large, registered at weight 400. Yuvoy's own headlines: screen
titles and the large section headings. A signboard, not a sports page.

- Always `font-display tracking-display leading-display text-balance` and a size.
- Never with a weight class. The cut is already bold, and a weight would make the browser
  synthesise a heavier copy.
- When the headline is the host's words (a listing's name on its own page), it is
  `voice-host leading-display text-balance` and a size instead.

## Body font

**Anek Latin, text** (`font-sans`, the default, `Anek-Yuvoy.woff2`): width 100 with the weight axis
kept, 400 to 700, in one variable file. Everything Yuvoy says that is not a headline or a figure:
running text, labels, buttons, navigation, forms and states.

**Gotu** (`voice-host`, `Gotu-Yuvoy.woff2`): the host's voice. One weight, 400, baked 5% small so
its tall lowercase sits with Anek. Anek and Gotu are both Ek Type's (Mumbai), both draw the rupee
sign, and both have Devanagari, so the three voices localise together.

## Utility font

**Anek Latin, board cut** (`font-board`, `Anek-Yuvoy-Board.woff2`): width 75, weight 700, baked
12% large, registered at weight 400. Big figures, times and money. It was the display face from
v3.0 until v3.2, and keeps the one job it does best.

**System monospace** (`font-mono`): machine text, never a voice. Codes being typed (sign-in,
invite, join), technical error ids, and data shown as data: phone numbers on the portal's team
rows, links, the IFSC field and bank details. `uppercase` is allowed on `font-mono` alone, because
there it is the data's own case (an IFSC typed in either case), not a voice.

## Font weights

| Face                   | Weight                                | Used for                                                                      |
| ---------------------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| Anek text              | 400                                   | running text, meta                                                            |
|                        | 500, `font-medium`                    | labels, eyebrows, the chips that carried the label, the portal's field labels |
|                        | 700, `font-bold`                      | buttons, titles, navigation, emphasis                                         |
| Anek display and board | one baked 700 each, registered at 400 | headlines; figures                                                            |
| Gotu                   | 400 only, synthesis off               | the host's words, which never go bold                                         |

`font-semibold` is banned everywhere: three weights, not a continuum. A weight class beside
`font-display`, `font-board` or `voice-host` is banned.

## Type scale

Tailwind's scale, with three steps of our own (`text-label`, `text-button`, `text-body`). Sizes
and line heights in px at the default root size.

| Role                         | Classes                                                                                           | Size / line                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------- |
| Headline, largest            | `font-display … text-4xl`                                                                         | 36 / 38.9                   |
| Headline                     | `font-display … text-3xl`                                                                         | 30 / 32.4                   |
| Section headline             | `font-display … text-2xl`                                                                         | 24 / 25.9                   |
| Sub-section (portal builder) | `font-display … text-xl`                                                                          | 20 / 21.6                   |
| Title                        | `text-lg font-bold`, `text-base font-bold`                                                        | 18 / 28, 16 / 24            |
| Body, app                    | `text-body`                                                                                       | 15 / 23                     |
| Body, portal                 | `text-sm` or `text-base` with `leading-body`                                                      | 14 / 21.7, 16 / 24.8        |
| Button                       | `text-button font-bold`                                                                           | 15 / 20                     |
| Label, eyebrow               | `label`, `eyebrow`                                                                                | 13 / 18                     |
| Meta, help                   | `text-sm`, `text-xs`                                                                              | 14 / 20, 12 / 16            |
| Navigation                   | `text-xs font-bold`                                                                               | 12 (portal: 11 below 336px) |
| Chip                         | the chip's own size and weight                                                                    | 11 (small)                  |
| Figure                       | `font-board` from `text-xl` to `text-7xl` (the boarding count), `leading-none` or `leading-tight` | 20 to 72                    |

The app's headlines are mostly `text-3xl`, the portal's mostly `text-4xl`.

## Line heights

- `leading-display` (1.08) on every headline, Yuvoy's or the host's, and always with
  `text-balance`, so a two-line headline breaks into two even lines.
- `leading-body` (1.55) on running text, and always with `text-pretty`, so a paragraph never ends
  on one word. In the app `text-body` carries its own 23px on 15px.
- Figures sit at `leading-none` or `leading-tight`; labels and buttons carry their own (18 and 20);
  meta keeps Tailwind's.
- `--tw-leading` does not inherit, so a sized span inside a headline repeats `leading-display`.
- A clamped headline (`line-clamp`, `truncate`) clips at its box, and at 1.08 the ink overhangs
  the line: Gotu's tallest accents (Å, Ś, Ǻ) rise up to 0.26em above the first line. So a clamped
  host headline takes `pt-[0.26em]` with a margin that puts the words back (the reel's title,
  checkout's picture), Gotu is never clamped at `leading-none`, and a Yuvoy headline is never
  clamped at a tight leading. `fonts.test.ts` measures the room from the file.
- `cn()` keeps a leading written before a size. Stock tailwind-merge drops it, on the assumption
  that a size resets the leading, which in Tailwind 4 it does not. `palette.test.ts` checks that no
  type class is lost through `cn`.

## Letter spacing

| Token               | Value    | On                                         |
| ------------------- | -------- | ------------------------------------------ |
| `tracking-display`  | -0.005em | Yuvoy's headlines                          |
| none                | 0        | text, labels, buttons, the board, the host |
| `tracking-ref`      | 0.04em   | references                                 |
| `tracking-wordmark` | 0.34em   | the YUVOY wordmark, and nothing else       |

- A figure inside a tracked headline takes `tracking-normal`, the board's zero.
- `voice-host` resets tracking to 0 whatever its parent set.
- Tracked capitals are gone. `tracking-wide`, `tracking-wider`, `tracking-widest` and the old
  `tracking-label` are banned, and so is `uppercase` outside `font-mono`. Words are written in the
  case they are shown in, and nothing transforms them.

## Heading rules

1. One `h1` per screen. Yuvoy's: `font-display tracking-display leading-display text-balance` and a
   size. The host's: `voice-host leading-display text-balance` and a size.
2. A host's string inside a Yuvoy sentence keeps the sentence's voice: "Join {business}" is one
   Yuvoy headline.
3. Section headings are a `label` (or an `eyebrow`, once per section), or a display `text-2xl` for
   the large sections of a long screen.
4. Titles (a card's, a row's, a panel's, an empty state's) are `font-bold text-balance` at their
   size, or `voice-host text-balance` when they are the host's. A title that truncates does not
   balance.
5. The booked hour is the booking screen's headline, so it is a figure on the board, not a
   display headline.

## Body rules

1. Running text is body: explanations, instructions, an empty list's sentence. App:
   `text-body text-pretty`. Portal: `leading-body text-pretty` at the size the screen already used
   (14 or 16). The host's: `voice-host leading-body text-pretty`.
2. Meta is not body: data fragments, status lines, counts, a date and a place. It keeps `text-sm`
   or `text-xs` with Tailwind's line height. The test is what a line is, not how long it is: "No
   completed cash trips yet." is body (an empty list's sentence); "Nothing to pay." under a heading
   is a status.
3. Field hints, errors, success lines and `role="status"` lines keep their own style. They are read
   at a glance, not as prose.
4. Emphasis in Yuvoy's running text is `font-bold`. A host's words are never emphasised by us.

## Label rules

1. `label` is sentence case, 13/18, weight 500, untracked, in the ink the caller gives it:
   `text-forest/75` or `text-terra-deep` on paper, `text-terra-soft` or `text-paper/70` on forest.
   Never `text-terra` on paper at this size (3.72:1, fails AA).
2. It carries its own size and weight, so it never sits beside a size or a weight class.
3. `eyebrow` is the label with a terracotta square before it: once per section, at the top.
4. A button is not a label: `text-button font-bold` (15/20), at every button size.
5. A chip is not a label: it keeps the chip's own size and weight, with `font-medium` where it
   carried the label before v3.2.
6. Navigation is `text-xs font-bold`. The portal's five-tab bar steps to 11px below 336px, so its
   labels fit at 320px.
7. Field labels: in the portal, the listing builder and the listings screen use
   `fieldLabelClass()` (14px, weight 500) and every other form uses the `label` utility (13px,
   weight 500). Both are sentence case: yuvoy-operator#85 moved the builder off the shouted label,
   and v3.2 made the label itself sentence case, so 1px is all that is left between them. It is
   left as it was.

## Number rules

1. **The board** (`font-board … tabular-nums`, no weight class, `leading-none` or `leading-tight`):
   the figure that leads a block. The booked hour on booking and checkout and on the next-up pass;
   the host's stats; in the portal, a departure's time inside its headline, the day's counts, the
   boarding count, the business's stats, and every lead figure on the Money tab, a payout, a
   statement and Cash.
2. **Times** in running lines take `tabular-nums`, so a column of times lines up. A host's words
   inside such a line reset to proportional figures through `voice-host`.
3. **Prices** keep Anek's default figures, which are proportional: a price is read once, not
   scanned down a column. The app never sets `tabular-nums` on a price. The portal sets it where
   amounts stack in a column: statement rows, cash lists, the arithmetic under a payout.
4. **References** are `tracking-ref slashed-zero tabular-nums`: booking references, statement
   references, UPI transaction ids, the IFSC (through `AccountLine` in the portal), the bank
   reference, the phone number the portal's sign-in reads back, and a reference quoted inside a
   sentence. A zero in a code never passes for an O.
5. The rupee sign is drawn by our own fonts in all four files; `fonts.test.ts` checks each cmap.

## Mobile rules

- Built for 320px first, and checked from 320 to 1280.
- Sizes are in rem, so a phone's text-size setting scales every step.
- Nothing wraps that must not: buttons are `whitespace-nowrap` at 15px, and sentence-case labels
  are shorter than the tracked capitals they replaced (the feed's eyebrow and the pay button no
  longer wrap at 390px).
- Headlines balance, so a long title breaks into two even lines rather than one long and one
  short.
- Running text is 15px in the app and 14px or 16px in the portal; nothing a person reads as prose
  is smaller.
- Inputs are 16px (`text-base`), which also stops iOS zooming into a field on focus.

## Desktop rules

- The same classes at every width. The one headline that steps up is the booking screen's hour
  (`sm:text-4xl`); everything else holds its size, and the containers set the measure (`max-w-prose`
  on long running text in the app), so a line stays readable on a wide screen.
- Navigation keeps its 12px bold labels on the desktop rail.

## Traveller usage (yuvoy-app)

- **The host**: reel and card titles (feed, search, saved), the experience page (title,
  description, what is included, the meeting point, the policy), the host's profile and listings,
  the booking and checkout summaries, the host's questions, the host's messages in a thread, trip
  cards, the next-up pass and invites.
- **The board**: the booked hour on booking and checkout, the next-up pass time, the host's stats.
- **Yuvoy**: everything else. Running text is `text-body`.
- **Machine text**: codes being typed, error ids, the trip countdown.
- The booking pass image (`/api/booking-pass`) is drawn by Satori, which reads TTF or OTF only; the
  brand ships woff2, so the pass is set in the system sans.

## Operator usage (yuvoy-operator)

The portal applies the same rules to an operator's working screens; its
`docs/typography-system.md` has the detail. In short:

- The host's public words are in Gotu on screen **and in the fields that write them** (a listing's
  name, summary, description, meeting point, inclusions, requirements, safety notes and questions,
  the story, the business name), so an operator sees their words as travellers will.
- Message composers and notes stay in Anek. They are working fields, typed fast at a jetty, and a
  sent message is shown in the host's voice in the conversation.
- The board carries the day's times and counts and every lead figure on Money.
- **Sun mode** (the boarding screen at arm's length in direct sunlight) lifts `text-xs`, `text-sm`
  and `text-base` a step, bolds `.label` and deepens the muted ink. Buttons, board figures and the
  host's words are left at their size.

## Font loading strategy

- Self-hosted through `next/font/local` (`src/lib/fonts.ts`): no request to Google at runtime.
- **Anek text loads `swap`.** Body text must appear at once, and its fallback is metric-matched.
- **The three voices (display, board, Gotu) load `optional` and are preloaded on every route.** A
  headline is a page's LCP element, and since v3.2 the feed's is the host's title in Gotu. Swapping
  a headline repainted it at 4.1s against a first paint of 0.8s, so on a slow first visit the
  fallback stays for that page rather than the words changing under the reader. Preloading on every
  route is what lets an `optional` face win its block window in a client-side app; a face that
  starts loading only when a figure first appears misses it and stays the fallback until the next
  full load.
- **Each face's size is baked into the file** (`unitsPerEm`), not declared with `size-adjust`.
  next/font builds each fallback's metrics from the file, so a declared adjustment would leave the
  fallback a different size from the face it stands in for.
- The files are served from `/_next/static/media` under content-hashed names, cached as immutable.

## Performance strategy

| File                       | Cut                                |       Bytes | Loads                 |
| -------------------------- | ---------------------------------- | ----------: | --------------------- |
| `Anek-Yuvoy.woff2`         | text: width 100, weight 400 to 700 |      59,184 | `swap`, preloaded     |
| `Anek-Yuvoy-Display.woff2` | width 87.5, weight 700, 4% large   |      17,080 | `optional`, preloaded |
| `Anek-Yuvoy-Board.woff2`   | width 75, weight 700, 12% large    |      16,360 | `optional`, preloaded |
| `Gotu-Yuvoy.woff2`         | Gotu 400, 5% small                 |      33,892 | `optional`, preloaded |
| **Total**                  | **4 files**                        | **126,516** |                       |

Before v3.2 the product loaded two files, 75,456 bytes. The 51 KB added are Gotu (34 KB) and the
new display cut (17 KB); the board cut is the old display file under its new name.

- **Subsets.** The text face and Gotu carry Latin, Latin-1 and Latin Extended-A, for names and
  places; the display and board cuts carry Latin-1. All four keep the punctuation the copy uses,
  the rupee sign, and the OpenType features the product uses, tabular figures and the slashed
  zero among them.
- **One variable file** serves the three text weights: one request, and fewer bytes than three
  static cuts.
- **No dead weight.** Each file has one job and is set across the product; no weight or width is
  shipped that is not used.
- **Reproducible.** `scripts/build-fonts.py` builds all four from two pinned upstream files (SIL
  OFL 1.1, licences in `src/fonts/`), and `fonts.test.ts` fails if a file cannot draw ₹, the digits
  or the alphabet.

**Measured** on the production build in WebKit at 390px (5 Oct 2026):

- Every route makes four font requests, 126,516 bytes, each once: the preloads carry
  `crossorigin`, so the fetch the face makes is the preload's. Each is served
  `public, max-age=31536000, immutable` as `font/woff2`. A not-found page is sent without the
  preload hints, as it was before v3.2, and makes the same four requests.
- With every font refused, each headline, figure and page is exactly as tall as with the fonts
  loaded, because each fallback is metric-matched from its file. The `swap` face moves nothing
  when it arrives.
- With every font held back 1.5s, no headline or figure moves. The three `optional` faces miss
  their window and the page keeps their fallbacks (WebKit reports the faces `error`); the next
  full load draws them from the cache.

## Accessibility considerations

- **Contrast is unchanged.** The palette is locked and `palette.test.ts` measures every pairing.
  The 13px label uses `text-forest/75` or `text-terra-deep` on paper.
- **No CSS case transforms.** A screen reader, a copy and a translation get the words as written.
- **Sizes are rem.** The only fixed sizes are the 11px chip and the portal's 11px navigation step,
  the smallest text in the product; neither is prose.
- **Text reflows** at 200% zoom. Headlines balance and paragraphs wrap pretty where the browser
  supports it, and wrap normally where it does not.
- **The host's face never synthesises** a bold or an italic (`font-synthesis: none`).
- **References** carry a slashed zero and an even rhythm; numbers that stack are tabular, so they
  can be scanned.
- **Accessible names stay words.** A sentence split by a span keeps its spaces (`{" "}`), so a
  screen reader never reads two words as one.
- **Sun mode** in the portal (above) is the high-legibility setting for the one screen read in
  direct sunlight.

## How it is enforced

- `src/app/palette.test.ts`, "type": every class string in the codebase against the rules: a baked
  cut at a weight class; a board figure without tabular figures, or tracked; a headline without its
  leading and its balance; running text without its pretty last line; the host's words in our
  weight, face, spacing, case or figures; Gotu without `voice-host`; a label resized or at another
  weight; tracked capitals; a clamped headline that cuts its own ink. Each rule is shown firing on
  a planted defect and quiet on the shape it allows.
- `src/lib/fonts.test.ts`: every shipped file draws ₹, the digits and the alphabet (the text face
  and Gotu the accented letters names use too), the text face is variable on weight and every
  other face one cut, each cut is baked to its approved size, and Gotu's tallest glyph fits the
  room a clamped host headline leaves it.
- `src/lib/cn.test.ts`: the merge keeps the type steps and a leading written before a size.
- In the portal, `pnpm tokens:check` diffs the theme tokens against this repo's.

## Known limits

- The booking pass image is set in the system sans (Satori reads TTF or OTF; the brand ships woff2).
- The trip countdown keeps the system monospace.
- `docs/reel-lab` is a dated design study and still shows the old tracked labels.
- In WebKit, an accented capital (À, É, Å) on the first line past a clamped host headline's clamp
  shows the tip of its accent under the last line shown. `-webkit-line-clamp` clips the lines it
  hides rather than dropping them, and at 1.08 Gotu's capital accents rise above their line.
  Lowercase accents and every ASCII character stay inside it (measured from the file). The fix is
  `continue: discard`, which WebKit does not support yet.
