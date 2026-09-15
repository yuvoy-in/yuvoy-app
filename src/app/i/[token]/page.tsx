import type { Metadata } from "next";
import { InviteLanding } from "@/components/trips/invite-landing";
import { privateRobotsMeta } from "@/lib/site/indexing";

export const metadata: Metadata = {
  title: "You are invited",
  robots: privateRobotsMeta,
};

/**
 * An invitation link (yuvoy-app#38 item 11).
 *
 * `noindex`, and `/i/` is in PRIVATE_ROUTES. The token in the path is a
 * credential: whoever opens it takes a place in somebody's party. An indexed
 * invitation would also 404 the moment it was accepted, since it is
 * single-use.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <InviteLanding token={token} />;
}
