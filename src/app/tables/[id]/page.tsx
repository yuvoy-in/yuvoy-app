import type { Metadata } from "next";
import { TableScreen } from "@/components/tables/table-screen";
import { privateRobotsMeta } from "@/lib/site/indexing";
import { TABLE_WORDS } from "@/lib/tables/table-words";

/*
  The same tab title on every branch, and never the table's own: a signed-out
  reader must learn nothing about the table, and the title is the first place
  a forwarded link would show it. Absolute, so the layout's template does not
  add a second Yuvoy.
*/
export const metadata: Metadata = {
  title: { absolute: TABLE_WORDS.pageTitle },
  robots: privateRobotsMeta,
};

/**
 * One table, where every table email links (yuvoy-app#194, R8-T1).
 *
 * The id is handed to a client component rather than fetched here, as on
 * `/trips/invited/{id}`: the table is read with the reader's own session,
 * through this app's `/api/v1` proxy, and the page is a shell until the
 * session resolves anyway.
 */
export default async function TablePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TableScreen id={id} />;
}
