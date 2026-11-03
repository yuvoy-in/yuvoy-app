import type { Metadata } from "next";
import { CrewScreen } from "@/components/people/crew-screen";
import { privateRobotsMeta } from "@/lib/site/indexing";
import { CREWS_WORDS } from "@/lib/people/crews-words";

/*
  The same tab title for every crew, never the crew's own name: the name is
  the traveller's private word for a group of friends.
*/
export const metadata: Metadata = {
  title: CREWS_WORDS.head,
  robots: privateRobotsMeta,
};

/**
 * One crew (yuvoy-app#227). There is no single-crew read in the contract, so
 * the client screen finds the crew in the traveller's list. `?saved=1` is the
 * editor arriving here after a save, which the page says once.
 */
export default async function CrewPage({
  params,
  searchParams,
}: {
  params: Promise<{ crewId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { crewId } = await params;
  const { saved } = await searchParams;
  return <CrewScreen crewId={crewId} saved={saved === "1"} />;
}
