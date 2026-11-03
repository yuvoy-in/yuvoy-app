import type { Metadata } from "next";
import { PeopleScreen } from "@/components/people/people-screen";
import { privateRobotsMeta } from "@/lib/site/indexing";
import { PEOPLE_WORDS } from "@/lib/people/people-words";

export const metadata: Metadata = {
  title: PEOPLE_WORDS.pageTitle,
  robots: privateRobotsMeta,
};

/**
 * People: friend requests, friends and the friend link (yuvoy-app#222).
 * Everything on it is the signed-in traveller's own, read through this app's
 * `/api/v1` proxy, so the page is a shell for the client screen.
 */
export default function PeoplePage() {
  return <PeopleScreen />;
}
