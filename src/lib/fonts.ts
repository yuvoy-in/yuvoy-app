import localFont from "next/font/local";

/**
 * Brand Kit v2.5: Fraunces (display) + Satoshi (everything else).
 *
 * Fraunces is the open-license member of the soft-serif family premium travel
 * brands set their identities in, picked over ~350 candidates across seven
 * rounds. It ships variable and is tuned into the site's own cut in
 * globals.css: opsz 144, SOFT 75, WONK 0. Display weight is 400; the turn
 * rides at 480 via `font-turn` and is a TRUE drawn italic, not a synthesized
 * oblique.
 *
 * Satoshi (400/500/700) carries body, UI and labels. It has no italic file
 * and no 600: body emphasis is `font-bold` upright, and `font-semibold` must
 * not appear anywhere in the tree.
 *
 * Five files, self-hosted, no runtime request to Google. Dancing Script is
 * deliberately NOT ported — it exists for the marketing site's brand veil
 * alone and has no place in the app.
 */

export const fraunces = localFont({
  src: [
    {
      path: "../fonts/Fraunces-Yuvoy.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-fraunces",
  display: "optional",
  /*
    THE YUVOY CUT, BAKED. 118 KB -> 13 KB, an 89% saving, and this was the
    single biggest lever on the app's LCP.

    Two reductions, in order:

    1. The italic is gone. It is 146 KB, `preload` covers every file in a
       family, and the app never sets display type in italic — the terracotta
       "turn" is the marketing site's move, not this one.

    2. The variable font is INSTANCED to the axis values globals.css already
       pins: opsz 144, SOFT 75, WONK 0, weight 400. Nothing in the app renders
       display type at any other weight, so four axes of interpolation data
       were being shipped to a 0.5-3 Mbps connection to produce one cut. The
       letterforms are identical; the machinery for producing others is not.

    Regenerate with scripts/build-display-font.py if the cut ever changes, and
    note that a NEW WEIGHT means going back to the variable file first — a
    static 400 cannot serve 480, and the browser would synthesise it.
  */
  preload: true,
});

export const satoshi = localFont({
  src: [
    { path: "../fonts/Satoshi-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/Satoshi-Medium.woff2", weight: "500", style: "normal" },
    { path: "../fonts/Satoshi-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-satoshi",
  display: "swap",
  preload: true,
});
