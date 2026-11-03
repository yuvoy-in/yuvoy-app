import type { Metadata } from "next";
import { AddFriendScreen } from "@/components/people/add-friend-screen";
import { privateRobotsMeta } from "@/lib/site/indexing";
import { PEOPLE_WORDS } from "@/lib/people/people-words";

/*
  The same title on every branch and never the owner's name: a forwarded
  link must not say whose it is to somebody signed out.
*/
export const metadata: Metadata = {
  title: PEOPLE_WORDS.add.pageTitle,
  robots: privateRobotsMeta,
};

/**
 * Where a friend link opens (yuvoy-app#222). The code goes to a client
 * screen: the lookup is session only, through this app's `/api/v1` proxy.
 */
export default async function AddFriendPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <AddFriendScreen raw={code} />;
}
