import localFont from "next/font/local";

/**
 * Brand Kit v3.0: Anek Latin, one family in two voices (owner-approved 3 Oct
 * 2026, the type study's option 1, "Jetty board").
 *
 * Why it replaced Fraunces + Satoshi: the soft serif on a light page with a
 * terracotta accent is the look the design authority names as the AI default,
 * Fraunces is on its list of reflex faces, and NEITHER of the old files had a
 * rupee sign, so every "₹4,500" borrowed its ₹ from a system font. Anek is Ek
 * Type's (Mumbai), draws ₹ itself, carries tabular figures and a slashed zero,
 * and has Devanagari, Bangla, Tamil and Telugu siblings for later. One family
 * for the app and the operator portal keeps them visibly one Yuvoy.
 *
 * Two files, both built by scripts/build-fonts.py from one pinned upstream
 * file (SIL OFL 1.1; the licence is src/fonts/Anek-OFL.txt):
 *
 *   anek         the text voice: width 100, variable weight 400 to 700. Body,
 *                UI, labels. Three weights are used (400/500/700) and
 *                `font-semibold` stays banned: three weights, not a continuum.
 *
 *   anekDisplay  the display voice: the condensed bold (width 75, weight 700),
 *                baked 12% large. It is REGISTERED here at weight 400 so that
 *                `font-display` with the default weight keeps meaning the one
 *                display cut, exactly as the Fraunces cut was registered;
 *                palette.test.ts still bans `font-display` at any other weight,
 *                which would make the browser synthesise a heavier one.
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

export const anekDisplay = localFont({
  src: [
    {
      path: "../fonts/Anek-Yuvoy-Display.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-anek-display",
  /*
    `optional`, as the Fraunces cut was, and for the same measured reason: the
    feed headline is the LCP element, and swapping it repainted at 4.1s against
    a first paint of 0.8s. At 16 KB, preloaded, the cut usually wins its block
    window; on a genuinely bad connection the visitor keeps the fallback for
    that page rather than watching the headline change under them. The
    fallback is metric-matched by next/font from the file itself, which is why
    the 12% is baked into the file and not declared.
  */
  display: "optional",
  preload: true,
});
