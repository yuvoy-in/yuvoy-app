import type { Metadata } from "next";
import { InvitedTripScreen } from "@/components/trips/invited-trip-screen";
import { privateRobotsMeta } from "@/lib/site/indexing";

export const metadata: Metadata = {
  title: "A trip you were invited to",
  robots: privateRobotsMeta,
};

/**
 * One trip somebody else booked (yuvoy-app#38 item 7).
 *
 * The id is handed to a client component rather than fetched here: the trip is
 * keyed by the reader's own session, which lives in an HttpOnly cookie this
 * app's own `/api/v1` proxy attaches. A server component could read the cookie,
 * but then the page would be dynamic for a screen that is a shell until the
 * session resolves anyway.
 */
export default async function InvitedTripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InvitedTripScreen id={id} />;
}
