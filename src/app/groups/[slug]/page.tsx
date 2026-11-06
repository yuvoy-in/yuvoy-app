import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requestReleaseOpen } from "@/lib/auth/request-cohort";
import { privateRobotsMeta } from "@/lib/site/indexing";
import { GroupScreen } from "@/components/groups/group-screen";

/**
 * One group (yuvoy-mobile#386). The same title for every group, and never
 * indexed. Closed unless the `people` release is open to this reader; the
 * API's own 404 (hidden, removed, unknown) is the screen's not-found state.
 * No `loading.tsx` above it, so `notFound()` stays a 404 (`loading.test.ts`).
 */
export const metadata: Metadata = {
  title: "A group",
  robots: privateRobotsMeta,
};

export const dynamic = "force-dynamic";

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  // The page's own `?__scenario=`, honoured in a mocked build only.
  const scenario =
    typeof query.__scenario === "string" ? query.__scenario : undefined;
  if (!(await requestReleaseOpen("people", scenario).catch(() => false))) {
    return notFound();
  }
  return <GroupScreen slug={slug} />;
}
