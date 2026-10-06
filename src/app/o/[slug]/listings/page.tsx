import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createApiClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { OperatorListingsScreen } from "@/components/operator/operator-listings-screen";
import { pageMetadata } from "@/lib/site/metadata";
import type { components } from "@/lib/api/schema.gen";

type OperatorProfile = components["schemas"]["OperatorProfile"];

/**
 * What a business runs — yuvoy-app#33.
 *
 * The same shape as `/o/[slug]`: a server component for the metadata and the
 * 404, seeding the screen so the first paint is server-rendered. This route is
 * indexable and a body that only exists once JavaScript runs is not indexable
 * content.
 */
export const revalidate = 300;

/*
  Each business's list is rendered on its first visit, then served from the
  cache for five minutes and refreshed in the background.

  The empty list is load-bearing. Without `generateStaticParams` the
  `revalidate` above did nothing: Next caches a dynamic segment only when its
  page declares its params, so every visit was a fresh server render (a 1.0s
  first byte, production readiness 6 Oct 2026). `scripts/check-prerender.mjs`
  fails the build if it comes back.
*/
export const dynamicParams = true;

export function generateStaticParams(): { slug: string }[] {
  return [];
}

// Read once per render though the metadata and the page both ask: a read
// with a deadline is not memoised by Next, so React's `cache` shares it.
const getOperator = cache(
  async (slug: string): Promise<OperatorProfile | null> => {
    const api = createApiClient();
    try {
      const { data, error } = await api.GET("/operators/{slug}", {
        params: { path: { slug } },
      });
      if (error) throw error;
      return data;
    } catch (err) {
      if (err instanceof YuvoyError && err.code === "not_found") return null;
      // Anything else is a real failure: let it throw to error.tsx rather than
      // rendering a 404 for what is actually an outage.
      throw err;
    }
  },
);

/**
 * The profile, with the moment it was read. The page is cached, so the seed
 * can be older than the client's own freshness window, and the screen needs
 * its age to know whether to read it again.
 */
async function readOperator(
  slug: string,
): Promise<{ operator: OperatorProfile; readAt: number } | null> {
  const operator = await getOperator(slug);
  return operator ? { operator, readAt: Date.now() } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const operator = await getOperator(slug);
  if (!operator) return { title: "Not found" };

  /*
    No count in the description, and no adjectives. The number of listings
    moves as an operator pauses and resumes, and a description baked at
    revalidate time would state yesterday's. The name and the place are facts
    that hold.
  */
  return pageMetadata({
    title: `What ${operator.name} runs`,
    description: `Every experience ${operator.name} has on sale in the Andaman Islands.`,
    path: `/o/${slug}/listings`,
  });
}

export default async function OperatorListingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const read = await readOperator(slug);
  if (!read) notFound();

  return (
    <OperatorListingsScreen
      slug={slug}
      initial={read.operator}
      readAt={read.readAt}
    />
  );
}
