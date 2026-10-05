#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["fonttools[woff]==4.66.1", "brotli==1.2.0"]
# ///
"""
Builds the app's four faces from two upstream files, Anek Latin and Gotu (both
Ek Type, Mumbai; SIL Open Font License 1.1, no Reserved Font Name):

    uv run scripts/build-fonts.py path/to/AnekLatin[wdth,wght].ttf path/to/Gotu-Regular.ttf

    src/fonts/Anek-Yuvoy.woff2          text: width 100, weight 400 to 700
    src/fonts/Anek-Yuvoy-Display.woff2  Yuvoy's headlines: width 87.5, weight 700, 4% large
    src/fonts/Anek-Yuvoy-Board.woff2    the board, figures: width 75, weight 700, 12% large
    src/fonts/Gotu-Yuvoy.woff2          the host's own words: Gotu, 5% small

Brand Kit v3.2, "Signature: three voices" (owner-approved 5 Oct 2026, the
typography study's Direction 09): the host speaks in Gotu, Yuvoy guides in
Anek, and the board keeps time in Anek's condensed cut.

The sources are google/fonts at 9710da1eacb3be272583c3224dcb70f9da6eadbb,
`ofl/aneklatin/AnekLatin[wdth,wght].ttf` and `ofl/gotu/Gotu-Regular.ttf`.
Their SHA-256 are checked below, so a rebuild from any other file fails
instead of quietly shipping a different face. The sources are not committed:
they would be second copies of faces that nothing builds from.

The build is reproducible: the tools are pinned above, and each file keeps
its source's own timestamp rather than the time of the build, so the same
sources give the same bytes on any machine.

Why four files, and why these:

  TEXT keeps the weight axis (400 to 700) and drops width, pinned at 100. The
  app sets three weights (400, 500, 700); one variable file serving all three
  is one request and fewer bytes than three static cuts. `font-semibold` stays
  banned: the system has three weights, not a continuum.

  DISPLAY is a single static instance, width 87.5 and weight 700: the
  semi-condensed bold Yuvoy's own headlines (screen titles) are set in. A
  signboard, not a sports page. BOARD is the width 75 cut that was the display
  face until v3.2, kept for the one job it does brilliantly: figures and times
  that read like the boards at the jetty. Both are REGISTERED at weight 400 in
  src/lib/fonts.ts, so `font-display` and `font-board` at the default weight
  each mean exactly one cut (palette.test.ts bans any other weight, which
  would make the browser synthesise a heavier one).

  GOTU has one weight, which is the point: the host's words never go bold, so
  `voice-host` sets weight 400 and turns synthesis off.

  Each cut is BAKED to its size by changing unitsPerEm, not declared with
  `size-adjust`: a condensed face reads small at the sizes a normal width one
  was tuned for (board 12% large, display 4%), and Gotu's tall lowercase reads
  large next to Anek (5% small). next/font computes its fallback metrics from
  the file, so a declared adjustment would leave the fallback a different size
  from the face it stands in for, and with `display: optional` a slow first
  visit keeps the fallback for the whole page.

The text face and Gotu are subset to Latin, Latin-1 and Latin Extended-A, for
names and places; the display and board cuts to Latin-1, as the display cut
always was. All four keep the punctuation the copy uses, the rupee sign, and
the OpenType features the app relies on, including tabular figures and the
slashed zero that booking references use.
"""

import hashlib
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ANEK_SHA256 = "ef7077abf2166add6ab6a64b4a4a4407859bf4f9e5b9058b51ac01ada136b295"
GOTU_SHA256 = "766fbfb19d8a0c38814b23c42515ed9dea538fce18d741221eca321d0604a3f5"

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

# The display and board cuts set Yuvoy's headlines and figures, and both are
# loaded `optional`: every kilobyte decides whether a cut wins its block window
# on a 0.5-3 Mbps island connection. So they keep the range the Fraunces cut
# kept (Latin-1, the punctuation, the currency signs). A rarer accented letter
# in a headline is drawn by the fallback for that letter.
DISPLAY_CHARS = (
    set(range(0x0020, 0x007F))
    | set(range(0x00A0, 0x0100))
    | {0x0131, 0x0152, 0x0153, 0x0160, 0x0161, 0x0178, 0x017D, 0x017E}
    | set(range(0x2010, 0x2028))
    | {0x2030, 0x2039, 0x203A, 0x20AC, 0x20B9, 0x2122, 0x2212}
)

# Each cut: the file it writes, its source, the axes it pins (None for a static
# source), the size it is baked to (unitsPerEm is divided by this), and the
# characters it keeps.
CUTS = [
    ("src/fonts/Anek-Yuvoy.woff2", "anek", {"wdth": 100, "wght": (400, 700)}, 1, CHARS),
    ("src/fonts/Anek-Yuvoy-Display.woff2", "anek", {"wdth": 87.5, "wght": 700}, 1.04, DISPLAY_CHARS),
    ("src/fonts/Anek-Yuvoy-Board.woff2", "anek", {"wdth": 75, "wght": 700}, 1.12, DISPLAY_CHARS),
    ("src/fonts/Gotu-Yuvoy.woff2", "gotu", None, 0.95, CHARS),
]

# Must be drawn by every file, or the build fails.
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
    font.recalcTimestamp = False
    font.save(out)


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2

    sources = {"anek": (sys.argv[1], ANEK_SHA256), "gotu": (sys.argv[2], GOTU_SHA256)}
    for path, expected in sources.values():
        digest = sha256(path)
        if digest != expected:
            print(f"{path} is not the pinned source.\n  expected {expected}\n  got      {digest}")
            return 1

    for out, source, axes, scale, chars in CUTS:
        font = TTFont(sources[source][0], lazy=False)
        if axes is not None:
            font = instancer.instantiateVariableFont(font, axes, updateFontNames=False)
        if scale != 1:
            font["head"].unitsPerEm = round(font["head"].unitsPerEm / scale)
        subset_and_save(font, out, chars)

    for out, *_ in CUTS:
        print(f"{out}  {os.path.getsize(out) / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
