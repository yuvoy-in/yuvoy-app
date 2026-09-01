#!/usr/bin/env -S uv run --with "fonttools[woff]" --with brotli python
"""
Builds src/fonts/Fraunces-Yuvoy.woff2 — the display face, baked.

    uv run scripts/build-display-font.py path/to/Fraunces-Variable.woff2

The upstream variable font is 118 KB and carries four axes of interpolation
data. The app pins every one of them (globals.css: opsz 144, SOFT 75, WONK 0)
and renders display type at weight 400 only, so all of that machinery was being
shipped over a 0.5-3 Mbps connection to produce a single cut. Instancing to
those exact values and subsetting to the characters the brand uses takes it to
13 KB, with identical letterforms.

The variable source is deliberately NOT committed: it would be a second copy of
the same face that nothing builds from. Fetch it from the Fraunces release when
the cut changes.

**A new display weight means going back to the variable file first.** A static
400 cannot serve 480, and the browser would synthesise it — which is exactly
the faux-bold the type system exists to prevent.
"""

import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

# The Yuvoy cut, as declared in globals.css. Keep these in step.
AXES = {"opsz": 144, "SOFT": 75, "WONK": 0, "wght": 400}

OUT = "src/fonts/Fraunces-Yuvoy.woff2"

# Latin-1 plus the punctuation the brand actually sets, plus the rupee sign.
# Accented latin is kept for operator and place names.
CHARS = (
    set(range(0x20, 0x7F))
    | set(range(0x00C0, 0x0100))
    | {0x00A0, 0x00B7, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x20B9}
)


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2

    src = sys.argv[1]
    font = TTFont(src)

    if "fvar" not in font:
        print(f"{src} is not a variable font — nothing to instance.")
        return 1

    instancer.instantiateVariableFont(font, AXES, inplace=True, updateFontNames=False)

    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True

    subsetter = subset.Subsetter(options=opts)
    subsetter.populate(unicodes=CHARS)
    subsetter.subset(font)

    font.flavor = "woff2"
    font.save(OUT)

    before, after = os.path.getsize(src), os.path.getsize(OUT)
    print(f"{src}  {before / 1024:.0f} KB")
    print(f"{OUT}  {after / 1024:.0f} KB  ({(1 - after / before) * 100:.0f}% smaller)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
