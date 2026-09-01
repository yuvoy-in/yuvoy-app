import type { Metadata } from "next";
import { BookingScreen } from "@/components/booking/booking-screen";
import { privateRobotsMeta } from "@/lib/site/indexing";

export const metadata: Metadata = {
  title: "Your booking",
  // Never indexed. The page is keyed by a secret in the fragment, and a
  // crawler following a shared link is exactly the wrong outcome.
  robots: privateRobotsMeta,
};

/**
 * T9/T10. `force-dynamic` because a shared cache must never hold this: it is
 * keyed by a token the server cannot see, and a stale confirmed booking is
 * worse than no booking at all.
 */
export const dynamic = "force-dynamic";

export default function BookingPage() {
  return <BookingScreen />;
}
