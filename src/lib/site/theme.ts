/**
 * The one place a colour literal may exist outside the `@theme` block.
 *
 * `viewport.themeColor` is consumed by the browser before any CSS is parsed,
 * so it cannot reference a custom property — it has to be a literal. Rather
 * than leaving that literal loose in layout.tsx where it would drift silently
 * from the token, it lives here, alone, and `palette.test.ts` allowlists this
 * file and no other.
 *
 * Must equal `--color-forest`. The palette test asserts that.
 */
export const THEME_COLOR = "#16362e";
