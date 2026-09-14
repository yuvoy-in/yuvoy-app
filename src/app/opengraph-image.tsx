import { ImageResponse } from "next/og";

export const alt = "Yuvoy";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The share card.
 *
 * Type-only, on the brand's own surfaces. Deliberately carries **no price, no
 * availability and no operator name** — an OG image is a claim that travels
 * further than the page it came from, and this project's rule is that nothing
 * is published which is not backed by a record.
 *
 * Set in a system sans rather than Satoshi, matching what yuvoy-web already
 * does. Satori needs TTF or OTF and the brand ships woff2 only — the build
 * fails with "Unsupported OpenType signature wOF2" — so the alternative is
 * committing a second copy of the family in another format purely for share
 * cards. The geometry, the palette and the wordmark do the brand work here;
 * the typeface is the part worth trading.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        // forest, the brand dark. Tokens cannot reach here — this renders
        // outside the CSS pipeline — so the values are stated once, and
        // palette.test.ts allowlists this file.
        background: "#16362e",
        padding: "72px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 12, height: 12, background: "#be7149" }} />
        <div
          style={{
            color: "#f4efe4",
            fontSize: 26,
            letterSpacing: "0.34em",
            fontWeight: 700,
          }}
        >
          YUVOY
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ color: "#f4efe4", fontSize: 78, lineHeight: 1.05 }}>
          Don&apos;t be a tourist.
        </div>
        <div style={{ color: "#d89772", fontSize: 30, marginTop: 24 }}>
          Experiences in the Andaman Islands
        </div>
      </div>
    </div>,
    size,
  );
}
