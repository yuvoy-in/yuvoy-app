import { readFileSync } from "node:fs";
import { join } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { describe, expect, it } from "vitest";

/*
  The guard for the defect the v3.0 type change fixed: neither Fraunces nor
  Satoshi carried U+20B9, so every price in the app drew its ₹ from a system
  font, and nothing in the gate could see it (the build script even asked for
  the glyph; the face simply did not have it). This reads the cmap of each
  font the app ships and fails if a character the product prints is missing.

  The WOFF2 reader is deliberately small: the header, the table directory, one
  brotli stream, and the cmap table, which WOFF2 never transforms. No font
  library is added for a test.
*/

const FONTS = join(process.cwd(), "src/fonts");

/** The 63 tags a WOFF2 directory can name by index (spec, section 5.1). */
const KNOWN_TAGS = [
  "cmap",
  "head",
  "hhea",
  "hmtx",
  "maxp",
  "name",
  "OS/2",
  "post",
  "cvt ",
  "fpgm",
  "glyf",
  "loca",
  "prep",
  "CFF ",
  "VORG",
  "EBDT",
  "EBLC",
  "gasp",
  "hdmx",
  "kern",
  "LTSH",
  "PCLT",
  "VDMX",
  "vhea",
  "vmtx",
  "BASE",
  "GDEF",
  "GPOS",
  "GSUB",
  "EBSC",
  "JSTF",
  "MATH",
  "CBDT",
  "CBLC",
  "COLR",
  "CPAL",
  "SVG ",
  "sbix",
  "acnt",
  "avar",
  "bdat",
  "bloc",
  "bsln",
  "cvar",
  "fdsc",
  "feat",
  "fmtx",
  "fvar",
  "gvar",
  "hsty",
  "just",
  "lcar",
  "mort",
  "morx",
  "opbd",
  "prop",
  "trak",
  "Zapf",
  "Silf",
  "Glat",
  "Gloc",
  "Feat",
  "Sill",
];

type Table = { tag: string; length: number };

function readBase128(buf: Buffer, at: { pos: number }): number {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = buf[at.pos++];
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return value;
  }
  throw new Error("UIntBase128 longer than five bytes");
}

/** Every table of a WOFF2 file, decompressed, by tag. */
function tablesOf(file: string): Map<string, Buffer> {
  const buf = readFileSync(join(FONTS, file));
  if (buf.toString("latin1", 0, 4) !== "wOF2")
    throw new Error(`${file} is not WOFF2`);
  const numTables = buf.readUInt16BE(12);
  const compressed = buf.readUInt32BE(20);

  const at = { pos: 48 };
  const tables: Table[] = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[at.pos++];
    const index = flags & 0x3f;
    const version = flags >> 6;
    let tag: string;
    if (index === 63) {
      tag = buf.toString("latin1", at.pos, at.pos + 4);
      at.pos += 4;
    } else tag = KNOWN_TAGS[index];
    const origLength = readBase128(buf, at);
    // glyf and loca are transformed at version 0; every other table at 1+.
    const transformed =
      tag === "glyf" || tag === "loca" ? version !== 3 : version !== 0;
    const length = transformed ? readBase128(buf, at) : origLength;
    tables.push({ tag, length });
  }

  const stream = brotliDecompressSync(
    buf.subarray(at.pos, at.pos + compressed),
  );
  const out = new Map<string, Buffer>();
  let offset = 0;
  for (const t of tables) {
    out.set(t.tag, stream.subarray(offset, offset + t.length));
    offset += t.length;
  }
  return out;
}

/** The code points a cmap maps to a real glyph (formats 4 and 12). */
function codePoints(cmap: Buffer): Set<number> {
  const found = new Set<number>();
  const count = cmap.readUInt16BE(2);
  for (let i = 0; i < count; i++) {
    const offset = cmap.readUInt32BE(4 + i * 8 + 4);
    const format = cmap.readUInt16BE(offset);
    if (format === 4) {
      const segX2 = cmap.readUInt16BE(offset + 6);
      const ends = offset + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const ranges = deltas + segX2;
      for (let s = 0; s < segX2; s += 2) {
        const end = cmap.readUInt16BE(ends + s);
        const start = cmap.readUInt16BE(starts + s);
        const delta = cmap.readInt16BE(deltas + s);
        const rangeOffset = cmap.readUInt16BE(ranges + s);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let glyph: number;
          if (rangeOffset === 0) glyph = (c + delta) & 0xffff;
          else {
            const at = ranges + s + rangeOffset + (c - start) * 2;
            const raw = cmap.readUInt16BE(at);
            glyph = raw === 0 ? 0 : (raw + delta) & 0xffff;
          }
          if (glyph !== 0) found.add(c);
        }
      }
    } else if (format === 12) {
      const groups = cmap.readUInt32BE(offset + 12);
      for (let g = 0; g < groups; g++) {
        const at = offset + 16 + g * 12;
        const start = cmap.readUInt32BE(at);
        const end = cmap.readUInt32BE(at + 4);
        const first = cmap.readUInt32BE(at + 8);
        for (let c = start; c <= end; c++)
          if (first + (c - start) !== 0) found.add(c);
      }
    }
  }
  return found;
}

/** What the product prints, in every face: digits, the alphabet, the rupee. */
const EVERY_FACE =
  "0123456789₹ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz·,.:'’";

/** The four files src/lib/fonts.ts loads (v3.2, three voices). */
const TEXT = "Anek-Yuvoy.woff2";
const DISPLAY = "Anek-Yuvoy-Display.woff2";
const BOARD = "Anek-Yuvoy-Board.woff2";
const HOST = "Gotu-Yuvoy.woff2";

function missing(file: string, chars: string): string[] {
  const points = codePoints(tablesOf(file).get("cmap")!);
  return [...chars]
    .filter((c) => !points.has(c.codePointAt(0)!))
    .map(
      (c) =>
        `${c} U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`,
    );
}

/** `head.unitsPerEm`: where scripts/build-fonts.py bakes each cut's size. */
function unitsPerEm(file: string): number {
  return tablesOf(file).get("head")!.readUInt16BE(18);
}

/**
 * How far, in em, the tallest glyph in a file rises above the top of a line
 * box at `lineHeight`. The baseline sits where the line's half-leading puts
 * it, from `hhea`'s ascender and descender; `head.yMax` is the top of the
 * tallest glyph the file draws.
 */
function overhangAbove(file: string, lineHeight: number): number {
  const tables = tablesOf(file);
  const upm = unitsPerEm(file);
  const hhea = tables.get("hhea")!;
  const ascender = hhea.readInt16BE(4);
  const descender = hhea.readInt16BE(6); // negative, below the baseline
  const room = (ascender + descender + lineHeight * upm) / 2;
  return (tables.get("head")!.readInt16BE(42) - room) / upm;
}

describe("the delivered fonts", () => {
  it.each([TEXT, DISPLAY, BOARD, HOST])(
    "%s draws the rupee sign, the digits and the alphabet",
    (file) => {
      // Every face sets prices somewhere: the board its figures, the display
      // cut a headline that names one, the host's voice a description that
      // quotes one.
      expect(missing(file, EVERY_FACE)).toEqual([]);
    },
  );

  it.each([TEXT, HOST])(
    "%s draws the accented letters names and places use",
    (file) => {
      // Names arrive from the API: a traveller called Zoë or Łukasz, a place
      // called São Tomé, a host's business named for either. Latin-1 and
      // Latin Extended-A, by the build's own range.
      expect(missing(file, "ÀÉÍÓÚàéíóúçñüöäßøåæœŁłŚśŠšŽžĆćČčĐđ")).toEqual([]);
    },
  );

  it("ship the text face variable on weight and every other face as one cut", () => {
    // The text face serves 400, 500 and 700 from one file; the display and
    // board cuts are single instances registered at 400, and Gotu has one
    // weight (src/lib/fonts.ts).
    expect(tablesOf(TEXT).has("fvar")).toBe(true);
    expect(tablesOf(DISPLAY).has("fvar")).toBe(false);
    expect(tablesOf(BOARD).has("fvar")).toBe(false);
    expect(tablesOf(HOST).has("fvar")).toBe(false);
  });

  it("leave a clamped host headline room for the tallest accent Gotu draws", () => {
    // `line-clamp` clips at the box, and at the headline leading (1.08) a
    // capital's accent rises above the first line. The two clamped host
    // headlines (the reel's title, checkout's picture) carry `pt-[0.26em]`
    // for it, and palette.test.ts holds every clamped host headline to that.
    // A rebuild that adds a taller glyph fails here before it is cut off.
    expect(overhangAbove(HOST, 1.08)).toBeGreaterThan(0);
    expect(overhangAbove(HOST, 1.08)).toBeLessThanOrEqual(0.26);
    expect(overhangAbove(HOST, 1.25)).toBeLessThanOrEqual(0.26);
  });

  it("bake each cut to its approved size, not declare it", () => {
    // The study's sizes, baked by lowering or raising unitsPerEm so next/font
    // builds each fallback from the file as shipped: the display cut 4% large,
    // the board 12% large, Gotu 5% small. A rebuild that forgot the bake
    // would ship every headline, figure and host title at the wrong size.
    expect(unitsPerEm(TEXT)).toBe(2000);
    expect(unitsPerEm(DISPLAY)).toBe(Math.round(2000 / 1.04));
    expect(unitsPerEm(BOARD)).toBe(Math.round(2000 / 1.12));
    expect(unitsPerEm(HOST)).toBe(Math.round(1000 / 0.95));
  });
});
