import type { Metadata } from "next";
import { SavedScreen } from "@/components/saved/saved-screen";
import { gatedRoute } from "@/components/auth/gated-route";
import { privateRobotsMeta } from "@/lib/site/indexing";

export const metadata: Metadata = {
  title: "Saved",
  robots: privateRobotsMeta,
};

/**
 * The wishlist.
 *
 * `noindex`, and for a plainer reason than the token-bearing routes: there is
 * nothing here to index. The page renders a signed-in account's saves or this
 * browser's, so a crawler sees an empty list, and an indexed "Saved" that is
 * always empty is worse than no result at all.
 */
export default async function SavedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /*
    Behind the invite gate when it is on (yuvoy-api#195): saving is one of the
    four things it asks for. With the switch off nothing here reads the
    cookie or the query, so the page stays static, as `check-prerender.mjs`
    requires.
  */
  return gatedRoute({
    purpose: "save",
    searchParams,
    back: { href: "/account", label: "your account" },
    stageLabel: "Saved",
    width: "lg",
    content: () => <SavedScreen />,
  });
}
