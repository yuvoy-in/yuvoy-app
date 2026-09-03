import type { Metadata } from "next";
import { privateRobotsMeta } from "@/lib/site/indexing";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Offline",
  robots: privateRobotsMeta,
};

/**
 * The service worker's fallback for a navigation it cannot fetch.
 *
 * Deliberately points at Trips rather than the feed: the feed needs the
 * network to say anything true, and a traveller who is offline on a jetty
 * almost certainly wants the booking they already have.
 */
export default function OfflinePage() {
  return (
    <div className="stage flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="eyebrow text-terra-soft">No signal</p>
      <p className="font-display tracking-display text-cream mt-4 text-3xl leading-tight">
        You are offline
      </p>
      <p className="text-cream/70 mt-3 max-w-sm text-sm">
        Havelock does this. Your bookings are saved on this device and still
        open without signal — everything else needs a connection to tell you
        anything true.
      </p>
      <ButtonLink href="/trips" variant="paper" className="mt-6">
        Your trips
      </ButtonLink>
    </div>
  );
}
