import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QrCode } from "./qr-code";
import { qrPath } from "@/lib/format/qr-path";

afterEach(cleanup);

const LINK = "https://operators.yuvoy.in/check-in#YV-4K2M9P7Q.K7QM2XPA";

describe("qrPath", () => {
  it("encodes the link at error correction M with the four-module quiet zone", () => {
    const code = qrPath(LINK);
    // 56 bytes at M is version 4: 33 modules a side, 41 with the quiet zone.
    expect(code?.side).toBe(41);
    // Every rectangle sits inside the quiet zone.
    for (const [, x, y] of code!.d.matchAll(/M(\d+) (\d+)/g)) {
      expect(Number(x)).toBeGreaterThanOrEqual(4);
      expect(Number(y)).toBeGreaterThanOrEqual(4);
      expect(Number(y)).toBeLessThan(37);
    }
  });

  it("gives the same code for the same value, and another for another", () => {
    expect(qrPath(LINK)).toEqual(qrPath(LINK));
    expect(qrPath(LINK)?.d).not.toBe(qrPath("tok_secret")?.d);
  });

  it("is nothing for an empty value", () => {
    expect(qrPath("")).toBeNull();
  });
});

describe("QrCode", () => {
  it("is one labelled image at the size asked for", () => {
    render(<QrCode value={LINK} size={232} label="Check-in QR code" />);
    const img = screen.getByRole("img", { name: "Check-in QR code" });
    expect(img).toHaveAttribute("width", "232");
    expect(img).toHaveAttribute("viewBox", "0 0 41 41");
    expect(img.querySelector("path")).toHaveAttribute("d", qrPath(LINK)!.d);
  });

  it("draws nothing it cannot encode", () => {
    const { container } = render(
      <QrCode value="" size={232} label="Check-in QR code" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
