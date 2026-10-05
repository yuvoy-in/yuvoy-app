import localFont from "next/font/local";

/**
 * Brand Kit v3.2: three voices (owner-approved 5 Oct 2026, the typography
 * study's Direction 09, "Signature: three voices"). Builds on v3.0's Anek
 * Latin (3 Oct 2026, the type study's option 1, "Jetty board").
 *
 *   The host speaks   every word a host wrote (titles, descriptions, about,
 *                     messages, their name) is set in Gotu, `voice-host`.
 *   Yuvoy guides      the interface stays in Anek, with sentence-case labels.
 *   The board         times and money sit on Anek's condensed cut.
 *
 * Why Anek replaced Fraunces + Satoshi (v3.0): the soft serif on a light page
 * with a terracotta accent is the look the design authority names as the AI
 * default, and NEITHER of the old files had a rupee sign. Anek and Gotu are
 * both Ek Type's (Mumbai), both draw ₹ themselves, and both have Devanagari,
 * so the three voices localise together. One set of files for the app and
 * the operator portal keeps them visibly one Yuvoy.
 *
 * Four files, all built by scripts/build-fonts.py from two pinned upstream
 * files (SIL OFL 1.1; the licences are src/fonts/Anek-OFL.txt and
 * src/fonts/Gotu-OFL.txt):
 *
 *   anek         text: width 100, variable weight 400 to 700. Body, UI,
 *                labels, buttons. Three weights are used (400/500/700) and
 *                `font-semibold` stays banned: three weights, not a continuum.
 *
 *   anekDisplay  Yuvoy's headlines, `font-display`: the semi-condensed bold
 *                (width 87.5, weight 700), baked 4% large.
 *
 *   anekBoard    the board, `font-board`: the condensed bold (width 75,
 *                weight 700), baked 12% large. Big figures, times, money.
 *
 *   gotu         the host's own words, `voice-host`: Gotu's one weight,
 *                baked 5% small.
 *
 * The two Anek cuts are REGISTERED here at weight 400 so that `font-display`
 * and `font-board` at the default weight each mean exactly one cut;
 * palette.test.ts bans them at any other weight, which would make the browser
 * synthesise a heavier one. Gotu has one weight and `voice-host` turns
 * synthesis off, so a host's words never go bold.
 *
 * Self-hosted, no runtime request to Google.
 */

export const anek = localFont({
  src: [
    { path: "../fonts/Anek-Yuvoy.woff2", weight: "400 700", style: "normal" },
  ],
  variable: "--font-anek",
  display: "swap",
  preload: true,
});

/*
  The three voices below are `optional`, as the Fraunces cut was, and for the
  same measured reason: a page's headline is its LCP element, and swapping the
  feed headline repainted it at 4.1s against a first paint of 0.8s. Since v3.2
  the feed headline is the host's title, so Gotu is held to the same rule as
  the headline and board cuts. Each is small and preloaded, so it usually wins
  its block window; on a genuinely bad connection the visitor keeps the
  fallback for that page rather than watching the words change under them.
  The fallbacks are metric-matched by next/font from the files themselves,
  which is why each size is baked into its file and not declared.

  All three are preloaded on every route, not left to load on first use: an
  `optional` face that starts loading only when a figure or a host's title
  first appears misses its window, and in a client-side app it then stays the
  fallback until the next full load.
*/

export const anekDisplay = localFont({
  src: [
    {
      path: "../fonts/Anek-Yuvoy-Display.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-anek-display",
  display: "optional",
  preload: true,
});

export const anekBoard = localFont({
  src: [
    {
      path: "../fonts/Anek-Yuvoy-Board.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-anek-board",
  display: "optional",
  preload: true,
});

export const gotu = localFont({
  src: [{ path: "../fonts/Gotu-Yuvoy.woff2", weight: "400", style: "normal" }],
  variable: "--font-gotu",
  display: "optional",
  preload: true,
});
