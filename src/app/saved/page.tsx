import type { Metadata } from "next";
import { SavedScreen } from "@/components/saved/saved-screen";
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
export default function SavedPage() {
  return <SavedScreen />;
}
