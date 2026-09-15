import type { Metadata } from "next";
import { privateRobotsMeta } from "@/lib/site/indexing";

export const metadata: Metadata = {
  title: "Offline",
  robots: privateRobotsMeta,
};

/**
 * The service worker's fallback for a navigation it cannot fetch.
 *
 * ## It offers nothing, and that is the honest version (yuvoy-app#60)
 *
 * This used to promise that "your bookings are saved on this device and still
 * open without signal" and put a button to Trips under it. Both were true when
 * Trips read a list out of this device's IndexedDB. Item 1 of #60 removed that
 * read, on the owner's reasoning that the list "serves no purpose offline,
 * because the site does not load without internet anyway".
 *
 * So Trips needs a connection now, and a button to it would redraw this very
 * page, since the service worker answers any navigation it cannot fetch with
 * this. A dead end that says so is better than an action that loops.
 *
 * One thing genuinely does still work offline and the copy says exactly that
 * and no more: a booking page opened from its own link renders from the
 * snapshot saved on the first successful fetch. Checkout still writes that
 * (#60 item 4), and it is the booking PAGE's guarantee rather than a list's.
 */
export default function OfflinePage() {
  return (
    <div className="stage flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <p className="eyebrow text-terra-soft">No signal</p>
      <p className="font-display tracking-display text-paper mt-4 text-3xl leading-tight">
        You are offline
      </p>
      <p className="text-paper/70 mt-3 max-w-sm text-sm">
        Havelock does this. A booking you have already opened on this phone
        still opens from its own link. Everything else needs a connection to
        tell you anything true.
      </p>
    </div>
  );
}
