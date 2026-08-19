import { Feed } from "@/components/feed/feed";

/**
 * T2 — the reels feed. The core of the product and the app's front door.
 *
 * The feed itself is a client component: it is an infinite, scroll-driven
 * surface and there is nothing here for a crawler. The indexable content is
 * the experience page (`/e/[slug]`), which is static.
 */
export default function FeedPage() {
  return <Feed />;
}
