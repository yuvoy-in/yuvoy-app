import type { Metadata } from "next";
import { CrewEditorScreen } from "@/components/people/crew-editor";
import { privateRobotsMeta } from "@/lib/site/indexing";
import { CREWS_WORDS } from "@/lib/people/crews-words";

export const metadata: Metadata = {
  title: CREWS_WORDS.newTitle,
  robots: privateRobotsMeta,
};

/**
 * A new crew (yuvoy-app#227): a name and a tick list of friends. Read and
 * saved with the traveller's session through this app's `/api/v1` proxy, so
 * the page is a shell for the client form.
 */
export default function NewCrewPage() {
  return <CrewEditorScreen />;
}
