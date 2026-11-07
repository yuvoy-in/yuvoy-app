import type { Metadata } from "next";
import { OrganiserEventScreen } from "@/components/organisers/organiser-event-screen";
import { OrganiserGate } from "@/components/organisers/organiser-gate";
import { sentState } from "@/lib/organisers/event-form";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import { privateRobotsMeta } from "@/lib/site/indexing";

/**
 * One posted event, for a member of its organiser (yuvoy-app#224). `?sent=`
 * is the form's hand-over after a post, `?saved=1` after a change; anything
 * else in them is ignored.
 */
export const metadata: Metadata = {
  title: W.events,
  robots: privateRobotsMeta,
};

export default async function OrganiserEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; postId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id, postId }, query] = await Promise.all([params, searchParams]);
  return (
    <OrganiserGate>
      <OrganiserEventScreen
        id={id}
        postId={postId}
        sent={sentState(query.sent)}
        saved={query.saved === "1"}
      />
    </OrganiserGate>
  );
}
