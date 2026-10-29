import type { Metadata } from "next";
import { GuestPage } from "./guest-page";
import { privateRobotsMeta } from "@/lib/site/indexing";
import { pageMetadata } from "@/lib/site/metadata";

/**
 * The page a friend opens from a plan's WhatsApp link, `/p/#<token>`
 * (yuvoy-mobile#373).
 *
 * ## One static shell for every plan
 *
 * The token is after the `#`, and a browser never sends a fragment. So this
 * server never learns which plan a visit is for, WhatsApp's preview of the
 * link shows no plan title, and the HTML is the same for every plan and every
 * person: built once, cached anywhere, signed off in `check-prerender.mjs`.
 * Everything about the plan is fetched by script, through this app's own
 * route handlers under `/p/api/`, with the token in a JSON body.
 *
 * `noindex`, and `/p/` is in PRIVATE_ROUTES: a crawler that followed a shared
 * link would index the same empty shell under every plan's address.
 *
 * Not wrapped in `gatedRoute`: a friend the planner sends the link to need
 * not hold an invitation to Yuvoy, so the page stays open with the invite
 * gate on.
 */

const TITLE = "A plan on Yuvoy";
// The words WhatsApp shows under the link, the same for every plan.
const DESCRIPTION = "A plan on Yuvoy. Open the link to reply.";

export const metadata: Metadata = {
  ...pageMetadata({
    title: TITLE,
    description: DESCRIPTION,
    path: "/p",
    absoluteTitle: true,
  }),
  robots: privateRobotsMeta,
};

export default function PlanLinkPage() {
  return (
    <>
      <noscript>
        <p className="text-paper/70 text-body mx-auto max-w-sm px-6 py-16 text-center text-pretty">
          Turn on JavaScript to see this plan and reply. Your phone&apos;s own
          browser works too.
        </p>
      </noscript>
      <GuestPage />
    </>
  );
}
