import type { Metadata } from "next";
import { OrganiserGate } from "@/components/organisers/organiser-gate";
import { EditOrganiserForm } from "@/components/organisers/organiser-form";
import { ORGANISER_WORDS } from "@/lib/organisers/words";
import { privateRobotsMeta } from "@/lib/site/indexing";

export const metadata: Metadata = {
  title: ORGANISER_WORDS.editTitle,
  robots: privateRobotsMeta,
};

/** An owner editing an organiser page (yuvoy-app#224). */
export default async function EditOrganiserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <OrganiserGate>
      <EditOrganiserForm id={id} />
    </OrganiserGate>
  );
}
