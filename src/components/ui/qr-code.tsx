import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { qrPath } from "@/lib/format/qr-path";

/**
 * A QR code of `value`, `size` pixels square: forest modules on paper with the
 * quiet zone inside the square. Encoded in the browser (`qrPath`), so nothing
 * about the value leaves the page to be drawn. Draws nothing when the value
 * cannot be encoded.
 */
export function QrCode({
  value,
  size,
  label,
  className,
  ...data
}: {
  value: string;
  size: number;
  label: string;
  className?: string;
} & { [key: `data-${string}`]: string | undefined }) {
  const code = useMemo(() => qrPath(value), [value]);
  if (!code) return null;
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${code.side} ${code.side}`}
      shapeRendering="crispEdges"
      className={cn("block", className)}
      {...data}
    >
      <rect
        x={0}
        y={0}
        width={code.side}
        height={code.side}
        className="fill-paper"
      />
      <path d={code.d} className="fill-forest" />
    </svg>
  );
}
