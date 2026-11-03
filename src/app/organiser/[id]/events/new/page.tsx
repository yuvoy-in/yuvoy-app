import type { Metadata } from "next";
import { NewOrganiserEvent } from "@/components/organisers/organiser-event-form";
import { OrganiserGate } from "@/components/organisers/organiser-gate";
import { ORGANISER_WORDS as W } from "@/lib/organisers/words";
import { privateRobotsMeta } from "@/lib/site/indexing";

/** Post an event for one organiser (yuvoy-app#224). Read and written from the browser. */
export const metadata: Metadata = {
  title: W.eventFormTitle,
  robots: privateRobotsMeta,
};

export default async function NewOrganiserEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <OrganiserGate>
      <NewOrganiserEvent id={id} />
    </OrganiserGate>
  );
}
