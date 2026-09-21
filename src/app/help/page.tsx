import type { Metadata } from "next";
import { HelpCenter } from "@/components/support/help-center";
import { pageMetadata } from "@/lib/site/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Help",
  description:
    "How booking, paying and cancelling work on Yuvoy, and how to reach a person.",
  path: "/help",
});

/**
 * The Help Center.
 *
 * Indexable, unlike the rest of the signed-in app: every answer on it is
 * static, none of it is anybody's data, and "how do I cancel a Yuvoy booking"
 * is a question people type into a search engine before they think to open the
 * app. It is the one screen here that is better for being findable.
 */
export default function HelpPage() {
  return <HelpCenter />;
}
