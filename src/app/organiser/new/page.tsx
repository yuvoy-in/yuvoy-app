import type { Metadata } from "next";
import { OrganiserGate } from "@/components/organisers/organiser-gate";
import { NewOrganiserForm } from "@/components/organisers/organiser-form";
import { ORGANISER_WORDS } from "@/lib/organisers/words";
import { privateRobotsMeta } from "@/lib/site/indexing";

export const metadata: Metadata = {
  title: ORGANISER_WORDS.formTitle,
  robots: privateRobotsMeta,
};

/** Setting up an organiser page (yuvoy-app#224). A form; no server data. */
export default function NewOrganiserPage() {
  return (
    <OrganiserGate>
      <NewOrganiserForm />
    </OrganiserGate>
  );
}
