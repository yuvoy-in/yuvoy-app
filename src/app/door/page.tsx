import type { Metadata } from "next";
import { DoorScreen } from "@/components/organisers/door-screen";
import { OrganiserGate } from "@/components/organisers/organiser-gate";
import { DOOR_WORDS } from "@/lib/organisers/door-words";
import { privateRobotsMeta } from "@/lib/site/indexing";

export const metadata: Metadata = {
  title: DOOR_WORDS.title,
  robots: privateRobotsMeta,
};

/**
 * Checking people in at the door (yuvoy-app#226), from the organiser pages
 * or a guest's `/door#CODE` link. A static shell: the code is in the
 * fragment, which no server sees, and the check-in is sent from the browser
 * over the session, behind the gate's sign-in, `supply` and age checks.
 */
export default function DoorPage() {
  return (
    <OrganiserGate>
      <DoorScreen />
    </OrganiserGate>
  );
}
