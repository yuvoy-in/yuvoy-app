#!/usr/bin/env -S uv run --with "fonttools[woff]" --with brotli python
"""
Builds the app's two faces from one upstream file, Anek Latin (Ek Type, Mumbai;
SIL Open Font License 1.1, no Reserved Font Name):

    uv run scripts/build-fonts.py path/to/AnekLatin[wdth,wght].ttf

    src/fonts/Anek-Yuvoy.woff2          the text voice: width 100, weight 400 to 700
    src/fonts/Anek-Yuvoy-Display.woff2  the display voice: width 75, weight 700, 12% large

The source is google/fonts at 9710da1eacb3be272583c3224dcb70f9da6eadbb,
`ofl/aneklatin/AnekLatin[wdth,wght].ttf`. Its SHA-256 is checked below, so a
rebuild from any other file fails instead of quietly shipping a different face.
Like the Fraunces cut before it, the variable source is not committed: it would
be a second copy of the face that nothing builds from.

Why two files, and why these:

  TEXT keeps the weight axis (400 to 700) and drops width, pinned at 100. The
  app sets three weights (400, 500, 700); one variable file serving all three
  is one request and fewer bytes than three static cuts. `font-semibold` stays
  banned: the system has three weights, not a continuum.

  DISPLAY is a single static instance, width 75 and weight 700: the condensed
  bold that headlines, reel titles and big figures are set in. It is
  REGISTERED at weight 400 in src/lib/fonts.ts, so `font-display font-normal`
  stays the one display weight in the code (palette.test.ts bans any other), and
  no class anywhere had to change.

  The display cut is also BAKED 12% LARGER than its nominal size, by lowering
  unitsPerEm (2000 -> 1786). A condensed face reads small at the sizes a normal
  width one was tuned for; this restores its presence without touching the type
  scale. It is baked rather than declared (`size-adjust`) because next/font
  computes its fallback metrics from the file: a declared adjustment would
  leave the Arial fallback 12% smaller than the face it stands in for, and with
  `display: optional` a slow first visit keeps the fallback for the whole page.

Both are subset to what the app sets (the text face: Latin, Latin-1 and Latin
Extended-A for names; the display face: Latin-1, as the Fraunces cut was), the
punctuation the copy uses, the rupee sign (which the previous faces
did not have: every price borrowed its ₹ from a system font), and the OpenType
features the app relies on, including tabular figures and the slashed zero that
booking references use.
"""

import hashlib
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

SOURCE_SHA256 = "ef7077abf2166add6ab6a64b4a4a4407859bf4f9e5b9058b51ac01ada136b295"

TEXT_OUT = "src/fonts/Anek-Yuvoy.woff2"
DISPLAY_OUT = "src/fonts/Anek-Yuvoy-Display.woff2"

TEXT_AXES = {"wdth": 100, "wght": (400, 700)}
DISPLAY_AXES = {"wdth": 75, "wght": 700}

# 12% larger, baked: unitsPerEm divided by this. See the module docstring.
DISPLAY_SCALE = 1.12

# What Satoshi covered, which Anek also draws, plus the rupee sign. Accented
# Latin is for traveller, operator and place names; the dashes stay drawable
# because text arrives from the API (the copy rule strips them at the boundary).
CHARS = (
    set(range(0x0020, 0x007F))
    | set(range(0x00A0, 0x0180))
    | {0x0192, 0x0237}
    | set(range(0x01FA, 0x021C))
    | set(range(0x02C6, 0x02DE))
    | set(range(0x0300, 0x0339))
    | {0x03A9, 0x03BC, 0x03C0}
    | set(range(0x1E80, 0x1E86))
    | {0x1EF2, 0x1EF3}
    | set(range(0x2010, 0x2028))
    | set(range(0x2030, 0x203B))
    | {0x2044, 0x2070}
    | set(range(0x2074, 0x208A))
    | {0x20AC, 0x20B9, 0x2116, 0x2122, 0x212E}
    | {0x2202, 0x2205, 0x2206, 0x220F, 0x2211, 0x2212, 0x221A, 0x221E, 0x222B, 0x2248, 0x2260, 0x2264, 0x2265}
)

# The display cut sets headlines, reel titles and big figures, and it is the
# feed's LCP element, loaded `optional`: every kilobyte decides whether it wins
# its block window on a 0.5-3 Mbps island connection. So it keeps the range the
# Fraunces cut kept (Latin-1, the punctuation, the currency signs). A rarer
# accented letter in a listing title is drawn by the fallback for that letter.
DISPLAY_CHARS = (
    set(range(0x0020, 0x007F))
    | set(range(0x00A0, 0x0100))
    | {0x0131, 0x0152, 0x0153, 0x0160, 0x0161, 0x0178, 0x017D, 0x017E}
    | set(range(0x2010, 0x2028))
    | {0x2030, 0x2039, 0x203A, 0x20AC, 0x20B9, 0x2122, 0x2212}
)

# Must be drawn by both files, or the build fails.
REQUIRED = [ord(c) for c in "0123456789₹ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"]

FEATURES = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk", "tnum", "case", "zero"]


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def subset_and_save(font: TTFont, out: str, chars: set) -> None:
    # The instancer drops a glyph's gvar entry when it has no deltas left, and
    # the subsetter then looks it up by name: an empty entry is what "no
    # variation" means anyway.
    if "gvar" in font:
        variations = font["gvar"].variations
        for name in font.getGlyphOrder():
            if name not in variations:
                variations[name] = []

    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = FEATURES
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    opts.hinting = False
    opts.desubroutinize = True

    subsetter = subset.Subsetter(options=opts)
    subsetter.populate(unicodes=chars)
    subsetter.subset(font)

    cmap = font.getBestCmap()
    missing = [f"U+{c:04X}" for c in REQUIRED if c not in cmap]
    if missing:
        raise SystemExit(f"{out}: the subset lost {', '.join(missing)}")

    font.flavor = "woff2"
    font.save(out)


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2

    src = sys.argv[1]
    digest = sha256(src)
    if digest != SOURCE_SHA256:
        print(f"{src} is not the pinned source.\n  expected {SOURCE_SHA256}\n  got      {digest}")
        return 1

    text = TTFont(src, lazy=False)
    text = instancer.instantiateVariableFont(text, TEXT_AXES, updateFontNames=False)
    subset_and_save(text, TEXT_OUT, CHARS)

    display = TTFont(src, lazy=False)
    display = instancer.instantiateVariableFont(display, DISPLAY_AXES, updateFontNames=False)
    upm = display["head"].unitsPerEm
    display["head"].unitsPerEm = round(upm / DISPLAY_SCALE)
    subset_and_save(display, DISPLAY_OUT, DISPLAY_CHARS)

    for out in (TEXT_OUT, DISPLAY_OUT):
        print(f"{out}  {os.path.getsize(out) / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
