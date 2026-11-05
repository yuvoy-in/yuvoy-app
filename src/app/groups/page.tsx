import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { requestReleaseOpen } from "@/lib/auth/request-cohort";
import { privateRobotsMeta } from "@/lib/site/indexing";
import { PLACE_COOKIE, isPlaceKey } from "@/lib/site/place-choice";
import { GroupsScreen } from "@/components/groups/groups-screen";

/**
 * The groups directory (yuvoy-mobile#386), served here until People has its
 * Groups tab (yuvoy-app#222), which will render the same screen.
 *
 * Closed unless the `people` release is open to this reader, decided on the
 * server so nothing paints and then hides. No `loading.tsx` above it: a
 * boundary streams a 200 first, and `notFound()` could no longer make it a
 * 404 (`loading.test.ts`). Never indexed.
 */
export const metadata: Metadata = {
  title: "Groups",
  robots: privateRobotsMeta,
};

export const dynamic = "force-dynamic";

async function rememberedPlace(): Promise<string | null> {
  try {
    const value = (await cookies()).get(PLACE_COOKIE)?.value;
    return isPlaceKey(value) ? value : null;
  } catch {
    return null;
  }
}

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  // The page's own `?__scenario=`, honoured in a mocked build only.
  const scenario =
    typeof query.__scenario === "string" ? query.__scenario : undefined;
  const [open, remembered] = await Promise.all([
    requestReleaseOpen("people", scenario).catch(() => false),
    rememberedPlace(),
  ]);
  if (!open) return notFound();

  const place = isPlaceKey(query.place) ? query.place : null;
  return <GroupsScreen place={place} remembered={remembered} />;
}
