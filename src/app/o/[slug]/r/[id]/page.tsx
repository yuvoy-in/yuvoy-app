import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createApiClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { OperatorReelScreen } from "@/components/operator/operator-reel-screen";
import { pageMetadata } from "@/lib/site/metadata";
import { privateRobotsMeta } from "@/lib/site/indexing";
import type { components } from "@/lib/api/schema.gen";

type OperatorProfile = components["schemas"]["OperatorProfile"];

/**
 * One of a business's reels, playing — yuvoy-app#33.
 *
 * ## Why the id is not validated here
 *
 * The route checks the BUSINESS exists and hands the screen page one of their
 * reels. Whether this id is among them is a question about a paged list, and
 * answering it on the server would mean walking every cursor before rendering
 * anything. The screen pages forward until it finds the reel, and says so if it
 * runs out — which is also the honest answer for a clip taken down since the
 * grid was drawn.
 *
 * ## Never indexed
 *
 * Same two reasons as `/r/[id]`: a reel's address dies when its listing pauses,
 * and the business's own page is the indexable one. It is in `PRIVATE_ROUTES`
 * as `/o/*​/r/`.
 */
export const dynamic = "force-dynamic";

async function getOperator(slug: string): Promise<OperatorProfile | null> {
  const api = createApiClient();
  try {
    const { data, error } = await api.GET("/operators/{slug}", {
      params: { path: { slug } },
    });
    if (error) throw error;
    return data;
  } catch (err) {
    if (err instanceof YuvoyError && err.code === "not_found") return null;
    throw err;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}): Promise<Metadata> {
  const { slug, id } = await params;
  const operator = await getOperator(slug);

  return {
    ...pageMetadata({
      title: operator ? `A reel by ${operator.name}` : "A reel on Yuvoy",
      description: "Watch this, then book a seat on it. Andaman Islands.",
      path: `/o/${slug}/r/${id}`,
    }),
    robots: privateRobotsMeta,
  };
}

export default async function OperatorReelPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const operator = await getOperator(slug);
  if (!operator) notFound();

  return <OperatorReelScreen slug={slug} mediaId={id} initial={operator} />;
}
