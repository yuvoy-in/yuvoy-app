import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createApiClient } from "@/lib/api/client";
import { YuvoyError } from "@/lib/api/errors";
import { ExperienceDetail } from "@/components/experience/experience-detail";
import { pageMetadata } from "@/lib/site/metadata";
import { breadcrumbJsonLd } from "@/lib/site/structured-data";
import { JsonLd } from "@/components/site/json-ld";
import type { components } from "@/lib/api/schema.gen";

type Experience = components["schemas"]["Experience"];

/**
 * T3 — experience detail.
 *
 * Statically rendered and revalidated. This is the one page in the app worth
 * indexing: it is what a traveller searching "diving havelock" should land on,
 * and it is the reason the app takes the root domain at launch rather than
 * sitting on a subdomain (D-102).
 *
 * The availability picker beneath it is a client component and is NEVER part
 * of this cache — the contract calls availability "the authority on seats",
 * and a statically rendered seat count sells a seat that does not exist.
 */
export const revalidate = 300;

// A slug we have not built is fetched on demand rather than 404'd, so a new
// listing is reachable the moment it publishes instead of at the next deploy.
export const dynamicParams = true;

async function getExperience(slug: string): Promise<Experience | null> {
  const api = createApiClient();
  try {
    const { data, error } = await api.GET("/experiences/{slug}", {
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

export async function generateStaticParams() {
  // The catalog index exists for exactly this: everything with a public page,
  // and when it last changed.
  try {
    const api = createApiClient();
    const { data } = await api.GET("/catalog/index", {});
    return (data?.entries ?? [])
      .filter((entry) => entry.kind === "experience")
      .map((entry) => ({ slug: entry.slug }));
  } catch {
    // A build must not fail because the catalog was briefly unreachable.
    // dynamicParams covers every slug this misses.
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const experience = await getExperience(slug);
  if (!experience) return { title: "Not found" };

  // No price, no availability and no rating in the metadata. Structured data
  // and a share card are claims even though neither is visible on the page,
  // and this project's rule is that nothing is published that is not backed
  // by a record. A price in an OG description is the same claim, travelling
  // further than the page it came from.
  return pageMetadata({
    title: experience.title,
    description:
      experience.summary ??
      experience.description ??
      `${experience.title} in the Andaman Islands, with a local operator.`,
    path: `/e/${experience.slug}`,
  });
}

export default async function ExperiencePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const experience = await getExperience(slug);
  if (!experience) notFound();

  return (
    <>
      <JsonLd
        node={breadcrumbJsonLd([
          { name: "Yuvoy", path: "/" },
          { name: experience.title, path: `/e/${experience.slug}` },
        ])}
      />
      <ExperienceDetail experience={experience} />
    </>
  );
}
