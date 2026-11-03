import type { Metadata } from "next";
import { OrganiserGate } from "@/components/organisers/organiser-gate";
import { OrganiserScreen } from "@/components/organisers/organiser-screen";
import { ORGANISER_WORDS } from "@/lib/organisers/words";
import { privateRobotsMeta } from "@/lib/site/indexing";

/*
  The same tab title for every organiser, never its name: the page is read
  with the reader's own session in the browser, and a forwarded link must
  not say whose it is.
*/
export const metadata: Metadata = {
  title: ORGANISER_WORDS.title,
  robots: privateRobotsMeta,
};

/**
 * One organiser (yuvoy-app#224). The id goes to a client component, as on
 * `/tables/{id}`: it is read through this app's `/api/v1` proxy with the
 * reader's session.
 */
export default async function OrganiserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <OrganiserGate>
      <OrganiserScreen id={id} />
    </OrganiserGate>
  );
}
