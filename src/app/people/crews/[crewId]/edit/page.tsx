import type { Metadata } from "next";
import { CrewEditorScreen } from "@/components/people/crew-editor";
import { privateRobotsMeta } from "@/lib/site/indexing";
import { CREWS_WORDS } from "@/lib/people/crews-words";

export const metadata: Metadata = {
  title: CREWS_WORDS.editTitle,
  robots: privateRobotsMeta,
};

/** Changing a crew's name or members (yuvoy-app#227), in the same form as a new one. */
export default async function EditCrewPage({
  params,
}: {
  params: Promise<{ crewId: string }>;
}) {
  const { crewId } = await params;
  return <CrewEditorScreen crewId={crewId} />;
}
