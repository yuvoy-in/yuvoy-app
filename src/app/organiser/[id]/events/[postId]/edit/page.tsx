import type { Metadata } from "next";
import { EditOrganiserEvent } from "@/components/organisers/organiser-event-form";
import { OrganiserGate } from "@/components/organisers/organiser-gate";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import { privateRobotsMeta } from "@/lib/site/indexing";

/** Change a posted event, sending the whole event again (yuvoy-app#224). */
export const metadata: Metadata = {
  title: W.eventEditTitle,
  robots: privateRobotsMeta,
};

export default async function EditOrganiserEventPage({
  params,
}: {
  params: Promise<{ id: string; postId: string }>;
}) {
  const { id, postId } = await params;
  return (
    <OrganiserGate>
      <EditOrganiserEvent id={id} postId={postId} />
    </OrganiserGate>
  );
}
