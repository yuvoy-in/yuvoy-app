import type { Metadata } from "next";
import { OrganiserGate } from "@/components/organisers/organiser-gate";
import { OrganiserHelpers } from "@/components/organisers/organiser-helpers";
import { ORGANISER_WORDS } from "@/lib/organisers/words";
import { privateRobotsMeta } from "@/lib/site/indexing";

export const metadata: Metadata = {
  title: ORGANISER_WORDS.helpers,
  robots: privateRobotsMeta,
};

/** An organiser's helpers (yuvoy-app#224): an owner adds and removes, a helper reads. */
export default async function OrganiserHelpersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <OrganiserGate>
      <OrganiserHelpers id={id} />
    </OrganiserGate>
  );
}
