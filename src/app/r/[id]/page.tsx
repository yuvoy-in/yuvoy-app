import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createApiClient, serverScenarioHeaders } from "@/lib/api/client";
import { pageMetadata } from "@/lib/site/metadata";
import { privateRobotsMeta } from "@/lib/site/indexing";
import { ReelScreen } from "@/components/feed/reel-screen";
import type { Reel } from "@/lib/feed/reels";

/**
 * One reel, by its own link — yuvoy-app#36.
 *
 * Share on a reel used to send `/e/{slug}`, so a clip somebody chose to pass on
 * arrived as a page about the listing. This is the address that opens the clip.
 * `id` is the `media.id` every feed card already carries, so the app builds the
 * link out of data it already holds.
 *
 * ## A hidden reel and one that never existed answer the same way
 *
 * The contract is explicit: `GET /reels/{id}` applies the feed's own
 * visibility rule, and anything failing it is a `404` — a withdrawn clip, a
 * listing that stopped being sellable, a malformed id from a link that was cut
 * short in a message. This page must not tell those apart either, so every
 * failure is one `notFound()`.
 *
 * ## Never indexed
 *
 * Two independent reasons, both in `PRIVATE_ROUTES`: the address legitimately
 * dies when a listing pauses, and `/e/{slug}` is the indexable page about the
 * same experience. `privateRobotsMeta` carries it for crawlers that ignore
 * robots.txt.
 */
export const dynamic = "force-dynamic";

async function getReel(id: string, scenario?: string): Promise<Reel | null> {
  try {
    const api = createApiClient();
    const { data, error } = await api.GET("/reels/{id}", {
      params: { path: { id } },
      headers: serverScenarioHeaders(scenario),
    });
    if (error) throw error;
    return data ?? null;
  } catch {
    /*
      Swallowed on purpose, and this is the one place in the app where that is
      right. Every reason this can fail — a 404, a 503 while the catalogue is
      down, a malformed id — ends at the same screen for the person holding the
      link, and distinguishing them would mean telling somebody that a reel
      exists but is not visible, which is what the contract's single 404 exists
      to avoid saying.
    */
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const reel = await getReel(id);

  /*
    The title is the listing's, because that is the only honest name for a
    clip: reels have no titles of their own, and inventing one would be a claim
    about a thing nobody wrote. No price, no rating, no availability — a share
    preview is structured data by another name.
  */
  return {
    ...pageMetadata({
      title: reel?.experience?.title ?? "A reel on Yuvoy",
      description:
        reel?.experience?.location != null
          ? `Watch this, then book a seat. ${reel.experience.location}, Andaman Islands.`
          : "Watch this, then book a seat on it. Andaman Islands.",
      path: `/r/${id}`,
    }),
    robots: privateRobotsMeta,
  };
}

export default async function ReelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const raw = query.__scenario;
  const scenario = typeof raw === "string" ? raw : undefined;

  const reel = await getReel(id, scenario);
  // Both halves are optional in the contract and a reel with neither is not a
  // reel. The feed drops such an item; a page about one has nothing to draw.
  if (!reel?.media || !reel.experience) notFound();

  return <ReelScreen reel={reel} />;
}
