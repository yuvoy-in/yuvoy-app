import type { Metadata } from "next";
import { OrganiserGate } from "@/components/organisers/organiser-gate";
import { OrganiserHub } from "@/components/organisers/organiser-hub";
import { ORGANISER_WORDS } from "@/lib/organisers/words";
import { privateRobotsMeta } from "@/lib/site/indexing";

export const metadata: Metadata = {
  title: ORGANISER_WORDS.title,
  robots: privateRobotsMeta,
};

/**
 * The person's organiser pages (yuvoy-app#224), from Account. A shell: the
 * list is read in the browser over the session, behind the gate's sign-in,
 * `supply` and age checks.
 */
export default function OrganiserHubPage() {
  return (
    <OrganiserGate>
      <OrganiserHub />
    </OrganiserGate>
  );
}
