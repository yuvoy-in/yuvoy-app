import qrcode from "qrcode-generator";

/** The quiet zone round the code, in modules: the four the QR standard asks for. */
const QUIET = 4;

/**
 * The dark modules of `value` as one SVG path, in module units, and how many
 * modules a side holds with the quiet zone. Each run of dark modules in a row
 * is one rectangle, so no seam shows between two of them when the code is
 * scaled to a size that is not a whole number of pixels. Error correction M,
 * the shortest version that fits. Null for an empty value or one too long for
 * any version.
 *
 * The app's own (`packages/ui/src/qr-code.tsx` in yuvoy-mobile), with the
 * same encoder at the same version, so a booking shows the same code on both.
 * No imports beyond the encoder, so the browser tests can check a drawn code
 * against it.
 */
export function qrPath(value: string): { d: string; side: number } | null {
  if (!value) return null;
  try {
    const qr = qrcode(0, "M");
    qr.addData(value, "Byte");
    qr.make();
    const count = qr.getModuleCount();
    let d = "";
    for (let row = 0; row < count; row++) {
      let col = 0;
      while (col < count) {
        if (!qr.isDark(row, col)) {
          col++;
          continue;
        }
        const start = col;
        while (col < count && qr.isDark(row, col)) col++;
        const run = col - start;
        d += `M${start + QUIET} ${row + QUIET}h${run}v1h-${run}z`;
      }
    }
    return { d, side: count + QUIET * 2 };
  } catch {
    return null;
  }
}
