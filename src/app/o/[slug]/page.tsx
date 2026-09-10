import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createApiClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { OperatorScreen } from "@/components/operator/operator-screen";
import { pageMetadata } from "@/lib/site/metadata";
import { breadcrumbJsonLd } from "@/lib/site/structured-data";
import { JsonLd } from "@/components/site/json-ld";
import type { components } from "@/lib/api/schema.gen";

type OperatorProfile = components["schemas"]["OperatorProfile"];

/**
 * A business, and everything it sells — yuvoy-app#30.
 *
 * A server component purely so the page can carry metadata and a 404: the
 * screen itself is client-rendered, because the reel grid pages and the whole
 * profile is a live read.
 *
 * Not statically generated, unlike `/e/[slug]`. There is no catalog index of
 * operators to build from, and a business's listings and reel count change
 * more often than a listing's own copy does.
 */
export const revalidate = 300;

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
    // Anything else is a real failure: let it throw to error.tsx rather than
    // rendering a 404 for what is actually an outage.
    throw err;
  }
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
    No counts and no "verified" in the description. Both are true today and
    neither is stable, and a share card outlives the page it came from — the
    same rule the experience page follows about prices.
  */
  return pageMetadata({
    title: operator.name,
    description: operator.locations?.length
      ? `${operator.name} runs trips in ${operator.locations.join(", ")}, in the Andaman Islands.`
      : `${operator.name}, an operator in the Andaman Islands.`,
    path: `/o/${operator.slug}`,
  });
}

export default async function OperatorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const operator = await getOperator(slug);
  if (!operator) notFound();

  return (
    <>
      <JsonLd
        node={breadcrumbJsonLd([
          { name: "Yuvoy", path: "/" },
          { name: operator.name, path: `/o/${operator.slug}` },
        ])}
      />
      <OperatorScreen slug={slug} />
    </>
  );
}
