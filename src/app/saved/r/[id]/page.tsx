import type { Metadata } from "next";
import { SavedReelScreen } from "@/components/saved/saved-reel-screen";
import { gatedRoute } from "@/components/auth/gated-route";
import { privateRobotsMeta } from "@/lib/site/indexing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Saved",
  robots: privateRobotsMeta,
};

/**
 * A traveller's saves, playing as a reel (the approved redesign, 3 Oct 2026).
 * Private, like the grid it toggles with, and behind the invite gate on the
 * same terms: saving is one of the things the gate asks for.
 */
export default async function SavedReelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  return gatedRoute({
    purpose: "save",
    searchParams,
    back: { href: "/saved", label: "your saved experiences" },
    content: () => <SavedReelScreen experienceId={id} />,
  });
}
