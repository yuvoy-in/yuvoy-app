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
      path: "../fonts/Fraunces-Variable.woff2",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "../fonts/FrauncesItalic-Variable.woff2",
      weight: "100 900",
      style: "italic",
    },
  ],
  variable: "--font-fraunces",
  display: "swap",
  // The app's first paint is a feed of posters with a headline over them.
  // A swap flash on the one line of display type is cheaper than blocking it.
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
