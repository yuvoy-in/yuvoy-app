"use client";

import { useEffect } from "react";
import { captureFromLocation } from "@/lib/booking/attribution";

/**
 * Notices how the visit arrived, once, on any page.
 *
 * Mounted in the root layout because a QR code can point at any listing, and
 * `/go/[code]` sends its traveller to wherever the code resolves. Renders
 * nothing; stores nothing beyond the session. See `lib/booking/attribution`.
 */
export function AttributionCapture() {
  useEffect(() => {
    captureFromLocation();
  }, []);
  return null;
}
